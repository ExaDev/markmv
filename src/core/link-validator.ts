import { constants, access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import {
  ContentFreshnessDetector,
  type FreshnessConfig,
} from "../utils/content-freshness.js";
import { AuthDetector, type AuthConfig } from "../utils/auth-detection.js";
import type { BrokenLink, ValidationResult } from "../types/config.js";
import type { MarkdownLink, ParsedMarkdownFile } from "../types/links.js";
import type { WikilinkResolution } from "./obsidian-vault.js";

/** Time an external link check may take before it is abandoned. */
const DEFAULT_EXTERNAL_TIMEOUT_MS = 5000;

/** Lowest HTTP status that denotes a server-side failure. */
const HTTP_SERVER_ERROR_MIN = 500;

/** HTTP status for a rate-limited request, which is retried like a server failure. */
const HTTP_TOO_MANY_REQUESTS = 429;

/** HTTP status for a request lacking valid credentials. */
const HTTP_UNAUTHORIZED = 401;

/** HTTP status for a request the credentials do not permit. */
const HTTP_FORBIDDEN = 403;

/**
 * Configuration options for link validation operations.
 *
 * Controls which types of links are validated and how validation is performed, including external
 * link checking, timeout settings, and strictness levels.
 * @category Core
 */
export interface LinkValidatorOptions {
  /** Check external links (http/https) */
  checkExternal?: boolean;
  /** Timeout for external link checks in milliseconds */
  externalTimeout?: number;
  /** Treat missing files as errors */
  strictInternal?: boolean;
  /** Check Claude import links */
  checkClaudeImports?: boolean;
  /** Enable content freshness detection for external links */
  checkContentFreshness?: boolean;
  /** Configuration for content freshness detection */
  freshnessConfig?: Partial<FreshnessConfig>;
  /** Enable authentication-aware link validation */
  enableAuthDetection?: boolean;
  /** Configuration for authentication detection */
  authConfig?: Partial<AuthConfig>;
  /** Treat auth-required links as valid (not broken) */
  allowAuthRequired?: boolean;
  /** Check Obsidian wikilinks against the vault */
  checkWikilinks?: boolean;
  /** External-link hostnames excluded from checking entirely (known problematic sites) */
  skipDomains?: string[];
  /** Extra attempts for transient external failures (network errors, 5xx, 429) */
  externalRetries?: number;
  /** Resolver for wikilink targets against the whole vault file set */
  wikilinkResolver?: (target: string) => WikilinkResolution;
}

/**
 * Validates markdown links and identifies broken or problematic references.
 *
 * The LinkValidator checks various types of links including internal file references, external
 * URLs, and Claude import syntax. It provides comprehensive reporting of validation issues and
 * supports different validation modes for different use cases.
 * @category Core
 * @example
 * Basic link validation
 * ```typescript
 * const validator = new LinkValidator({
 *     checkExternal: true,
 *     strictInternal: true,
 *     externalTimeout: 10000
 * });
 *
 * const result = await validator.validateFile('docs/api.md');
 *
 * if (!result.isValid) {
 *   console.log(`Found ${result.brokenLinks.length} broken links`);
 *   result.brokenLinks.forEach(link => {
 *       console.log(`- ${link.href} (line ${link.line}): ${link.reason}`);
 *   });
 * }
 * ```
 * @example
 * Batch validation
 * ```typescript
 * const validator = new LinkValidator();
 * const files = ['docs/guide.md', 'docs/api.md', 'docs/examples.md'];
 *
 * const results = await validator.validateFiles(files);
 * const totalBroken = results.reduce((sum, r) => sum + r.brokenLinks.length, 0);
 * console.log(`Found ${totalBroken} broken links across ${files.length} files`);
 * ```
 */
export class LinkValidator {
  private readonly options: Required<
    Omit<
      LinkValidatorOptions,
      "freshnessConfig" | "authConfig" | "wikilinkResolver"
    >
  > & {
    freshnessConfig?: Partial<FreshnessConfig>;
    authConfig?: Partial<AuthConfig>;
    wikilinkResolver?: (target: string) => WikilinkResolution;
  };

  private readonly freshnessDetector?: ContentFreshnessDetector;

  private readonly authDetector?: AuthDetector;

  /**
   * Creates a validator, filling any option left unset with its default: external links unchecked, a 5000 ms external timeout, missing internal files treated as errors, Claude imports checked, freshness and authentication detection off, authentication-required links allowed, wikilinks unchecked, no skipped domains and 2 retries for transient external failures. The freshness and authentication detectors are created only when their option is enabled.
   * @param options - Validation options.
   */
  constructor(options: LinkValidatorOptions = {}) {
    this.options = {
      checkExternal: options.checkExternal ?? false,
      externalTimeout: options.externalTimeout ?? DEFAULT_EXTERNAL_TIMEOUT_MS,
      strictInternal: options.strictInternal ?? true,
      checkClaudeImports: options.checkClaudeImports ?? true,
      checkContentFreshness: options.checkContentFreshness ?? false,
      enableAuthDetection: options.enableAuthDetection ?? false,
      allowAuthRequired: options.allowAuthRequired ?? true,
      checkWikilinks: options.checkWikilinks ?? false,
      skipDomains: options.skipDomains ?? [],
      externalRetries: options.externalRetries ?? 2,
      ...(options.wikilinkResolver
        ? { wikilinkResolver: options.wikilinkResolver }
        : {}),
      ...(options.freshnessConfig && {
        freshnessConfig: options.freshnessConfig,
      }),
      ...(options.authConfig && { authConfig: options.authConfig }),
    };

    if (this.options.checkContentFreshness) {
      this.freshnessDetector = new ContentFreshnessDetector(
        this.options.freshnessConfig,
      );
    }

    if (this.options.enableAuthDetection) {
      this.authDetector = new AuthDetector(this.options.authConfig);
    }
  }

  /**
   * Validates every link in each of the given files.
   * @param files - Parsed markdown files to check.
   * @returns A result that is valid only when no broken links were found, with the number of files and links checked.
   */
  async validateFiles(
    files: readonly ParsedMarkdownFile[],
  ): Promise<ValidationResult> {
    const brokenLinks: BrokenLink[] = [];
    const warnings: string[] = [];
    let linksChecked = 0;

    for (const file of files) {
      const fileErrors = await this.validateFile(file);
      brokenLinks.push(...fileErrors);
      linksChecked += file.links.length;
    }

    return {
      valid: brokenLinks.length === 0,
      filesChecked: files.length,
      linksChecked,
      brokenLinks,
      warnings,
    };
  }

  /**
   * Validates every link in one file.
   * @param file - Parsed markdown file to check.
   * @returns The broken links found, empty when every link is valid or skipped by the options.
   */
  async validateFile(file: ParsedMarkdownFile): Promise<BrokenLink[]> {
    const brokenLinks: BrokenLink[] = [];

    for (const link of file.links) {
      const broken = await this.validateLink(link, file.filePath);
      if (broken) {
        brokenLinks.push(broken);
      }
    }

    return brokenLinks;
  }

  /**
   * Validates one link according to its type and the validator's options. Link types whose checking is disabled, and reference links, are treated as valid. An unexpected failure while checking is reported as an `invalid-format` broken link rather than thrown.
   * @param link - Link to check.
   * @param sourceFile - Path of the file containing the link.
   * @returns A broken link description, or `null` when the link is valid or not checked.
   */
  async validateLink(
    link: Readonly<MarkdownLink>,
    sourceFile: string,
  ): Promise<BrokenLink | null> {
    try {
      switch (link.type) {
        case "internal":
          return await this.validateInternalLink(link, sourceFile);

        case "claude-import":
          return this.options.checkClaudeImports
            ? await this.validateClaudeImportLink(link, sourceFile)
            : null;

        case "external":
          return this.options.checkExternal
            ? await this.validateExternalLink(link, sourceFile)
            : null;

        case "anchor":
          return await this.validateAnchorLink(link, sourceFile);

        case "image":
          return await this.validateImageLink(link, sourceFile);

        case "reference":
          // Reference links are validated if they resolve to an internal/external link
          return null;

        case "wikilink":
        case "obsidian-transclusion":
          return this.options.checkWikilinks
            ? await this.validateWikilinkLink(link, sourceFile)
            : null;

        default:
          return null;
      }
    } catch (error) {
      return {
        sourceFile,
        link,
        reason: "invalid-format",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async validateInternalLink(
    link: Readonly<MarkdownLink>,
    sourceFile: string,
  ): Promise<BrokenLink | null> {
    if (link.resolvedPath === undefined || link.resolvedPath === "") {
      return {
        sourceFile,
        link,
        reason: "invalid-format",
        details: "Could not resolve internal link path",
      };
    }

    try {
      await access(link.resolvedPath, constants.F_OK);

      // Link is valid
      return null;
    } catch {
      if (this.options.strictInternal) {
        return {
          sourceFile,
          link,
          reason: "file-not-found",
          details: `File does not exist: ${link.resolvedPath}`,
        };
      }

      // Not strict, so ignore missing files
      return null;
    }
  }

  private async validateClaudeImportLink(
    link: Readonly<MarkdownLink>,
    sourceFile: string,
  ): Promise<BrokenLink | null> {
    if (link.resolvedPath === undefined || link.resolvedPath === "") {
      return {
        sourceFile,
        link,
        reason: "invalid-format",
        details: "Could not resolve Claude import path",
      };
    }

    // Claude imports should point to existing files
    try {
      await access(link.resolvedPath, constants.F_OK);

      // Import is valid
      return null;
    } catch {
      return {
        sourceFile,
        link,
        reason: "file-not-found",
        details: `Claude import file does not exist: ${link.resolvedPath}`,
      };
    }
  }

  private async validateExternalLink(
    link: Readonly<MarkdownLink>,
    sourceFile: string,
  ): Promise<BrokenLink | null> {
    /* Domains on the skip list are never contacted -- a site known to block or throttle checkers
       would otherwise surface as broken and drown out real findings */
    try {
      const hostname = new URL(link.href).hostname;
      if (this.options.skipDomains.includes(hostname)) {
        return null;
      }
    } catch {
      return {
        sourceFile,
        link,
        reason: "invalid-format",
        details: `Could not parse external link URL: ${link.href}`,
      };
    }

    try {
      // Prepare headers for request
      const headers: Record<string, string> = {};

      // Check if authentication detection is enabled and analyze the URL first
      let authInfo;
      if (this.authDetector && this.options.enableAuthDetection) {
        headers["User-Agent"] = "markmv-validator/1.0 (authentication-aware)";

        authInfo = this.authDetector.analyzeAuth(link.href);

        // If URL is known to require auth via domain detection, return immediately
        if (authInfo.requiresAuth && authInfo.detectionMethod === "domain") {
          return {
            sourceFile,
            link,
            reason: "auth-required",
            details: authInfo.warning ?? "Link requires authentication",
            authInfo,
          };
        }

        // Add authentication headers if available
        if (this.authDetector.shouldAttemptAuth(link.href)) {
          const authHeaders = this.authDetector.getAuthHeaders(link.href);
          for (const [name, value] of Object.entries(authHeaders)) {
            headers[name] = value;
          }
          authInfo.authAttempted = true;
        }
      }

      // For freshness detection, we need a GET request to read the content
      const method = this.options.checkContentFreshness ? "GET" : "HEAD";
      headers["User-Agent"] ??=
        "markmv-validator/1.0 (content-freshness-detection)";

      const fetchOptions: RequestInit = { method };

      if (Object.keys(headers).length > 0) {
        fetchOptions.headers = headers;
      }

      if (this.options.enableAuthDetection) {
        // Follow redirects to detect auth redirects
        fetchOptions.redirect = "follow";
      }

      /* Transient failures -- network errors, 5xx, 429 -- are retried up to externalRetries
         extra times before the link is reported, each attempt with its own timeout budget */
      const maxAttempts = 1 + this.options.externalRetries;
      let response: Response | undefined;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, this.options.externalTimeout);
        try {
          const attemptResponse = await fetch(link.href, {
            ...fetchOptions,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (
            (attemptResponse.status >= HTTP_SERVER_ERROR_MIN ||
              attemptResponse.status === HTTP_TOO_MANY_REQUESTS) &&
            attempt < maxAttempts - 1
          ) {
            continue;
          }
          response = attemptResponse;
          break;
        } catch (error) {
          clearTimeout(timeoutId);
          if (attempt === maxAttempts - 1) {
            throw error;
          }
        }
      }

      if (!response) {
        return {
          sourceFile,
          link,
          reason: "external-error",
          details: "External check exhausted all attempts without a response",
        };
      }

      // Analyze response for authentication indicators if auth detection is enabled
      if (this.authDetector && this.options.enableAuthDetection && authInfo) {
        const finalAuthInfo = this.authDetector.analyzeAuth(
          link.href,
          response,
        );
        authInfo = { ...authInfo, ...finalAuthInfo };

        if (finalAuthInfo.requiresAuth && this.options.allowAuthRequired) {
          return {
            sourceFile,
            link,
            reason: "auth-required",
            details: finalAuthInfo.warning ?? "Link requires authentication",
            authInfo: finalAuthInfo,
          };
        }
      }

      if (!response.ok) {
        // Check if this is an auth-related error (only if auth detection is enabled)
        if (
          this.options.enableAuthDetection &&
          (response.status === HTTP_UNAUTHORIZED ||
            response.status === HTTP_FORBIDDEN) &&
          this.options.allowAuthRequired
        ) {
          const authErrorInfo = {
            url: link.href,
            requiresAuth: true,
            redirectCount: 0,
            authAttempted:
              this.authDetector?.shouldAttemptAuth(link.href) ?? false,
            detectionMethod: "status-code" as const,
            warning: `HTTP ${String(response.status)}: Authentication required`,
            suggestion:
              "Provide appropriate credentials or API keys to validate this link",
          };

          return {
            sourceFile,
            link,
            reason: "auth-required",
            details: authErrorInfo.warning,
            authInfo: authErrorInfo,
          };
        }

        return {
          sourceFile,
          link,
          reason: "external-error",
          details: `HTTP ${String(response.status)}: ${response.statusText}`,
        };
      }

      // Check content freshness if enabled
      if (this.options.checkContentFreshness && this.freshnessDetector) {
        const content = method === "GET" ? await response.text() : "";
        const responseHeaders: Record<string, string> = {};

        // Convert Headers to plain object
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        const freshnessInfo =
          await this.freshnessDetector.analyzeContentFreshness(link.href, {
            status: response.status,
            headers: responseHeaders,
            content,
            finalUrl: response.url,
          });

        // If content is stale, return as a broken link with freshness info
        if (!freshnessInfo.isFresh) {
          return {
            sourceFile,
            link,
            reason: "content-stale",
            details: freshnessInfo.warning ?? "Content appears to be outdated",
            freshnessInfo,
          };
        }
      }

      // Mark auth as succeeded if we attempted it
      if (authInfo?.authAttempted === true) {
        authInfo.authSucceeded = true;
      }

      // Link is valid, fresh, and accessible
      return null;
    } catch (error) {
      return {
        sourceFile,
        link,
        reason: "external-error",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async validateImageLink(
    link: Readonly<MarkdownLink>,
    sourceFile: string,
  ): Promise<BrokenLink | null> {
    // For external images, use external validation if enabled
    if (link.href.startsWith("http")) {
      return this.options.checkExternal
        ? await this.validateExternalLink(link, sourceFile)
        : null;
    }

    // For internal images, check if file exists
    if (link.resolvedPath === undefined || link.resolvedPath === "") {
      return {
        sourceFile,
        link,
        reason: "invalid-format",
        details: "Could not resolve image path",
      };
    }

    try {
      await access(link.resolvedPath, constants.F_OK);

      // Image exists
      return null;
    } catch {
      return {
        sourceFile,
        link,
        reason: "file-not-found",
        details: `Image file does not exist: ${link.resolvedPath}`,
      };
    }
  }

  /**
   * Combines link validation with circular reference detection across a set of files.
   * @param files - Parsed markdown files to check.
   * @returns A result whose `valid` flag is true only when there are no broken links and no cycles, plus the cycles, the broken links and any warnings.
   */
  async validateLinkIntegrity(files: readonly ParsedMarkdownFile[]): Promise<{
    /** True when there are no broken links and no circular references */
    valid: boolean;
    /** Dependency cycles found, each as a path of files */
    circularReferences: string[][];
    /** Broken links found across the files */
    brokenLinks: BrokenLink[];
    /** Warnings raised during validation, including a note when circular references exist */
    warnings: string[];
  }> {
    const validationResult = await this.validateFiles(files);
    const circularReferences = await this.checkCircularReferences(files);

    const warnings = [...validationResult.warnings];

    if (circularReferences.length > 0) {
      warnings.push(
        `Found ${String(circularReferences.length)} circular reference(s)`,
      );
    }

    return {
      valid: validationResult.valid && circularReferences.length === 0,
      circularReferences,
      brokenLinks: validationResult.brokenLinks,
      warnings,
    };
  }

  /**
   * Validates a specific array of links from a single file.
   * @param links - Array of links to validate
   * @param sourceFile - Path to the source file containing the links
   * @returns Promise resolving to validation result with broken links
   */
  async validateLinks(
    links: readonly MarkdownLink[],
    sourceFile: string,
  ): Promise<{
    /** Broken links found among the given links */
    brokenLinks: BrokenLink[];
  }> {
    const brokenLinks: BrokenLink[] = [];

    for (const link of links) {
      const broken = await this.validateLink(link, sourceFile);
      if (broken) {
        brokenLinks.push(broken);
      }
    }

    return { brokenLinks };
  }

  /**
   * Checks for circular references. With parsed files, follows each file's dependencies and returns every cycle found as a path of files. With plain path strings there is no dependency information to follow, so the result always reports no circular references.
   * @param files - Parsed markdown files or file paths to check.
   * @returns The cycles for parsed files, or a summary object for paths.
   */
  async checkCircularReferences(
    files: readonly ParsedMarkdownFile[],
  ): Promise<string[][]>;
  async checkCircularReferences(files: readonly string[]): Promise<{
    /** Whether a circular reference was found */
    hasCircularReferences: boolean;
    /** Paths forming the circular reference, when one was found */
    circularPaths?: string[] | undefined;
  }>;
  async checkCircularReferences(
    files: readonly ParsedMarkdownFile[] | readonly string[],
  ): Promise<
    | string[][]
    | {
        hasCircularReferences: boolean;
        circularPaths?: string[] | undefined;
      }
  > {
    // Check if we have ParsedMarkdownFile[] (test case) or string[] (normal case)
    if (
      files.length > 0 &&
      typeof files[0] === "object" &&
      "filePath" in files[0]
    ) {
      // ParsedMarkdownFile[] case - check for circular dependencies
      const parsedFiles = files.filter(
        (f): f is ParsedMarkdownFile =>
          typeof f === "object" && "filePath" in f,
      );
      const visited = new Set<string>();
      const recursionStack = new Set<string>();
      const cycles: string[][] = [];

      const detectCycle = (filePath: string, path: readonly string[]): void => {
        if (recursionStack.has(filePath)) {
          // Found a cycle - extract the cycle from the path
          const cycleStart = path.indexOf(filePath);
          const cycle = path.slice(cycleStart).concat(filePath);
          cycles.push(cycle);

          return;
        }

        if (visited.has(filePath)) {
          return;
        }

        visited.add(filePath);
        recursionStack.add(filePath);

        // Find the file and check its dependencies
        const file = parsedFiles.find((f) => f.filePath === filePath);
        if (file?.dependencies) {
          for (const dependency of file.dependencies) {
            detectCycle(dependency, [...path, filePath]);
          }
        }

        recursionStack.delete(filePath);
      };

      // Check each file for cycles
      for (const file of parsedFiles) {
        if (!visited.has(file.filePath)) {
          detectCycle(file.filePath, []);
        }
      }

      return Promise.resolve(cycles);
    } else {
      // string[] case - return basic implementation
      return Promise.resolve({
        hasCircularReferences: false,
      });
    }
  }

  /** Validates a wikilink or transclusion by resolving its target against the vault, reporting ambiguous matches and missing notes. */
  private async validateWikilinkLink(
    link: Readonly<MarkdownLink>,
    sourceFile: string,
  ): Promise<BrokenLink | null> {
    const resolver = this.options.wikilinkResolver;
    if (!resolver) {
      return null;
    }

    const resolution = resolver(link.href);
    if (resolution.ambiguous) {
      return {
        sourceFile,
        link,
        reason: "ambiguous-wikilink",
        details: `Ambiguous wikilink matches ${String(resolution.ambiguous.length)} notes: ${resolution.ambiguous.join(", ")}`,
      };
    }

    const resolvedPath = resolution.resolvedPath;
    if (resolvedPath === undefined || resolvedPath === "") {
      return {
        sourceFile,
        link,
        reason: "file-not-found",
        details: `No note in the vault matches [[${link.href}]]`,
      };
    }

    try {
      await access(resolvedPath, constants.F_OK);

      return null;
    } catch {
      return {
        sourceFile,
        link,
        reason: "file-not-found",
        details: `File does not exist: ${resolvedPath}`,
      };
    }
  }

  /**
   * Validates anchor links by checking if the target heading exists in the file.
   * @param link - The anchor link to validate
   * @param sourceFile - Path to the file containing the link
   * @returns Promise resolving to BrokenLink if invalid, null if valid
   */
  private async validateAnchorLink(
    link: Readonly<MarkdownLink>,
    sourceFile: string,
  ): Promise<BrokenLink | null> {
    try {
      // Extract the anchor from the href (remove the #)
      const anchor = link.href.substring(1);
      if (!anchor) {
        return {
          sourceFile,
          link,
          reason: "invalid-format",
          details: "Empty anchor reference",
        };
      }

      // Read the source file to check for the heading
      const content = await readFile(sourceFile, "utf-8");

      /* Convert anchor to the format used in markdown headings
         GitHub-style anchor generation: lowercase, replace spaces with hyphens, remove special chars */
      const normalizedAnchor = anchor
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]/g, "");

      // Look for headings in the file
      const headingRegex = /^#+\s+(.+)$/gm;
      let match;
      const headings: string[] = [];

      while ((match = headingRegex.exec(content)) !== null) {
        const heading = match[1];
        const normalizedHeading = heading
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^\w-]/g, "");

        headings.push(normalizedHeading);

        // Check if this heading matches our anchor
        if (normalizedHeading === normalizedAnchor) {
          // Anchor is valid
          return null;
        }
      }

      return {
        sourceFile,
        link,
        reason: "file-not-found",
        details: `Anchor "${anchor}" not found. Available headings: ${headings.join(", ")}`,
      };
    } catch (error) {
      return {
        sourceFile,
        link,
        reason: "invalid-format",
        details: `Error validating anchor: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
