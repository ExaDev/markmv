import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { satisfies } from "semver";
import { Document, parse, parseDocument } from "yaml";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

export interface AuditAdvisory {
  module_name: string;
  vulnerable_versions: string;
  patched_versions: string;
  severity: string;
  github_advisory_id: string;
  title: string;
  url: string;
}

export interface AuditReport {
  advisories: Record<string, AuditAdvisory>;
}

interface Candidate {
  advisories: AuditAdvisory[];
  overrideKey: string;
  range: string;
}

export interface Classified {
  deferred: { advisory: AuditAdvisory; reason: string }[];
  candidates: Candidate[];
}

const WORKSPACE_FILE = "pnpm-workspace.yaml";
const LOCKFILE = "pnpm-lock.yaml";
const auditLevel = process.env.AUDIT_LEVEL ?? "high";

// pnpm audits its own pinned binary (module_name "pnpm") alongside the npm dependency graph. That finding isn't fixable via `overrides` -- overrides only steer node_modules resolution, not which pnpm binary CI invokes -- so it always goes straight to deferred.
const NOT_OVERRIDABLE = new Set(["pnpm"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAuditAdvisory(value: unknown): value is AuditAdvisory {
  if (!isRecord(value)) return false;
  return (
    typeof value.module_name === "string" &&
    typeof value.vulnerable_versions === "string" &&
    typeof value.patched_versions === "string" &&
    typeof value.severity === "string" &&
    typeof value.github_advisory_id === "string" &&
    typeof value.title === "string" &&
    typeof value.url === "string"
  );
}

export function isAuditReport(value: unknown): value is AuditReport {
  if (!isRecord(value)) return false;
  if (!("advisories" in value) || !isRecord(value.advisories)) return false;
  return Object.values(value.advisories).every(isAuditAdvisory);
}

function runAudit(): AuditReport {
  const result = spawnSync(
    "pnpm",
    ["audit", "--audit-level", auditLevel, "--json"],
    {
      encoding: "utf8",
    },
  );
  if (!result.stdout) {
    throw new Error(
      `pnpm audit produced no stdout (spawn error: ${String(result.error)}, stderr: ${result.stderr})`,
    );
  }
  const parsed: unknown = JSON.parse(result.stdout);
  if (!isAuditReport(parsed)) {
    throw new Error(
      "pnpm audit --json output did not match the expected shape",
    );
  }
  return parsed;
}

function githubAdvisoryIdsIn(report: AuditReport): Set<string> {
  return new Set(
    Object.values(report.advisories).map((a) => a.github_advisory_id),
  );
}

function readWorkspaceDoc(): Document {
  return parseDocument(readFileSync(WORKSPACE_FILE, "utf8"));
}

function writeWorkspaceDoc(doc: Document): void {
  writeFileSync(WORKSPACE_FILE, doc.toString());
}

// Mutates a clone rather than the original document, and preserves every other key and comment in pnpm-workspace.yaml (minimumReleaseAge, nodeLinker, allowBuilds) -- a naive parse-to-object-then-JSON.stringify round trip would silently discard all of that.
export function withOverrides(
  workspace: Document,
  overrides: Record<string, string>,
): Document {
  const cloned = workspace.clone();
  // An empty map is written as a bare `overrides: {}` line that never goes away on its own -- deleting the key when there is nothing to override keeps a fully-pruned file clean instead of accumulating dead boilerplate.
  if (Object.keys(overrides).length === 0) {
    cloned.delete("overrides");
  } else {
    cloned.set("overrides", overrides);
  }
  return cloned;
}

export function currentOverrides(workspace: Document): Record<string, string> {
  const parsed: unknown = workspace.toJS();
  const overrides =
    isRecord(parsed) && isRecord(parsed.overrides) ? parsed.overrides : {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

function restoreFromGit(): void {
  spawnSync("git", ["checkout", "--", LOCKFILE, WORKSPACE_FILE], {
    encoding: "utf8",
  });
  // `pnpm update` only touches the packages it's told to; a plain `git checkout` restores the two tracked files but leaves node_modules linked against whatever the last attempt resolved, so resync it for whatever runs next (the final re-audit below, or any later step in this same job).
  spawnSync("pnpm", ["install", "--frozen-lockfile"], { encoding: "utf8" });
}

function setOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;
  appendFileSync(outputFile, `${name}=${value}\n`);
}

function appendSummary(markdown: string): void {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return;
  appendFileSync(summaryFile, markdown);
}

function fail(message: string): never {
  restoreFromGit();
  console.log(`::error::${message}`);
  process.exit(1);
}

// pnpm's own exit code from `update` is not a reliable signal that an override actually took effect -- an unsatisfiable override (no published version clears it) still exits 0, silently leaving the package at whatever it could otherwise resolve. The only trustworthy signal is re-auditing and checking whether each candidate's own specific advisories are gone. A non-zero exit from `update` itself does mean something more fundamental broke (e.g. an unresolvable peer conflict) and is reported as `conflicted` so the caller can isolate which candidate is responsible.
function attemptBatch(
  workspace: Document,
  baseOverrides: Record<string, string>,
  batch: Candidate[],
): { succeeded: Candidate[]; conflicted: boolean } {
  const overrides = { ...baseOverrides };
  for (const c of batch) overrides[c.overrideKey] = c.range;
  writeWorkspaceDoc(withOverrides(workspace, overrides));

  const names = [
    ...new Set(batch.flatMap((c) => c.advisories.map((a) => a.module_name))),
  ];
  const updated =
    spawnSync("pnpm", ["update", ...names], { encoding: "utf8" }).status === 0;
  if (!updated) {
    return { succeeded: [], conflicted: true };
  }

  const present = githubAdvisoryIdsIn(runAudit());
  const succeeded = batch.filter((c) =>
    c.advisories.every((a) => !present.has(a.github_advisory_id)),
  );
  return { succeeded, conflicted: false };
}

// A single candidate whose override the registry can never satisfy (or that conflicts with peers) must not sink every other, independently-fixable candidate in the same batch. attemptBatch's own audit check already tells us exactly which candidates in a batch succeeded when the update itself ran cleanly, so bisection is only needed to isolate a genuine `conflicted` (non-zero exit) failure; if two halves that each update fine independently still conflict combined, fall back to a linear greedy pass, which always terminates with a verified-working subset.
function resolveMaximalSubset(
  workspace: Document,
  baseOverrides: Record<string, string>,
  batch: Candidate[],
): Candidate[] {
  if (batch.length === 0) return [];

  const attempt = attemptBatch(workspace, baseOverrides, batch);
  if (!attempt.conflicted) return attempt.succeeded;
  if (batch.length === 1) return [];

  const mid = Math.floor(batch.length / 2);
  const leftOk = resolveMaximalSubset(
    workspace,
    baseOverrides,
    batch.slice(0, mid),
  );
  const rightOk = resolveMaximalSubset(
    workspace,
    baseOverrides,
    batch.slice(mid),
  );
  const combined = [...leftOk, ...rightOk];
  if (combined.length === 0) return [];

  const combinedAttempt = attemptBatch(workspace, baseOverrides, combined);
  if (!combinedAttempt.conflicted) return combinedAttempt.succeeded;

  return greedyResolve(workspace, baseOverrides, combined);
}

function greedyResolve(
  workspace: Document,
  baseOverrides: Record<string, string>,
  batch: Candidate[],
): Candidate[] {
  const working: Candidate[] = [];
  for (const c of batch) {
    const attempt = attemptBatch(workspace, baseOverrides, [...working, c]);
    if (!attempt.conflicted && attempt.succeeded.includes(c)) {
      working.push(c);
    }
  }
  return working;
}

// Splits audit advisories into fixable candidates (grouped by override selector) and deferred entries with a reason each. Pure -- no filesystem, no subprocesses -- so the unit tests cover grouping, dedup, and the not-overridable and no-patch deferral paths through it.
export function classifyAdvisories(advisories: AuditAdvisory[]): Classified {
  const deferred: { advisory: AuditAdvisory; reason: string }[] = [];
  const candidatesByKey = new Map<string, Candidate>();

  for (const advisory of advisories) {
    const overrideKey = `${advisory.module_name}@${advisory.vulnerable_versions}`;

    if (NOT_OVERRIDABLE.has(advisory.module_name)) {
      deferred.push({
        advisory,
        reason:
          "pnpm self-audit finding -- requires bumping the packageManager field, not a dependency override",
      });
      continue;
    }

    if (!advisory.patched_versions || advisory.patched_versions === "<0.0.0") {
      deferred.push({
        advisory,
        reason: "no patched version exists upstream yet",
      });
      continue;
    }

    // Two distinct advisories can share the exact same module_name + vulnerable_versions (hence the same override selector) with different patched_versions -- group them under one override attempt rather than silently dropping the second, so every advisory still gets a fixed/deferred outcome and a line in the summary.
    const existing = candidatesByKey.get(overrideKey);
    if (existing) {
      existing.advisories.push(advisory);
      existing.range = advisory.patched_versions;
    } else {
      candidatesByKey.set(overrideKey, {
        advisories: [advisory],
        overrideKey,
        range: advisory.patched_versions,
      });
    }
  }

  return { deferred, candidates: [...candidatesByKey.values()] };
}

// An override is inert when no version its selector could rewrite is present: the selector is the vulnerable range on the key (`pkg@<range>`), and the override only acts on resolutions matching that range. If nothing resolved matches the selector, the override forces nothing today -- regardless of what the package resolves outside the selector. The autofix only ever adds overrides, so without this pass the map accumulates one entry per historical advisory forever. Dropping inert entries is self-correcting rather than risky: if a future update resolves back into a vulnerable range, the next audit run re-adds the override through the same fix path.
export function inertOverrideKeys(
  overrides: Record<string, string>,
  resolvedVersions: Map<string, Set<string>>,
): string[] {
  const inert: string[] = [];
  for (const key of Object.keys(overrides)) {
    const at = key.lastIndexOf("@");
    // A bare `pkg` key (no @range selector) matches every version and is never provably inert; a missing package is left for the same reason.
    if (at <= 0) continue;
    const pkg = key.slice(0, at);
    const selector = key.slice(at + 1);
    const versions = resolvedVersions.get(pkg);
    if (versions === undefined || versions.size === 0) continue;
    if (![...versions].some((v) => satisfies(v, selector))) {
      inert.push(key);
    }
  }
  return inert;
}

// The resolved package@version set from the lockfile's single-document packages map, minus peer-dependency suffixes.
export function resolvedVersionsFromLockfileText(
  yamlText: string,
): Map<string, Set<string>> {
  const doc: unknown = parse(yamlText);
  if (!isRecord(doc) || !isRecord(doc.packages)) {
    throw new Error("lockfile had no packages map");
  }
  const byPackage = new Map<string, Set<string>>();
  for (const key of Object.keys(doc.packages)) {
    const stripped = key.replace(/(\([^)]*\))+$/, "");
    const at = stripped.lastIndexOf("@");
    const pkg = stripped.slice(0, at);
    const version = stripped.slice(at + 1);
    const existing = byPackage.get(pkg) ?? new Set<string>();
    existing.add(version);
    byPackage.set(pkg, existing);
  }
  return byPackage;
}

// Wrapped in a main guard so the helpers above stay importable from the test suite: node executes this file directly for real runs, and the unit tests import the helpers without touching package.json or the lockfile.
function main(): void {
  const initial = runAudit();
  const advisories = Object.values(initial.advisories);
  const initialIds = githubAdvisoryIdsIn(initial);

  const { deferred, candidates } = classifyAdvisories(advisories);
  let fixed: Candidate[] = [];

  if (candidates.length > 0) {
    const workspaceBefore = readWorkspaceDoc();
    const baseOverrides = currentOverrides(workspaceBefore);

    fixed = resolveMaximalSubset(workspaceBefore, baseOverrides, candidates);
    const notFixed = candidates.filter((c) => !fixed.includes(c));

    // Land on a final, clean state: exactly the overrides that verified as fixed, so the committed lockfile never carries an inert entry for a candidate that didn't pan out.
    if (fixed.length > 0) {
      const final = attemptBatch(workspaceBefore, baseOverrides, fixed);
      if (final.conflicted || final.succeeded.length !== fixed.length) {
        fail(
          "Could not reproduce the verified-working override set on the final update pass",
        );
      }
    } else {
      restoreFromGit();
    }

    for (const c of notFixed) {
      for (const advisory of c.advisories) {
        deferred.push({
          advisory,
          reason:
            "no version satisfies both the patched range and the 7-day minimumReleaseAge window yet (or a resolution conflict)",
        });
      }
    }
  }

  // Anything at or above the audit level that wasn't present before this run's changes is a brand-new problem introduced by an override or by its transitive fallout -- never ship that silently just because the advisories we set out to fix are gone.
  const final = runAudit();
  const newlyIntroduced = Object.values(final.advisories).filter(
    (a) => !initialIds.has(a.github_advisory_id),
  );
  if (newlyIntroduced.length > 0) {
    fail(
      `The fix introduced new advisories not present before this run: ${newlyIntroduced.map((a) => `${a.github_advisory_id} (${a.module_name})`).join(", ")}`,
    );
  }

  // Prune inert overrides: entries whose package the lockfile already resolves entirely inside the override's target. The pruned pnpm-workspace.yaml rides the same fix PR, and the pruned state is verified below before it is kept -- anything that regresses restores the pre-prune files.
  let prunedKeys: string[] = [];
  const workspaceNow = readWorkspaceDoc();
  const overridesNow = currentOverrides(workspaceNow);
  const inert = inertOverrideKeys(
    overridesNow,
    resolvedVersionsFromLockfileText(readFileSync(LOCKFILE, "utf8")),
  );
  if (inert.length > 0) {
    const inertSet = new Set(inert);
    const pruned: Record<string, string> = {};
    for (const [key, value] of Object.entries(overridesNow)) {
      if (!inertSet.has(key)) pruned[key] = value;
    }
    writeWorkspaceDoc(withOverrides(workspaceNow, pruned));
    if (spawnSync("pnpm", ["install"], { encoding: "utf8" }).status === 0) {
      const postPrune = runAudit();
      // Clean means: no advisory is present that this run did not start with -- the prune resurrected nothing the fixes removed and introduced nothing new.
      const regressed = Object.values(postPrune.advisories).some(
        (a) => !initialIds.has(a.github_advisory_id),
      );
      if (!regressed) {
        appendSummary(
          `\n### Pruned inert overrides\n\n${inert.map((k) => `- ${k} (every resolved version already satisfies the target)`).join("\n")}\n`,
        );
        console.log(
          `Pruned ${String(inert.length)} inert override(s); the reduced set still audits clean.`,
        );
        prunedKeys = inert;
      } else {
        restoreFromGit();
        console.log(
          "::warning::override prune regressed the audit; keeping the unpruned set.",
        );
      }
    } else {
      restoreFromGit();
      console.log(
        "::warning::override prune install failed; keeping the unpruned set.",
      );
    }
  }

  if (deferred.length > 0) {
    const lines = deferred.map(
      (d) =>
        `::warning::${d.advisory.github_advisory_id} (${d.advisory.module_name}, ${d.advisory.severity}) not auto-fixed: ${d.reason} -- ${d.advisory.url}`,
    );
    console.log(lines.join("\n"));
    appendSummary(
      `\n### Deferred audit findings\n\n| Advisory | Package | Severity | Reason |\n|---|---|---|---|\n${deferred
        .map(
          (d) =>
            `| [${d.advisory.github_advisory_id}](${d.advisory.url}) | ${d.advisory.module_name} | ${d.advisory.severity} | ${d.reason} |`,
        )
        .join("\n")}\n`,
    );
  }

  const fixedAdvisories = fixed.flatMap((c) =>
    c.advisories.map((advisory) => ({
      advisory,
      overrideKey: c.overrideKey,
      range: c.range,
    })),
  );

  if (fixedAdvisories.length > 0) {
    appendSummary(
      `\n### Auto-fixed audit findings\n\n| Advisory | Package | Patched range applied |\n|---|---|---|\n${fixedAdvisories
        .map(
          (f) =>
            `| [${f.advisory.github_advisory_id}](${f.advisory.url}) | ${f.advisory.module_name} | ${f.range} |`,
        )
        .join("\n")}\n`,
    );
    writeFileSync(
      "/tmp/audit-fix-commit-body.txt",
      fixedAdvisories
        .map(
          (f) =>
            `- ${f.advisory.module_name} (${f.overrideKey}) -> ${f.range}: ${f.advisory.github_advisory_id} ${f.advisory.url}`,
        )
        .join("\n"),
    );
  }

  if (prunedKeys.length > 0) {
    // Pruned keys ride the same fix-PR commit body as any fixed advisories in the same run; a prune-only run still needs a body of its own.
    const pruneLines = prunedKeys
      .map(
        (k) =>
          `- prune ${k}: every resolved version already satisfies the override target`,
      )
      .join("\n");
    if (fixedAdvisories.length === 0) {
      writeFileSync("/tmp/audit-fix-commit-body.txt", pruneLines);
    } else {
      appendFileSync("/tmp/audit-fix-commit-body.txt", `\n${pruneLines}`);
    }
  }
  const fixedFlag =
    fixedAdvisories.length > 0 || prunedKeys.length > 0 ? "true" : "false";
  setOutput("fixed", fixedFlag);
  // The CI job invokes this through a composite action, which cannot carry a step's GITHUB_OUTPUT up to the job; the file is the channel the job re-emits from.
  writeFileSync("/tmp/audit-fix-fixed.txt", fixedFlag);

  console.log(
    `Audit complete: ${String(fixedAdvisories.length)} fixed, ${String(deferred.length)} deferred (non-blocking).`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
