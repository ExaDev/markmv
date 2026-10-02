/**
 * Represents a section of content to be joined from a markdown file.
 *
 * Contains all necessary information for intelligent joining including content, metadata,
 * dependencies, and ordering information.
 *
 * @category Strategies
 */
export interface JoinSection {
  /** Original file path */
  filePath: string;
  /** Content of the file */
  content: string;
  /** Frontmatter extracted from the file */
  frontmatter: string | undefined;
  /** Title extracted from the file (from frontmatter or first header) */
  title: string | undefined;
  /** Dependencies (files this content links to) */
  dependencies: string[];
  /** Order priority for this section */
  order: number;
}

/**
 * Result of a join operation containing combined content and metadata.
 *
 * Provides comprehensive information about the joining process including success status, conflicts,
 * and any issues encountered.
 *
 * @category Strategies
 */
export interface JoinResult {
  /** Whether the join was successful */
  success: boolean;
  /** Combined content */
  content: string;
  /** Combined frontmatter */
  frontmatter: string | undefined;
  /** List of files that were joined */
  sourceFiles: string[];
  /** Conflicts that need resolution */
  conflicts: JoinConflict[];
  /** Warnings */
  warnings: string[];
  /** Errors */
  errors: string[];
  /** Duplicate links that were removed */
  deduplicatedLinks: string[];
}

/**
 * Represents a conflict detected during the join operation.
 *
 * Conflicts can arise from duplicate headers, frontmatter merging issues, or content overlaps that
 * require resolution.
 *
 * @category Strategies
 */
export interface JoinConflict {
  /** Type of conflict */
  type:
    | "frontmatter-merge"
    | "duplicate-headers"
    | "link-collision"
    | "content-overlap";
  /** Description of the conflict */
  description: string;
  /** Files involved in the conflict */
  files: string[];
  /** Suggested resolution */
  resolution?: string;
  /** Line numbers where conflict occurs */
  lines?: number[];
}

/**
 * Configuration options for join strategy operations.
 *
 * Controls various aspects of the joining process including ordering, content formatting, and
 * conflict resolution behavior.
 *
 * @category Strategies
 */
export interface JoinStrategyOptions {
  /** Output file path */
  outputPath?: string;
  /** Strategy for ordering content */
  orderStrategy?: "alphabetical" | "manual" | "dependency" | "chronological";
  /** Custom section separator */
  separator?: string;
  /** Whether to merge frontmatter */
  mergeFrontmatter?: boolean;
  /** Whether to deduplicate links */
  deduplicateLinks?: boolean;
  /** Whether to resolve header conflicts automatically */
  resolveHeaderConflicts?: boolean;
  /** Custom ordering for manual strategy */
  customOrder?: string[];
  /** Whether to preserve original file structure */
  preserveStructure?: boolean;
}

/**
 * Abstract base class for all join strategies.
 *
 * Provides common functionality for joining markdown files including frontmatter merging, conflict
 * detection, and link deduplication. Concrete strategies implement specific ordering algorithms.
 *
 * @category Strategies
 *
 * @example
 *   Implementing a custom join strategy
 *   ```typescript
 *   class CustomJoinStrategy extends BaseJoinStrategy {
 *     async join(sections: JoinSection[]): Promise<JoinResult> {
 *       // Custom ordering logic
 *       const orderedSections = this.customSort(sections);
 *       return this.buildResult(orderedSections);
 *     }
 *   }
 *   ```
 */
export abstract class BaseJoinStrategy {
  /** The effective options for this strategy: the supplied options layered over the defaults set in the constructor. */
  protected options: JoinStrategyOptions;

  /**
   * Creates a join strategy.
   *
   * The defaults are dependency ordering, a `---` rule between sections, frontmatter merging, link deduplication and structure preservation, with automatic header conflict resolution off. Any supplied option overrides its default.
   *
   * @param options - Options that override the defaults.
   */
  constructor(options: JoinStrategyOptions = {}) {
    this.options = {
      orderStrategy: "dependency",
      separator: "\n\n---\n\n",
      mergeFrontmatter: true,
      deduplicateLinks: true,
      resolveHeaderConflicts: false,
      preserveStructure: true,
      ...options,
    };
  }

  /**
   * Orders the sections and combines them into a single document.
   *
   * Each concrete strategy decides the section order. Conflicts between sections are reported in the result rather than thrown, and a failure while joining is reported through `errors` with `success` set to false.
   *
   * @param sections - The sections to join, one per source file.
   * @returns The combined content, merged frontmatter (when enabled), the source files in their final order, and any conflicts, warnings, errors and removed duplicate links.
   */
  abstract join(sections: JoinSection[]): Promise<JoinResult>;

  /**
   * Returns `title` unless it is undefined or the empty string, in which case `filePath` is used --
   * an empty title is treated as "no title supplied" rather than a meaningful value to sort or
   * display by.
   */
  protected titleOrPath(title: string | undefined, filePath: string): string {
    if (title) {
      return title;
    }
    return filePath;
  }

  /**
   * Extracts a title from a document.
   *
   * A `title:` frontmatter line takes precedence, with any quote characters removed. Otherwise the text of the first markdown header in the content is used.
   *
   * @param content - The document body to scan for a header.
   * @param frontmatter - The raw frontmatter block, if the document has one.
   * @returns The title, or undefined when there is neither a frontmatter title nor a header.
   */
  protected extractTitle(
    content: string,
    frontmatter?: string,
  ): string | undefined {
    // Try frontmatter first
    if (frontmatter) {
      const titleMatch = /^title:\s*(.+)$/m.exec(frontmatter);
      if (titleMatch) {
        return titleMatch[1].trim().replace(/['"]/g, "");
      }
    }

    // Try first header
    const lines = content.split("\n");
    for (const line of lines) {
      const headerMatch = /^#+\s+(.+)$/.exec(line);
      if (headerMatch) {
        return headerMatch[1].trim();
      }
    }

    return undefined;
  }

  /**
   * Merges the frontmatter blocks of several sections into one block.
   *
   * The `tags`, `categories` and `keywords` keys are collected across all sections as de-duplicated lists. Differing `title` values are combined with ` & `. Every other key keeps the first value found, and a purely numeric value is written as a number.
   *
   * @param sections - The sections whose frontmatter is merged, in output order.
   * @returns A `---` delimited frontmatter block, or an empty string when no section supplies any keys.
   */
  protected mergeFrontmatter(sections: JoinSection[]): string {
    const frontmatterData: Partial<Record<string, string | number | string[]>> =
      {};
    const arrays: Partial<Record<string, string[]>> = {};

    for (const section of sections) {
      if (!section.frontmatter) continue;

      const lines = section.frontmatter
        .replace(/^---\n/, "")
        .replace(/\n---$/, "")
        .split("\n");

      for (const line of lines) {
        const match = /^([^:]+):\s*(.*)$/.exec(line);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim();

          if (key === "tags" || key === "categories" || key === "keywords") {
            // Handle arrays
            const arrayValue = (arrays[key] ??= []);
            if (value.startsWith("[") && value.endsWith("]")) {
              // Parse array format
              const items = value
                .slice(1, -1)
                .split(",")
                .map((item) => item.trim().replace(/['"]/g, ""));
              arrayValue.push(...items);
            } else {
              arrayValue.push(value.replace(/['"]/g, ""));
            }
          } else if (key === "title") {
            // Use first title found, or combine if different
            const existingTitle = frontmatterData[key];
            const cleanValue = value.replace(/['"]/g, "");
            if (existingTitle === undefined) {
              frontmatterData[key] = cleanValue;
            } else if (
              typeof existingTitle === "string" &&
              existingTitle !== cleanValue
            ) {
              frontmatterData[key] = `${existingTitle} & ${cleanValue}`;
            }
          } else {
            // Simple key-value pairs - use first found
            if (!frontmatterData[key]) {
              const cleanValue = value.replace(/['"]/g, "");
              // Try to parse as number if it looks like one
              if (/^\d+$/.test(cleanValue)) {
                frontmatterData[key] = Number.parseInt(cleanValue, 10);
              } else {
                frontmatterData[key] = cleanValue;
              }
            }
          }
        }
      }
    }

    // Merge arrays back into frontmatter
    for (const [key, values] of Object.entries(arrays)) {
      frontmatterData[key] = [...new Set(values)]; // Remove duplicates
    }

    // Generate frontmatter string
    if (Object.keys(frontmatterData).length === 0) {
      return "";
    }

    let result = "---\n";
    for (const [key, value] of Object.entries(frontmatterData)) {
      if (Array.isArray(value)) {
        result += `${key}: [${value.map((v) => `"${v}"`).join(", ")}]\n`;
      } else if (typeof value === "number") {
        result += `${key}: ${String(value)}\n`;
      } else if (typeof value === "string") {
        result += `${key}: "${value}"\n`;
      }
    }
    result += "---\n";

    return result;
  }

  /**
   * Detects conflicts between sections.
   *
   * Reports a `duplicate-headers` conflict for each header (compared case-insensitively) that appears in more than one section, and a `frontmatter-merge` conflict for each frontmatter key present in more than one section.
   *
   * @param sections - The sections to compare.
   * @returns One conflict per duplicated header or frontmatter key, naming the files involved.
   */
  protected detectConflicts(sections: JoinSection[]): JoinConflict[] {
    const conflicts: JoinConflict[] = [];
    const seenHeaders = new Set<string>();
    const headerFiles: Partial<Record<string, string[]>> = {};

    // Check for duplicate headers
    for (const section of sections) {
      const headers = this.extractHeaders(section.content);
      for (const header of headers) {
        const normalizedHeader = header.toLowerCase().trim();
        if (seenHeaders.has(normalizedHeader)) {
          (headerFiles[normalizedHeader] ??= []).push(section.filePath);
        } else {
          seenHeaders.add(normalizedHeader);
          headerFiles[normalizedHeader] = [section.filePath];
        }
      }
    }

    // Add conflicts for duplicate headers
    for (const [header, files] of Object.entries(headerFiles)) {
      if ((files ?? []).length > 1) {
        conflicts.push({
          type: "duplicate-headers",
          description: `Duplicate header "${header}" found in multiple files`,
          files: files ?? [],
          resolution: "Consider renaming headers or adding file prefixes",
        });
      }
    }

    // Check for frontmatter conflicts
    const frontmatterKeys = new Set<string>();
    const conflictingKeys: Partial<Record<string, string[]>> = {};

    for (const section of sections) {
      if (section.frontmatter) {
        const lines = section.frontmatter.split("\n");
        for (const line of lines) {
          const match = /^([^:]+):/.exec(line);
          if (match) {
            const key = match[1].trim();
            if (frontmatterKeys.has(key)) {
              (conflictingKeys[key] ??= []).push(section.filePath);
            } else {
              frontmatterKeys.add(key);
              conflictingKeys[key] = [section.filePath];
            }
          }
        }
      }
    }

    for (const [key, files] of Object.entries(conflictingKeys)) {
      if ((files ?? []).length > 1) {
        conflicts.push({
          type: "frontmatter-merge",
          description: `Conflicting frontmatter key "${key}" in multiple files`,
          files: files ?? [],
          resolution: "Values will be merged or first value used",
        });
      }
    }

    return conflicts;
  }

  /**
   * Extracts the text of every markdown header in a document.
   *
   * @param content - The markdown content to scan.
   * @returns The header texts in document order, without the leading `#` markers.
   */
  protected extractHeaders(content: string): string[] {
    const headers: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const match = /^#+\s+(.+)$/.exec(line);
      if (match) {
        headers.push(match[1].trim());
      }
    }

    return headers;
  }

  /**
   * Removes repeated links from combined content.
   *
   * The first occurrence of each markdown link (same text and target) and each bare URL is kept. A repeated markdown link is replaced by its link text (or its URL when the text is empty), and a repeated bare URL is deleted.
   *
   * @param content - The combined document content.
   * @returns The de-duplicated content and the occurrences that were removed.
   */
  protected deduplicateLinks(content: string): {
    /** The content with repeated links replaced or removed. */
    content: string;
    /** Each removed occurrence exactly as it appeared, in document order. */
    removedLinks: string[];
  } {
    const seenLinks = new Set<string>();
    const removedLinks: string[] = [];
    const lines = content.split("\n");
    const processedLines: string[] = [];

    for (const line of lines) {
      let processedLine = line;

      // Find all markdown links in the line
      const linkMatches = line.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g);

      for (const match of linkMatches) {
        const fullLink = match[0];
        const linkText = match[1];
        const linkUrl = match[2];
        const normalizedLink = `${linkText}|${linkUrl}`;

        if (seenLinks.has(normalizedLink)) {
          // Remove duplicate link
          processedLine = processedLine.replace(fullLink, linkText || linkUrl);
          removedLinks.push(fullLink);
        } else {
          seenLinks.add(normalizedLink);
        }
      }

      // Also check for bare URLs and reference-style links
      const urlMatches = line.matchAll(/https?:\/\/[^\s]+/g);
      for (const match of urlMatches) {
        const url = match[0];
        if (seenLinks.has(url)) {
          processedLine = processedLine.replace(url, "");
          removedLinks.push(url);
        } else {
          seenLinks.add(url);
        }
      }

      processedLines.push(processedLine);
    }

    return {
      content: processedLines.join("\n"),
      removedLinks,
    };
  }
}

/**
 * Join strategy that orders content based on dependency relationships.
 *
 * Uses topological sorting to arrange sections so that files are ordered according to their
 * cross-reference dependencies. Files with no dependencies come first, followed by files that
 * depend on them.
 *
 * @category Strategies
 *
 * @example
 *   Dependency-based joining
 *   ```typescript
 *   const strategy = new DependencyOrderJoinStrategy({
 *       mergeFrontmatter: true,
 *       deduplicateLinks: true
 *   });
 *
 *   const result = await strategy.join(sections);
 *   if (result.success) {
 *     console.log(`Joined ${result.sourceFiles.length} files in dependency order`);
 *   }
 *   ```
 */
export class DependencyOrderJoinStrategy extends BaseJoinStrategy {
  /**
   * Joins sections in dependency order.
   *
   * Sections are topologically sorted so that a file comes after every file in the input that it depends on. Dependencies that are not among the input sections are ignored. If the dependencies are circular, a warning is recorded and the sections are ordered by their `order` field instead.
   *
   * @param sections - The sections to join.
   * @returns The joined result, or a failed result with `errors` populated if joining throws.
   */
  join(sections: JoinSection[]): Promise<JoinResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts = this.detectConflicts(sections);

    try {
      // Sort sections by dependency order (topological sort)
      const orderedSections = this.topologicalSort(sections);

      if (!orderedSections) {
        warnings.push(
          "Circular dependency detected, falling back to manual order",
        );
        const fallbackSections = [...sections].sort(
          (a, b) => a.order - b.order,
        );
        return Promise.resolve(
          this.buildResult(fallbackSections, conflicts, warnings, errors),
        );
      }

      return Promise.resolve(
        this.buildResult(orderedSections, conflicts, warnings, errors),
      );
    } catch (error) {
      errors.push(
        `Failed to join sections: ${error instanceof Error ? error.message : String(error)}`,
      );
      return Promise.resolve({
        success: false,
        content: "",
        frontmatter: undefined,
        sourceFiles: [],
        conflicts,
        warnings,
        errors,
        deduplicatedLinks: [],
      });
    }
  }

  private topologicalSort(sections: JoinSection[]): JoinSection[] | null {
    const graph = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();
    const fileToSection = new Map<string, JoinSection>();

    // Initialize graph
    for (const section of sections) {
      const filePath = section.filePath;
      graph.set(filePath, new Set());
      inDegree.set(filePath, 0);
      fileToSection.set(filePath, section);
    }

    // Build dependency graph
    for (const section of sections) {
      for (const dep of section.dependencies) {
        if (fileToSection.has(dep)) {
          graph.get(dep)?.add(section.filePath);
          inDegree.set(
            section.filePath,
            (inDegree.get(section.filePath) ?? 0) + 1,
          );
        }
      }
    }

    // Topological sort
    const queue: string[] = [];
    const result: JoinSection[] = [];

    // Find nodes with no incoming edges
    for (const [file, degree] of inDegree) {
      if (degree === 0) {
        queue.push(file);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;

      const section = fileToSection.get(current);
      if (!section) continue;
      result.push(section);

      // Remove edges and update in-degrees
      const neighbors = graph.get(current) ?? new Set();
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Check for cycles
    if (result.length !== sections.length) {
      return null; // Circular dependency detected
    }

    return result;
  }

  private buildResult(
    orderedSections: JoinSection[],
    conflicts: JoinConflict[],
    warnings: string[],
    errors: string[],
  ): JoinResult {
    const sourceFiles = orderedSections.map((s) => s.filePath);
    const separator = this.options.separator ?? "\n\n---\n\n";

    // Combine content
    let combinedContent = orderedSections
      .map((section) => section.content.replace(/^---\n.*?\n---\n/s, "").trim())
      .join(separator);

    let deduplicatedLinks: string[] = [];

    // Deduplicate links if requested
    if (this.options.deduplicateLinks) {
      const dedupeResult = this.deduplicateLinks(combinedContent);
      combinedContent = dedupeResult.content;
      deduplicatedLinks = dedupeResult.removedLinks;
    }

    // Merge frontmatter if requested
    let frontmatter: string | undefined;
    if (this.options.mergeFrontmatter) {
      frontmatter = this.mergeFrontmatter(orderedSections);
    }

    return {
      success: true,
      content: combinedContent,
      frontmatter,
      sourceFiles,
      conflicts,
      warnings,
      errors,
      deduplicatedLinks,
    };
  }
}

/**
 * Join strategy that orders content alphabetically by title or filename.
 *
 * Provides simple, predictable ordering by sorting files alphabetically based on their extracted
 * title (from frontmatter or first header) or falling back to the filename if no title is
 * available.
 *
 * @category Strategies
 *
 * @example
 *   Alphabetical joining
 *   ```typescript
 *   const strategy = new AlphabeticalJoinStrategy({
 *       separator: '\n\n<!-- Next Section -->\n\n'
 *   });
 *
 *   const result = await strategy.join(sections);
 *   console.log(`Files ordered: ${result.sourceFiles.join(', ')}`);
 *   ```
 */
export class AlphabeticalJoinStrategy extends BaseJoinStrategy {
  /**
   * Joins sections in case-insensitive alphabetical order.
   *
   * Sections are sorted by title, using the file path for a section with no title.
   *
   * @param sections - The sections to join.
   * @returns The joined result, or a failed result with `errors` populated if joining throws.
   */
  join(sections: JoinSection[]): Promise<JoinResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts = this.detectConflicts(sections);

    try {
      // Sort sections alphabetically by title or filename
      const orderedSections = [...sections].sort((a, b) => {
        const titleA = this.titleOrPath(a.title, a.filePath);
        const titleB = this.titleOrPath(b.title, b.filePath);
        return titleA.toLowerCase().localeCompare(titleB.toLowerCase());
      });

      return Promise.resolve(
        this.buildResult(orderedSections, conflicts, warnings, errors),
      );
    } catch (error) {
      errors.push(
        `Failed to join sections: ${error instanceof Error ? error.message : String(error)}`,
      );
      return Promise.resolve({
        success: false,
        content: "",
        frontmatter: undefined,
        sourceFiles: [],
        conflicts,
        warnings,
        errors,
        deduplicatedLinks: [],
      });
    }
  }

  private buildResult(
    orderedSections: JoinSection[],
    conflicts: JoinConflict[],
    warnings: string[],
    errors: string[],
  ): JoinResult {
    const sourceFiles = orderedSections.map((s) => s.filePath);
    const separator = this.options.separator ?? "\n\n---\n\n";

    let combinedContent = orderedSections
      .map((section) => section.content.replace(/^---\n.*?\n---\n/s, "").trim())
      .join(separator);

    let deduplicatedLinks: string[] = [];

    if (this.options.deduplicateLinks) {
      const dedupeResult = this.deduplicateLinks(combinedContent);
      combinedContent = dedupeResult.content;
      deduplicatedLinks = dedupeResult.removedLinks;
    }

    let frontmatter: string | undefined;
    if (this.options.mergeFrontmatter) {
      frontmatter = this.mergeFrontmatter(orderedSections);
    }

    return {
      success: true,
      content: combinedContent,
      frontmatter,
      sourceFiles,
      conflicts,
      warnings,
      errors,
      deduplicatedLinks,
    };
  }
}

/**
 * Join strategy that uses a custom manual ordering with alphabetical fallback.
 *
 * Allows explicit specification of file order through the customOrder option. Files not specified
 * in the custom order are appended in alphabetical order. This provides maximum control over the
 * final document structure.
 *
 * @category Strategies
 *
 * @example
 *   Manual ordering with fallback
 *   ```typescript
 *   const strategy = new ManualOrderJoinStrategy({
 *       customOrder: ['intro.md', 'main-content.md', 'conclusion.md'],
 *       mergeFrontmatter: true
 *   });
 *
 *   // Files will be ordered as specified, with any others alphabetically
 *   const result = await strategy.join(sections);
 *   ```
 */
export class ManualOrderJoinStrategy extends BaseJoinStrategy {
  /**
   * Joins sections in the order given by the `customOrder` option.
   *
   * Sections named in `customOrder` come first, in that order. A named file with no matching section adds a warning. Remaining sections follow in case-insensitive alphabetical order by title, using the file path for a section with no title.
   *
   * @param sections - The sections to join.
   * @returns The joined result, or a failed result with `errors` populated if joining throws.
   */
  join(sections: JoinSection[]): Promise<JoinResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts = this.detectConflicts(sections);

    try {
      const customOrder = this.options.customOrder ?? [];
      const orderedSections: JoinSection[] = [];
      const usedSections = new Set<string>();

      // Add sections in custom order
      for (const filePath of customOrder) {
        const section = sections.find((s) => s.filePath === filePath);
        if (section) {
          orderedSections.push(section);
          usedSections.add(filePath);
        } else {
          warnings.push(
            `File ${filePath} specified in custom order but not found in sections`,
          );
        }
      }

      // Add remaining sections in alphabetical order
      const remainingSections = sections
        .filter((s) => !usedSections.has(s.filePath))
        .sort((a, b) => {
          const titleA = this.titleOrPath(a.title, a.filePath);
          const titleB = this.titleOrPath(b.title, b.filePath);
          return titleA.toLowerCase().localeCompare(titleB.toLowerCase());
        });

      orderedSections.push(...remainingSections);

      return Promise.resolve(
        this.buildResult(orderedSections, conflicts, warnings, errors),
      );
    } catch (error) {
      errors.push(
        `Failed to join sections: ${error instanceof Error ? error.message : String(error)}`,
      );
      return Promise.resolve({
        success: false,
        content: "",
        frontmatter: undefined,
        sourceFiles: [],
        conflicts,
        warnings,
        errors,
        deduplicatedLinks: [],
      });
    }
  }

  private buildResult(
    orderedSections: JoinSection[],
    conflicts: JoinConflict[],
    warnings: string[],
    errors: string[],
  ): JoinResult {
    const sourceFiles = orderedSections.map((s) => s.filePath);
    const separator = this.options.separator ?? "\n\n---\n\n";

    let combinedContent = orderedSections
      .map((section) => section.content.replace(/^---\n.*?\n---\n/s, "").trim())
      .join(separator);

    let deduplicatedLinks: string[] = [];

    if (this.options.deduplicateLinks) {
      const dedupeResult = this.deduplicateLinks(combinedContent);
      combinedContent = dedupeResult.content;
      deduplicatedLinks = dedupeResult.removedLinks;
    }

    let frontmatter: string | undefined;
    if (this.options.mergeFrontmatter) {
      frontmatter = this.mergeFrontmatter(orderedSections);
    }

    return {
      success: true,
      content: combinedContent,
      frontmatter,
      sourceFiles,
      conflicts,
      warnings,
      errors,
      deduplicatedLinks,
    };
  }
}

/**
 * Join strategy that orders content chronologically by date.
 *
 * Extracts dates from frontmatter (date, created, modified fields) or attempts to parse dates from
 * filenames. Orders content from oldest to newest, providing a timeline-based organization for
 * content.
 *
 * @category Strategies
 *
 * @example
 *   Chronological joining
 *   ```typescript
 *   const strategy = new ChronologicalJoinStrategy({
 *       separator: '\n\n---\n\n'
 *   });
 *
 *   // Files will be ordered by date (oldest first)
 *   const result = await strategy.join(sections);
 *   console.log(`Chronological order: ${result.sourceFiles.join(' → ')}`);
 *   ```
 */
export class ChronologicalJoinStrategy extends BaseJoinStrategy {
  /**
   * Joins sections from oldest to newest.
   *
   * Each section's date comes from a `date:` frontmatter line, or failing that from a `YYYY-MM-DD` date in its file path. Sections with no usable date are placed last.
   *
   * @param sections - The sections to join.
   * @returns The joined result, or a failed result with `errors` populated if joining throws.
   */
  join(sections: JoinSection[]): Promise<JoinResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts = this.detectConflicts(sections);

    try {
      // Sort sections by date (extracted from frontmatter or filename)
      const orderedSections = [...sections].sort((a, b) => {
        const dateA = this.extractDate(a);
        const dateB = this.extractDate(b);

        if (!dateA && !dateB) return 0;
        if (!dateA) return 1; // Put undated items last
        if (!dateB) return -1; // Put undated items last

        return dateA.getTime() - dateB.getTime();
      });

      return Promise.resolve(
        this.buildResult(orderedSections, conflicts, warnings, errors),
      );
    } catch (error) {
      errors.push(
        `Failed to join sections: ${error instanceof Error ? error.message : String(error)}`,
      );
      return Promise.resolve({
        success: false,
        content: "",
        frontmatter: undefined,
        sourceFiles: [],
        conflicts,
        warnings,
        errors,
        deduplicatedLinks: [],
      });
    }
  }

  private extractDate(section: JoinSection): Date | null {
    // Try frontmatter first
    if (section.frontmatter) {
      const dateMatch = /^date:\s*(.+)$/m.exec(section.frontmatter);
      if (dateMatch) {
        const date = new Date(dateMatch[1].trim().replace(/['"]/g, ""));
        if (!Number.isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // Try to extract date from filename (YYYY-MM-DD format)
    const filenameDateMatch = /(\d{4}-\d{2}-\d{2})/.exec(section.filePath);
    if (filenameDateMatch) {
      const date = new Date(filenameDateMatch[1]);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    return null;
  }

  private buildResult(
    orderedSections: JoinSection[],
    conflicts: JoinConflict[],
    warnings: string[],
    errors: string[],
  ): JoinResult {
    const sourceFiles = orderedSections.map((s) => s.filePath);
    const separator = this.options.separator ?? "\n\n---\n\n";

    let combinedContent = orderedSections
      .map((section) => section.content.replace(/^---\n.*?\n---\n/s, "").trim())
      .join(separator);

    let deduplicatedLinks: string[] = [];

    if (this.options.deduplicateLinks) {
      const dedupeResult = this.deduplicateLinks(combinedContent);
      combinedContent = dedupeResult.content;
      deduplicatedLinks = dedupeResult.removedLinks;
    }

    let frontmatter: string | undefined;
    if (this.options.mergeFrontmatter) {
      frontmatter = this.mergeFrontmatter(orderedSections);
    }

    return {
      success: true,
      content: combinedContent,
      frontmatter,
      sourceFiles,
      conflicts,
      warnings,
      errors,
      deduplicatedLinks,
    };
  }
}
