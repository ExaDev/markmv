import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The same cooldown pnpm itself enforces at install time (pnpm-workspace.yaml's minimumReleaseAge, in minutes), read from the one place it's declared rather than restated here -- a PR that clears this check is a PR pnpm would actually agree to install.
 */
export function minimumAgeMsFromWorkspaceConfig(
  workspaceYamlText: string,
): number {
  const parsed: unknown = parse(workspaceYamlText);
  if (!isRecord(parsed) || typeof parsed.minimumReleaseAge !== "number") {
    throw new Error(
      "pnpm-workspace.yaml has no numeric minimumReleaseAge setting",
    );
  }
  return parsed.minimumReleaseAge * 60 * 1000;
}

export interface PackageVersion {
  name: string;
  version: string;
}

export function packageVersionsFromLockfile(yamlText: string): Set<string> {
  const doc: unknown = parse(yamlText);
  if (!isRecord(doc) || !isRecord(doc.packages)) {
    throw new Error("pnpm-lock.yaml has no `packages` map");
  }
  const entries = new Set<string>();
  for (const key of Object.keys(doc.packages)) {
    entries.add(key.replace(/(\([^)]*\))+$/, ""));
  }
  return entries;
}

export function splitNameAndVersion(nameAtVersion: string): PackageVersion {
  const at = nameAtVersion.lastIndexOf("@");
  return {
    name: nameAtVersion.slice(0, at),
    version: nameAtVersion.slice(at + 1),
  };
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

function publishedAt(name: string, version: string): Date {
  let raw: string;
  try {
    raw = execFileSync("pnpm", ["info", name, "time", "--json"], {
      encoding: "utf8",
    });
  } catch (error) {
    throw new Error(`pnpm info ${name} time --json failed: ${String(error)}`, {
      cause: error,
    });
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || typeof parsed[version] !== "string") {
    throw new Error(
      `pnpm info ${name} time --json had no timestamp for version ${version}`,
    );
  }
  return new Date(parsed[version]);
}

// Exit codes are load-bearing for the caller (dependabot-auto-merge.yml): 1 means "a genuinely too-new package, skip this PR until it ages out" (routine, expected); 2 means "this script itself failed for an unrelated reason" (git/registry error, bad data) and must surface distinctly so a real problem doesn't get silently misreported as a grace period wait forever.
function failUnexpected(message: string): never {
  console.log(`::error::${message}`);
  process.exit(2);
}

// Wrapped in a main guard so the pure helpers above stay importable from the test suite: node executes this file directly for real runs, and the unit tests import the helpers without triggering any git or registry activity.
function main(): void {
  const prNumber = process.argv[2];
  if (!prNumber) {
    failUnexpected("usage: check-dependency-age.ts <PR_NUMBER>");
  }

  try {
    // Fetched explicitly rather than trusting the ambient checkout's HEAD/origin state -- what HEAD points at differs by trigger (schedule/workflow_dispatch check out main directly; a pull_request_target trigger checks out the base branch too, but the PR's own head commit still needs fetching separately to read its lockfile).
    const mainRef = "refs/remotes/origin/base-main";
    const prRef = `refs/remotes/origin/pr-${prNumber}`;
    git(["fetch", "--depth", "1", "origin", `+main:${mainRef}`]);
    git(["fetch", "--depth", "1", "origin", `+pull/${prNumber}/head:${prRef}`]);

    const baseLockfile = git(["show", `${mainRef}:pnpm-lock.yaml`]);
    const headLockfile = git(["show", `${prRef}:pnpm-lock.yaml`]);
    const minimumAgeMs = minimumAgeMsFromWorkspaceConfig(
      readFileSync("pnpm-workspace.yaml", "utf8"),
    );

    const basePackages = packageVersionsFromLockfile(baseLockfile);
    const headPackages = packageVersionsFromLockfile(headLockfile);

    const introduced = [...headPackages]
      .filter((entry) => !basePackages.has(entry))
      .map(splitNameAndVersion);

    if (introduced.length === 0) {
      console.log(
        `PR #${prNumber} introduces no new package versions in pnpm-lock.yaml -- nothing to age-check.`,
      );
      process.exit(0);
    }

    const now = Date.now();
    const tooNew = introduced
      .map((pkg) => ({ pkg, publishedAt: publishedAt(pkg.name, pkg.version) }))
      .filter(({ publishedAt }) => now - publishedAt.getTime() < minimumAgeMs);

    if (tooNew.length > 0) {
      const minimumAgeDays = minimumAgeMs / (24 * 60 * 60 * 1000);
      for (const { pkg, publishedAt } of tooNew) {
        const ageDays = (
          (now - publishedAt.getTime()) /
          (24 * 60 * 60 * 1000)
        ).toFixed(1);
        console.log(
          `PR #${prNumber}: ${pkg.name}@${pkg.version} was published ${ageDays} days ago -- waiting for the ${String(minimumAgeDays)}-day grace period.`,
        );
      }
      process.exit(1);
    }

    console.log(
      `PR #${prNumber}: all ${String(introduced.length)} newly introduced package version(s) clear the release-age cooldown.`,
    );
  } catch (error) {
    failUnexpected(
      `dependency age check crashed for PR #${prNumber}: ${String(error)}`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
