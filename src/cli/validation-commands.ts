import type { Command } from "commander";
import { checkLinksCommand } from "../commands/check-links.js";
import {
  validateCommand,
  type ValidateCliOptions,
} from "../commands/validate.js";
import {
  DEFAULT_CACHE_DURATION_MINUTES,
  DEFAULT_CONCURRENCY,
  DEFAULT_EXTERNAL_TIMEOUT_MS,
  DEFAULT_FRESHNESS_THRESHOLD_DAYS,
  DEFAULT_LINK_CHECK_TIMEOUT_MS,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_DELAY_MS,
} from "./defaults.js";

function isRecordOfStrings(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;

  return Object.values(value).every((entry) => typeof entry === "string");
}

function isRecordOfStringRecords(
  value: unknown,
): value is Record<string, Record<string, string>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;

  return Object.values(value).every((entry) => isRecordOfStrings(entry));
}

/**
 * Registers the validation commands on the given commander program.
 * @param program - The commander program to add the commands to
 */
export function registerValidationCommands(program: Command): void {
  program
    .command("validate")
    .description("Find broken links in markdown files")
    .argument(
      "[files...]",
      "Markdown files to validate (supports globs like *.md, **/*.md, defaults to current directory)",
    )
    .option(
      "--link-types <types>",
      "Comma-separated link types to check: internal,external,anchor,image,reference,claude-import",
    )
    .option(
      "--check-external",
      "Enable external HTTP/HTTPS link validation",
      false,
    )
    .option(
      "--external-timeout <ms>",
      "Timeout for external link validation (ms)",
      parseInt,
      DEFAULT_EXTERNAL_TIMEOUT_MS,
    )
    .option("--strict-internal", "Treat missing internal files as errors", true)
    .option("--check-claude-imports", "Validate Claude import paths", true)
    .option(
      "--check-circular",
      "Check for circular references in file dependencies",
      false,
    )
    .option(
      "--check-content-freshness",
      "Enable content freshness detection for external links",
      false,
    )
    .option(
      "--freshness-threshold <days>",
      "Content staleness threshold in days",
      parseInt,
      DEFAULT_FRESHNESS_THRESHOLD_DAYS,
    )
    .option(
      "--max-depth <number>",
      "Maximum depth to traverse subdirectories",
      parseInt,
    )
    .option(
      "--only-broken",
      "Show only broken links, not all validation results",
      true,
    )
    .option("--group-by <method>", "Group results by: file|type", "file")
    .option(
      "--include-context",
      "Include line numbers and context in output",
      false,
    )
    .option(
      "--git-diff <ref>",
      "Only validate files changed since the specified git reference",
    )
    .option("--git-staged", "Only validate files currently staged in git")
    .option(
      "--cache",
      "Enable validation result caching for faster subsequent runs",
    )
    .option("--cache-dir <dir>", "Cache directory path", ".markmv-cache")
    .option("--fail-fast", "Exit immediately on first broken link found")
    .option(
      "--include-dependencies",
      "Include files that depend on changed files",
      true,
    )
    .option(
      "--enable-auth-detection",
      "Enable authentication-aware link validation",
      false,
    )
    .option(
      "--disallow-auth-required",
      "Treat auth-required links as broken instead of valid",
      false,
    )
    .option(
      "--auth-credentials <json>",
      "JSON object with domain:credential mapping for authentication",
    )
    .option(
      "--auth-headers <json>",
      "JSON object with domain-specific headers for authentication",
    )
    .option("-v, --verbose", "Show detailed output with processing information")
    .option("--json", "Output results in JSON format")
    .option(
      "--obsidian",
      "Validate [[wikilinks]] by resolving them against the whole vault",
    )
    .option(
      "--fix",
      "Suggest fixes for broken internal links and apply them interactively on a terminal",
    )
    .option(
      "--skip-domains <domains>",
      "Comma-separated hostnames never contacted for external checks",
    )
    .option(
      "--require-frontmatter <fields>",
      "Comma-separated frontmatter fields every file must define",
    )
    .option(
      "--enforce-link-format <format>",
      "Enforce internal link href form: relative|absolute",
    )
    .option(
      "--explain <file>",
      "Print the recorded stack for a file that failed to parse",
    )
    .addHelpText(
      "after",
      `
  Examples:
    $ markmv validate                                         # Validate current directory
    $ markmv validate docs/**/*.md --check-external --verbose
    $ markmv validate README.md --link-types internal,image --include-context
    $ markmv validate **/*.md --group-by type --only-broken

  Authentication Examples:
    $ markmv validate docs/ --check-external --enable-auth-detection
    $ markmv validate README.md --check-external --enable-auth-detection --verbose
    $ markmv validate docs/ --check-external --enable-auth-detection --disallow-auth-required
    $ markmv validate docs/ --check-external --auth-credentials '{"api.github.com":"Bearer token123"}'
    $ markmv validate docs/ --check-external --auth-headers '{"api.example.com":{"X-API-Key":"key123"}}'

  Authentication Options:
    --enable-auth-detection     Distinguish auth-protected from truly broken links
    --disallow-auth-required    Treat auth-required links as broken (default: treat as valid)
    --auth-credentials          Provide API keys/tokens for authenticated validation
    --auth-headers              Provide custom headers for domain-specific authentication
    $ markmv validate docs/ --check-circular --strict-internal

  Git Integration Examples:
    $ markmv validate --git-diff HEAD~1                      # Only files changed since last commit
    $ markmv validate --git-diff main..HEAD                  # Files changed in current branch vs main
    $ markmv validate --git-staged                           # Only staged files
    $ markmv validate --git-diff HEAD~1 --cache              # Use caching for faster validation
    $ markmv validate --git-staged --fail-fast --cache       # Fast pre-commit validation

  Performance Options:
    --cache                 Enable result caching for faster subsequent runs
    --cache-dir <dir>       Custom cache directory (default: .markmv-cache)
    --fail-fast             Exit on first broken link (faster feedback)
    --git-diff <ref>        Only validate files changed since git reference
    --git-staged            Only validate currently staged files
  Content Freshness Examples:
    $ markmv validate --check-external --check-content-freshness
    $ markmv validate docs/ --check-content-freshness --freshness-threshold 365
    $ markmv validate README.md --check-external --check-content-freshness --verbose

  Link Types:
    internal        Links to other markdown files
    external        HTTP/HTTPS URLs
    anchor          Same-file section links (#heading)
    image           Image references (local and external)
    reference       Reference-style links ([text][ref])
    claude-import   Claude @import syntax (@path/to/file)

  Content Freshness Options:
    --check-content-freshness     Enable staleness detection for external links
    --freshness-threshold <days>  Content staleness threshold (default: 730 days)

  Output Options:
    --group-by file    Group broken links by file (default)
    --group-by type    Group broken links by link type`,
    )
    .action(
      async (
        files: readonly string[],
        options: Readonly<{
          linkTypes?: string;
          checkExternal?: boolean;
          externalTimeout?: number;
          strictInternal?: boolean;
          checkClaudeImports?: boolean;
          checkCircular?: boolean;
          maxDepth?: number;
          checkContentFreshness?: boolean;
          freshnessThreshold?: number;
          onlyBroken?: boolean;
          groupBy?: string;
          includeContext?: boolean;
          enableAuthDetection?: boolean;
          disallowAuthRequired?: boolean;
          authCredentials?: string;
          authHeaders?: string;
          verbose?: boolean;
          json?: boolean;
          obsidian?: boolean;
          fix?: boolean;
          skipDomains?: string;
          externalRetries?: number;
          requireFrontmatter?: string;
          enforceLinkFormat?: string;
          explain?: string;
        }>,
      ) => {
        // Parse comma-separated standards-enforcement options before they enter the typed options
        const skipDomains =
          options.skipDomains !== undefined && options.skipDomains !== ""
            ? options.skipDomains
                .split(",")
                .map((d) => d.trim())
                .filter((d) => d !== "")
            : undefined;
        const requireFrontmatter =
          options.requireFrontmatter !== undefined &&
          options.requireFrontmatter !== ""
            ? options.requireFrontmatter
                .split(",")
                .map((f) => f.trim())
                .filter((f) => f !== "")
            : undefined;
        // An invalid format must fail loudly -- silently disabling enforcement hides the typo
        if (
          options.enforceLinkFormat !== undefined &&
          options.enforceLinkFormat !== "relative" &&
          options.enforceLinkFormat !== "absolute"
        ) {
          console.error(
            `Invalid link format: ${options.enforceLinkFormat}. Valid formats: relative, absolute`,
          );
          process.exitCode = 1;

          return;
        }
        const enforceLinkFormat = options.enforceLinkFormat;

        // Validate the group-by option before it enters the typed options
        const groupBy = options.groupBy ?? "file";
        if (groupBy !== "file" && groupBy !== "type") {
          console.error(
            `Invalid grouping: ${groupBy}. Valid groupings: file, type`,
          );
          process.exitCode = 1;

          return;
        }

        // Parse JSON options
        let authCredentials: Record<string, string> | undefined;
        let authHeaders: Record<string, Record<string, string>> | undefined;

        try {
          if (
            options.authCredentials !== undefined &&
            options.authCredentials !== ""
          ) {
            const parsed: unknown = JSON.parse(options.authCredentials);
            if (!isRecordOfStrings(parsed)) {
              throw new Error(
                "auth-credentials must be a JSON object of string values",
              );
            }
            authCredentials = parsed;
          }
        } catch (error) {
          console.error(
            "Error parsing auth-credentials JSON:",
            error instanceof Error ? error.message : String(error),
          );
          process.exit(1);
        }

        try {
          if (options.authHeaders !== undefined && options.authHeaders !== "") {
            const parsed: unknown = JSON.parse(options.authHeaders);
            if (!isRecordOfStringRecords(parsed)) {
              throw new Error(
                "auth-headers must be a JSON object of objects of string values",
              );
            }
            authHeaders = parsed;
          }
        } catch (error) {
          console.error(
            "Error parsing auth-headers JSON:",
            error instanceof Error ? error.message : String(error),
          );
          process.exit(1);
        }

        /* Map commander's options onto ValidateCliOptions; every declared flag appears here so
           nothing is silently dropped, and optional fields are only set when present */
        const validationOptions: ValidateCliOptions = {
          checkExternal: options.checkExternal ?? false,
          externalTimeout:
            options.externalTimeout ?? DEFAULT_EXTERNAL_TIMEOUT_MS,
          strictInternal: options.strictInternal ?? true,
          checkClaudeImports: options.checkClaudeImports ?? true,
          checkCircular: options.checkCircular ?? false,
          checkContentFreshness: options.checkContentFreshness ?? false,
          freshnessThreshold:
            options.freshnessThreshold ?? DEFAULT_FRESHNESS_THRESHOLD_DAYS,
          onlyBroken: options.onlyBroken ?? true,
          includeContext: options.includeContext ?? false,
          verbose: options.verbose ?? false,
          json: options.json ?? false,
          obsidian: options.obsidian ?? false,
          fix: options.fix ?? false,
          groupBy,
          enableAuthDetection: options.enableAuthDetection ?? false,
          // Invert the flag
          allowAuthRequired: options.disallowAuthRequired !== true,
        };
        if (options.linkTypes !== undefined) {
          validationOptions.linkTypes = options.linkTypes;
        }
        if (options.maxDepth !== undefined) {
          validationOptions.maxDepth = options.maxDepth;
        }
        if (skipDomains !== undefined) {
          validationOptions.skipDomains = skipDomains;
        }
        if (
          options.externalRetries !== undefined &&
          Number.isFinite(options.externalRetries)
        ) {
          validationOptions.externalRetries = options.externalRetries;
        }
        if (requireFrontmatter !== undefined) {
          validationOptions.requireFrontmatter = requireFrontmatter;
        }
        if (enforceLinkFormat !== undefined) {
          validationOptions.enforceLinkFormat = enforceLinkFormat;
        }
        if (options.explain !== undefined) {
          validationOptions.explain = options.explain;
        }
        if (authCredentials !== undefined) {
          validationOptions.authCredentials = authCredentials;
        }
        if (authHeaders !== undefined) {
          validationOptions.authHeaders = authHeaders;
        }

        return validateCommand([...files], validationOptions);
      },
    );

  program
    .command("check-links")
    .description("Check external HTTP/HTTPS links in markdown files")
    .argument(
      "[files...]",
      "Markdown files to check (supports globs, defaults to current directory)",
    )
    .option(
      "--timeout <ms>",
      "Timeout for external link validation (ms)",
      parseInt,
      DEFAULT_LINK_CHECK_TIMEOUT_MS,
    )
    .option(
      "--retry <count>",
      "Number of retry attempts for failed requests",
      parseInt,
      DEFAULT_RETRY_COUNT,
    )
    .option(
      "--retry-delay <ms>",
      "Delay between retry attempts (ms)",
      parseInt,
      DEFAULT_RETRY_DELAY_MS,
    )
    .option(
      "--concurrency <count>",
      "Maximum concurrent requests",
      parseInt,
      DEFAULT_CONCURRENCY,
    )
    .option("--method <method>", "HTTP method to use (HEAD|GET)", "HEAD")
    .option("--no-follow-redirects", "Do not follow HTTP redirects")
    .option(
      "--ignore-status <codes>",
      "Comma-separated HTTP status codes to ignore",
      "403,999",
    )
    .option(
      "--ignore-patterns <patterns>",
      "Comma-separated regex patterns to ignore",
    )
    .option("--no-cache", "Disable result caching")
    .option(
      "--cache-duration <minutes>",
      "Cache duration in minutes",
      parseInt,
      DEFAULT_CACHE_DURATION_MINUTES,
    )
    .option("--no-progress", "Hide progress indicator")
    .option(
      "--format <format>",
      "Output format: text|json|markdown|csv",
      "text",
    )
    .option("--include-response-times", "Include response times in output")
    .option("--include-headers", "Include HTTP headers in detailed output")
    .option(
      "--max-depth <number>",
      "Maximum depth to traverse subdirectories",
      parseInt,
    )
    .option(
      "--group-by <method>",
      "Group results by: file|status|domain",
      "file",
    )
    .option("--output <file>", "Output file path for results")
    .option("--config <file>", "Configuration file path")
    .option("-v, --verbose", "Show detailed output with processing information")
    .option(
      "-d, --dry-run",
      "Show what would be checked without making requests",
    )
    .addHelpText(
      "after",
      `
  Examples:
    $ markmv check-links                                    # Check current directory
    $ markmv check-links docs/**/*.md --verbose            # Check with detailed output
    $ markmv check-links README.md --timeout 15000         # Custom timeout
    $ markmv check-links --retry 5 --retry-delay 2000      # Custom retry logic
    $ markmv check-links --format json > results.json      # JSON output
    $ markmv check-links --format markdown > report.md     # Markdown report
    $ markmv check-links --group-by domain --verbose       # Group by domain
    $ markmv check-links --ignore-patterns "localhost,127.0.0.1" # Ignore patterns
    $ markmv check-links --concurrency 20 --method GET     # High concurrency with GET

  Features:
    🔄 Smart retry logic for temporary failures
    ⚡ Configurable concurrency for parallel checking  
    🗄️  Response caching to avoid re-checking recently validated URLs
    📊 Multiple output formats (text, JSON, markdown, CSV)
    📈 Progress indicators for large documentation sets
    🤖 Bot-detection handling (ignores 403s by default)
    ⏱️  Response time measurement and statistics
    🌐 Domain-based grouping and analysis

  Output Formats:
    text      Human-readable console output (default)
    json      Structured JSON for programmatic use
    markdown  Formatted markdown report
    csv       Comma-separated values for spreadsheets

  Grouping Options:
    file      Group results by file (default)
    status    Group results by HTTP status code
    domain    Group results by domain name`,
    )
    .action(checkLinksCommand);
}
