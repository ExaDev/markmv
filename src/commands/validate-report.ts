import { resolve } from "path";
import type {
  ExtendedBrokenLink,
  ValidateOperationOptions,
  ValidateResult,
} from "./validate.js";

/** Percentage scale for the cache hit rate, which the result stores as 0-100 */
const PERCENT = 100;

/** Whether an optional text field carries content, treating the empty string as absent */
function isPresent(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

/** Whether a broken link detail block should be shown: always for its own reason, otherwise only when verbose */
function showDetail(
  options: Readonly<Pick<ValidateOperationOptions, "verbose">>,
  brokenLink: ExtendedBrokenLink,
  ownReason: ExtendedBrokenLink["reason"],
): boolean {
  return options.verbose === true || brokenLink.reason === ownReason;
}

/** Print the git integration block when git mode was used */
function printGitInfo(result: ValidateResult): void {
  const gitInfo = result.gitInfo;
  if (gitInfo?.enabled !== true) {
    return;
  }
  console.log(`\n🔍 Git Integration`);
  if (isPresent(gitInfo.baseRef)) {
    console.log(
      `Changed since ${gitInfo.baseRef}: ${String(gitInfo.changedFiles)} files`,
    );
  } else {
    console.log(`Staged files: ${String(gitInfo.changedFiles)} files`);
  }
  if (gitInfo.cachedFiles > 0) {
    console.log(
      `Cache hits: ${String(gitInfo.cachedFiles)} files (${String(gitInfo.cacheHitRate)}% hit rate)`,
    );
  }
  console.log();
}

/** Print the cache performance line when git mode and caching were both on */
function printCachePerformance(
  result: ValidateResult,
  cacheEnabled: boolean | undefined,
): void {
  const gitInfo = result.gitInfo;
  if (gitInfo?.enabled !== true || cacheEnabled !== true) {
    return;
  }
  const savedTime =
    gitInfo.cacheHitRate > 0
      ? ` (${String(Math.round(result.processingTime * (gitInfo.cacheHitRate / PERCENT)))}ms saved by cache)`
      : "";
  console.log(
    `Cache performance: ${String(gitInfo.cacheHitRate)}% hit rate${savedTime}`,
  );
}

/** Print the freshness and authentication statistics enabled by the options */
function printLinkStatistics(
  result: ValidateResult,
  options: ValidateOperationOptions,
): void {
  if (options.checkContentFreshness === true) {
    const staleCount = result.staleLinks ?? 0;
    const freshCount = result.freshLinks ?? 0;
    const externalTotal = staleCount + freshCount;

    if (externalTotal > 0) {
      console.log(`Fresh external links: ${String(freshCount)}`);
      console.log(`Stale external links: ${String(staleCount)}`);
    }
  }

  if (options.enableAuthDetection === true) {
    const authRequiredCount = result.authRequiredLinks ?? 0;
    const authenticatedCount = result.authenticatedLinks ?? 0;
    const realBrokenCount = result.brokenLinks - authRequiredCount;

    if (authRequiredCount > 0) {
      console.log(
        `🔒 Authentication-protected links: ${String(authRequiredCount)}`,
      );
    }
    if (authenticatedCount > 0) {
      console.log(
        `✅ Successfully authenticated links: ${String(authenticatedCount)}`,
      );
    }
    if (realBrokenCount > 0) {
      console.log(`❌ Truly broken links: ${String(realBrokenCount)}`);
    }
  }
}

/** Print the summary block that precedes every detailed section */
export function printSummary(
  result: ValidateResult,
  options: ValidateOperationOptions,
): void {
  printGitInfo(result);

  console.log(`📊 Validation Summary`);
  console.log(`Files processed: ${String(result.filesProcessed)}`);
  console.log(`Total links found: ${String(result.totalLinks)}`);
  console.log(`Broken links: ${String(result.brokenLinks)}`);
  console.log(`Processing time: ${String(result.processingTime)}ms`);

  printCachePerformance(result, options.cache);
  console.log();

  printLinkStatistics(result, options);

  console.log(`Processing time: ${String(result.processingTime)}ms\n`);
}

/** Print the frontmatter and link format violation sections */
export function printStandardsViolations(result: ValidateResult): void {
  if (result.frontmatterViolations.length > 0) {
    console.log(
      `📋 Frontmatter Violations (${String(result.frontmatterViolations.length)}):`,
    );
    for (const violation of result.frontmatterViolations) {
      console.log(
        `  ${violation.file}: missing ${violation.missingFields.join(", ")}`,
      );
    }
    console.log();
  }

  if (result.formatViolations.length > 0) {
    console.log(
      `📐 Link Format Violations (${String(result.formatViolations.length)}):`,
    );
    for (const violation of result.formatViolations) {
      console.log(
        `  ${violation.file}:${String(violation.line)} ${violation.href} (expected ${violation.expected})`,
      );
    }
    console.log();
  }
}

/** Print the file error section, or the explain-only message when there were no errors */
export function printFileErrors(
  result: ValidateResult,
  explain: string | undefined,
): void {
  if (result.fileErrors.length === 0) {
    if (isPresent(explain)) {
      console.log(`No parse failure recorded for ${resolve(explain)}\n`);
    }

    return;
  }

  console.log(`⚠️  File Errors (${String(result.fileErrors.length)}):`);
  for (const error of result.fileErrors) {
    console.log(`  ${error.file}: ${error.error}`);
  }

  if (isPresent(explain)) {
    const explainTarget = resolve(explain);
    const entry = result.fileErrors.find(
      (fileError) => fileError.file === explainTarget,
    );
    if (entry === undefined) {
      console.log(`\nNo parse failure recorded for ${explainTarget}`);
    } else {
      console.log(`\n🔍 Parse failure stack for ${entry.file}:`);
      console.log(entry.stack ?? `${entry.error} (no stack recorded)`);
    }
  }
  console.log();
}

/** Print the circular reference section when cycles were detected */
export function printCircularReferences(result: ValidateResult): void {
  if (!result.hasCircularReferences) {
    return;
  }
  console.log(`🔄 Circular References Detected:`);
  for (const cycle of result.circularReferences ?? []) {
    console.log(`  ${cycle}`);
  }
  console.log();
}

/** Print the freshness warning and suggestion lines for a broken link */
function printFreshnessDetails(
  options: ValidateOperationOptions,
  brokenLink: ExtendedBrokenLink,
): void {
  const info = brokenLink.freshnessInfo;
  if (info === undefined || !showDetail(options, brokenLink, "content-stale")) {
    return;
  }
  const verbose = options.verbose === true;
  if (isPresent(info.warning)) {
    console.log(`       Warning: ${info.warning}`);
  }
  if (isPresent(info.suggestion) && verbose) {
    console.log(`       Suggestion: ${info.suggestion}`);
  }
  if (info.lastModified !== undefined && verbose) {
    console.log(`       Last Modified: ${info.lastModified.toDateString()}`);
  }
  if (info.stalePatterns.length > 0 && verbose) {
    console.log(`       Detected patterns: ${info.stalePatterns.join(", ")}`);
  }
}

/** Print the authentication warning, provider and suggestion lines for a broken link */
function printAuthDetails(
  options: ValidateOperationOptions,
  brokenLink: ExtendedBrokenLink,
): void {
  const info = brokenLink.authInfo;
  if (info === undefined || !showDetail(options, brokenLink, "auth-required")) {
    return;
  }
  if (isPresent(info.warning)) {
    console.log(`       Auth: ${info.warning}`);
  }
  if (isPresent(info.authProvider) && options.verbose === true) {
    console.log(`       Provider: ${info.authProvider}`);
  }
  if (isPresent(info.suggestion)) {
    console.log(`       Suggestion: ${info.suggestion}`);
  }
}

/** Print the verbose reason plus freshness and authentication details beneath a broken link line */
function printBrokenLinkDetails(
  options: ValidateOperationOptions,
  brokenLink: ExtendedBrokenLink,
): void {
  if (options.verbose === true) {
    console.log(`       Reason: ${brokenLink.reason}`);
  }
  printFreshnessDetails(options, brokenLink);
  printAuthDetails(options, brokenLink);
}

/** The ` (line N)` suffix shown when context is requested and the link has a line */
function lineContext(
  options: ValidateOperationOptions,
  brokenLink: ExtendedBrokenLink,
): string {
  return options.includeContext && brokenLink.line !== undefined
    ? ` (line ${String(brokenLink.line)})`
    : "";
}

/** The status markers appended to a broken link line */
function statusMarkers(brokenLink: ExtendedBrokenLink): string {
  const freshness = brokenLink.reason === "content-stale" ? " [STALE]" : "";
  const authIndicator = brokenLink.reason === "auth-required" ? " 🔒" : "";

  return `${freshness}${authIndicator}`;
}

/** Print broken links grouped by link type */
function printBrokenLinksByType(
  result: ValidateResult,
  options: ValidateOperationOptions,
): void {
  for (const [linkType, brokenLinks] of Object.entries(
    result.brokenLinksByType,
  )) {
    if (brokenLinks.length === 0) {
      continue;
    }
    console.log(
      `\n  ${linkType.toUpperCase()} (${String(brokenLinks.length)}):`,
    );
    for (const brokenLink of brokenLinks) {
      const file = isPresent(brokenLink.filePath)
        ? ` in ${brokenLink.filePath}`
        : "";
      console.log(
        `    ❌ ${brokenLink.url}${lineContext(options, brokenLink)}${file}${statusMarkers(brokenLink)}`,
      );
      printBrokenLinkDetails(options, brokenLink);
    }
  }
}

/** Print broken links grouped by file */
function printBrokenLinksByFile(
  result: ValidateResult,
  options: ValidateOperationOptions,
): void {
  for (const [filePath, brokenLinks] of Object.entries(
    result.brokenLinksByFile,
  )) {
    console.log(`\n  📄 ${filePath} (${String(brokenLinks.length)} broken):`);
    for (const brokenLink of brokenLinks) {
      console.log(
        `    ❌ [${brokenLink.type}] ${brokenLink.url}${lineContext(options, brokenLink)}${statusMarkers(brokenLink)}`,
      );
      printBrokenLinkDetails(options, brokenLink);
    }
  }
}

/** Print the broken link listing in the grouping the options ask for */
export function printBrokenLinks(
  result: ValidateResult,
  options: ValidateOperationOptions,
): void {
  console.log(`🔗 Broken Links Found:`);

  if (options.groupBy === "type") {
    printBrokenLinksByType(result, options);
  } else {
    printBrokenLinksByFile(result, options);
  }
}
