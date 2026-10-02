/**
 * Represents a section of content to be merged into a target file.
 *
 * Contains content information, positioning strategy, and metadata for intelligent merging
 * operations.
 *
 * @category Strategies
 */
export interface MergeSection {
  /** Content of the section */
  content: string;
  /** Source file path */
  sourceFile: string;
  /** Position in the merge (before, after, or replace) */
  position: "before" | "after" | "replace" | "interactive";
  /** Header level if this section has a header */
  headerLevel?: number;
  /** Whether this is an Obsidian transclusion */
  isTransclusion?: boolean;
  /** Transclusion reference if applicable */
  transclusionRef?: string;
}

/**
 * Result of a merge operation containing combined content and metadata.
 *
 * Provides comprehensive information about the merging process including conflicts, transclusions,
 * and any issues encountered.
 *
 * @category Strategies
 */
export interface MergeResult {
  /** Whether the merge was successful */
  success: boolean;
  /** Final merged content */
  content: string;
  /** Combined frontmatter */
  frontmatter?: string;
  /** Source files that were merged */
  sourceFiles: string[];
  /** Conflicts that were resolved or need attention */
  conflicts: MergeConflict[];
  /** Warnings */
  warnings: string[];
  /** Errors */
  errors: string[];
  /** Transclusions that were created */
  transclusions: string[];
}

/**
 * Represents a conflict detected during the merge operation.
 *
 * Conflicts can arise from header collisions, content overlaps, or transclusion loops that require
 * resolution.
 *
 * @category Strategies
 */
export interface MergeConflict {
  /** Type of conflict */
  type:
    | "header-collision"
    | "content-overlap"
    | "transclusion-loop"
    | "frontmatter-conflict";
  /** Description of the conflict */
  description: string;
  /** Source files involved */
  sourceFiles: string[];
  /** Suggested resolution strategy */
  resolution?: string;
  /** Line numbers where conflict occurs */
  lines?: number[];
  /** Whether conflict was auto-resolved */
  autoResolved: boolean;
}

/**
 * Configuration options for merge strategy operations.
 *
 * Controls various aspects of the merging process including conflict resolution, transclusion
 * handling, and content formatting.
 *
 * @category Strategies
 */
export interface MergeStrategyOptions {
  /** Strategy for handling conflicts */
  conflictResolution?: "auto" | "interactive" | "manual";
  /** Separator between merged sections */
  separator?: string;
  /** Whether to create Obsidian transclusions */
  createTransclusions?: boolean;
  /** Whether to merge frontmatter */
  mergeFrontmatter?: boolean;
  /** Whether to preserve original structure */
  preserveStructure?: boolean;
  /** Custom transclusion template */
  transclusionTemplate?: string;
  /** Maximum depth for transclusion resolution */
  maxTransclusionDepth?: number;
}

/**
 * Abstract base class for all merge strategies.
 *
 * Provides common functionality for merging markdown files including transclusion handling,
 * conflict detection, and frontmatter management. Concrete strategies implement specific merging
 * approaches.
 *
 * @category Strategies
 *
 * @example
 *   Implementing a custom merge strategy
 *   ```typescript
 *   class CustomMergeStrategy extends BaseMergeStrategy {
 *   async merge(targetContent: string, sourceContent: string): Promise<MergeResult> {
 *   // Custom merging logic
 *   const conflicts = this.detectConflicts(targetContent, sourceContent);
 *   return this.buildResult(mergedContent, conflicts);
 *   }
 *   }
 *   ```
 */
export abstract class BaseMergeStrategy {
  /** The effective options for this strategy: the supplied options layered over the defaults set in the constructor. */
  protected options: MergeStrategyOptions;

  /**
   * Creates a merge strategy.
   *
   * The defaults are automatic conflict resolution, a blank line between merged sections, no transclusions, frontmatter merging, structure preservation, the `![[{file}#{section}]]` transclusion template and a maximum transclusion depth. Any supplied option overrides its default.
   *
   * @param options - Options that override the defaults.
   */
  constructor(options: MergeStrategyOptions = {}) {
    this.options = {
      conflictResolution: "auto",
      separator: "\n\n",
      createTransclusions: false,
      mergeFrontmatter: true,
      preserveStructure: true,
      transclusionTemplate: "![[{file}#{section}]]",
      maxTransclusionDepth: 3,
      ...options,
    };
  }

  /**
   * Merges the content of a source file into a target file.
   *
   * Each concrete strategy decides where the source content is placed. Conflicts are reported in the result rather than thrown, and a failure while merging is reported through `errors` with `success` set to false.
   *
   * @param targetContent - The full content of the file being merged into, including any frontmatter.
   * @param sourceContent - The full content of the file being merged from, including any frontmatter.
   * @param targetFile - The path of the target file, used in conflict reports and transclusion loop checks.
   * @param sourceFile - The path of the source file, used in conflict reports and transclusion references.
   * @returns The merged content and frontmatter, the files involved, and any conflicts, warnings, errors and created transclusions.
   */
  abstract merge(
    targetContent: string,
    sourceContent: string,
    targetFile: string,
    sourceFile: string,
  ): Promise<MergeResult>;

  /**
   * Extracts Obsidian transclusions (`![[file]]` or `![[file#section]]`) from content.
   *
   * @param content - The markdown content to scan.
   * @returns One entry per transclusion, in document order.
   */
  protected extractTransclusions(content: string): {
    /** The full transclusion text as written, for example `![[notes#intro]]`. */
    ref: string;
    /** The referenced file, with a `.md` extension added when the reference had none. */
    file: string;
    /** The referenced section, when the reference includes one after `#`. */
    section?: string;
    /** The one-based line number on which the transclusion appears. */
    line: number;
  }[] {
    const transclusions: {
      ref: string;
      file: string;
      section?: string;
      line: number;
    }[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match Obsidian transclusion syntax: ![[file]] or ![[file#section]]
      const matches = line.matchAll(/!\[\[([^#\]]+)(?:#([^\]]+))?\]\]/g);

      for (const match of matches) {
        const fullRef = match[0];
        const file = match[1];
        const section = match[2];

        transclusions.push({
          ref: fullRef,
          file: file.endsWith(".md") ? file : `${file}.md`,
          section,
          line: i + 1,
        });
      }
    }

    return transclusions;
  }

  /**
   * Builds a transclusion reference from the configured `transclusionTemplate`.
   *
   * The `.md` extension is dropped from the file name. Without a section, the `#{section}` part of the template is removed.
   *
   * @param file - The file to reference.
   * @param section - The section within the file, if any.
   * @returns The transclusion text.
   */
  protected createTransclusion(file: string, section?: string): string {
    const template =
      this.options.transclusionTemplate ?? "![[{file}#{section}]]";
    const cleanFile = file.replace(/\.md$/, "");

    if (section) {
      return template
        .replace("{file}", cleanFile)
        .replace("{section}", section);
    }
    return template.replace("{file}", cleanFile).replace("#{section}", "");
  }

  /**
   * Detects whether transcluding the source into the target would create a loop.
   *
   * A loop is reported when any existing transclusion mentions the target file name, or when the source and target are the same file.
   *
   * @param targetFile - The path of the file being merged into.
   * @param sourceFile - The path of the file that would be transcluded.
   * @param existingTransclusions - The transclusion references already in the target.
   * @returns True when a loop would result.
   */
  protected detectTransclusionLoops(
    targetFile: string,
    sourceFile: string,
    existingTransclusions: string[],
  ): boolean {
    // Check if source file already references target file
    if (
      existingTransclusions.some((t) =>
        t.includes(targetFile.replace(/\.md$/, "")),
      )
    ) {
      return true;
    }

    // Check for direct circular reference
    if (sourceFile === targetFile) {
      return true;
    }

    return false;
  }

  /**
   * Merges the frontmatter of the target and source.
   *
   * When only one side has frontmatter it is returned unchanged. Otherwise, for keys present on both sides the target's value wins, except that `tags`, `categories` and `keywords` are combined as de-duplicated lists when both sides hold lists.
   *
   * @param targetFrontmatter - The target's raw frontmatter block, or an empty string.
   * @param sourceFrontmatter - The source's raw frontmatter block, or an empty string.
   * @returns The merged frontmatter block, or an empty string when neither side has any.
   */
  protected mergeFrontmatter(
    targetFrontmatter: string,
    sourceFrontmatter: string,
  ): string {
    if (!targetFrontmatter && !sourceFrontmatter) {
      return "";
    }

    if (!targetFrontmatter) return sourceFrontmatter;
    if (!sourceFrontmatter) return targetFrontmatter;

    const targetData = this.parseFrontmatter(targetFrontmatter);
    const sourceData = this.parseFrontmatter(sourceFrontmatter);

    // Merge data - target takes precedence for conflicts
    const mergedData = { ...sourceData, ...targetData };

    // Special handling for arrays (tags, categories)
    for (const key of ["tags", "categories", "keywords"]) {
      const sourceValue = sourceData[key];
      const targetValue = targetData[key];
      if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
        mergedData[key] = [...new Set([...sourceValue, ...targetValue])];
      }
    }

    return this.stringifyFrontmatter(mergedData);
  }

  private parseFrontmatter(
    frontmatter: string,
  ): Record<string, string | number | string[]> {
    const data: Record<string, string | number | string[]> = {};
    const lines = frontmatter
      .replace(/^---\n/, "")
      .replace(/\n---$/, "")
      .split("\n");

    for (const line of lines) {
      const match = /^([^:]+):\s*(.*)$/.exec(line);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();

        if (value.startsWith("[") && value.endsWith("]")) {
          // Parse array
          data[key] = value
            .slice(1, -1)
            .split(",")
            .map((item) => item.trim().replace(/['"]/g, ""));
        } else {
          data[key] = value.replace(/['"]/g, "");
        }
      }
    }

    return data;
  }

  private stringifyFrontmatter(
    data: Record<string, string | number | string[]>,
  ): string {
    if (Object.keys(data).length === 0) {
      return "";
    }

    let result = "---\n";
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        result += `${key}: [${value.map((v) => `"${v}"`).join(", ")}]\n`;
      } else {
        result += `${key}: "${String(value)}"\n`;
      }
    }
    result += "---\n";

    return result;
  }

  /**
   * Extracts every markdown header from content.
   *
   * @param content - The markdown content to scan.
   * @returns One entry per header, in document order.
   */
  protected extractHeaders(content: string): {
    /** The header text, without the `#` markers. */
    text: string;
    /** The header level, equal to the number of `#` characters. */
    level: number;
    /** The one-based line number of the header. */
    line: number;
  }[] {
    const headers: { text: string; level: number; line: number }[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = /^(#+)\s+(.+)$/.exec(line);
      if (match) {
        headers.push({
          text: match[2].trim(),
          level: match[1].length,
          line: i + 1,
        });
      }
    }

    return headers;
  }

  /**
   * Finds source headers that also exist in the target.
   *
   * Headers match when their text is equal ignoring case and they have the same level.
   *
   * @param targetContent - The target's content.
   * @param sourceContent - The source's content.
   * @returns One entry per colliding source header.
   */
  protected findHeaderConflicts(
    targetContent: string,
    sourceContent: string,
  ): {
    /** The text of the source header. */
    header: string;
    /** The one-based line of the matching header in the target. */
    targetLine: number;
    /** The one-based line of the header in the source. */
    sourceLine: number;
  }[] {
    const targetHeaders = this.extractHeaders(targetContent);
    const sourceHeaders = this.extractHeaders(sourceContent);
    const conflicts: {
      header: string;
      targetLine: number;
      sourceLine: number;
    }[] = [];

    for (const sourceHeader of sourceHeaders) {
      const conflict = targetHeaders.find(
        (th) =>
          th.text.toLowerCase() === sourceHeader.text.toLowerCase() &&
          th.level === sourceHeader.level,
      );

      if (conflict) {
        conflicts.push({
          header: sourceHeader.text,
          targetLine: conflict.line,
          sourceLine: sourceHeader.line,
        });
      }
    }

    return conflicts;
  }
}

/**
 * Merge strategy that appends source content to the end of target content.
 *
 * Simply adds the source file content to the end of the target file, with optional separator and
 * frontmatter merging. This is the simplest merge strategy and works well for accumulating
 * content.
 *
 * @category Strategies
 *
 * @example
 *   Append merge with transclusions
 *   ```typescript
 *   const strategy = new AppendMergeStrategy({
 *   createTransclusions: true,
 *   separator: '\n\n---\n\n'
 *   });
 *
 *   const result = await strategy.merge(targetContent, sourceContent, 'target.md', 'source.md');
 *   console.log(`Appended content, ${result.transclusions.length} transclusions created`);
 *   ```
 */
export class AppendMergeStrategy extends BaseMergeStrategy {
  /**
   * Places the source content after the target content.
   *
   * Frontmatter is stripped from both bodies, the bodies are joined by the separator, and frontmatter is merged when `mergeFrontmatter` is on (otherwise the target's is kept). Duplicate headers are recorded as auto-resolved conflicts and left in place. When `createTransclusions` is on, a transclusion reference to the source is appended instead of its content, unless it would form a loop, in which case a warning is added and the content is appended.
   *
   * @param targetContent - The full content of the file being merged into, including any frontmatter.
   * @param sourceContent - The full content of the file being merged from, including any frontmatter.
   * @param targetFile - The path of the target file.
   * @param sourceFile - The path of the source file.
   * @returns The merged result, or a failed result with `errors` populated and the target content returned unchanged if merging throws.
   */
  merge(
    targetContent: string,
    sourceContent: string,
    targetFile: string,
    sourceFile: string,
  ): Promise<MergeResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts: MergeConflict[] = [];
    const transclusions: string[] = [];

    try {
      // Extract frontmatter
      const targetFrontmatter =
        this.extractFrontmatterFromContent(targetContent);
      const sourceFrontmatter =
        this.extractFrontmatterFromContent(sourceContent);
      const targetMainContent = this.stripFrontmatter(targetContent);
      const sourceMainContent = this.stripFrontmatter(sourceContent);

      // Check for header conflicts
      const headerConflicts = this.findHeaderConflicts(
        targetMainContent,
        sourceMainContent,
      );
      for (const conflict of headerConflicts) {
        conflicts.push({
          type: "header-collision",
          description: `Duplicate header "${conflict.header}" found in both files`,
          sourceFiles: [targetFile, sourceFile],
          resolution: "Headers will be preserved as-is",
          lines: [conflict.targetLine, conflict.sourceLine],
          autoResolved: true,
        });
      }

      // Check for transclusion loops if creating transclusions
      if (this.options.createTransclusions) {
        const existingTransclusions =
          this.extractTransclusions(targetMainContent);
        const transclusionRefs = existingTransclusions.map((t) => t.ref);

        if (
          this.detectTransclusionLoops(targetFile, sourceFile, transclusionRefs)
        ) {
          warnings.push(
            "Transclusion loop detected - not creating transclusion reference",
          );
        } else {
          // Create transclusion instead of appending content
          const transclusionRef = this.createTransclusion(sourceFile);
          const separator = this.options.separator ?? "\n\n";
          const finalContent = targetMainContent + separator + transclusionRef;
          transclusions.push(transclusionRef);

          return Promise.resolve({
            success: true,
            content: finalContent,
            frontmatter: this.options.mergeFrontmatter
              ? this.mergeFrontmatter(targetFrontmatter, sourceFrontmatter)
              : targetFrontmatter,
            sourceFiles: [targetFile, sourceFile],
            conflicts,
            warnings,
            errors,
            transclusions,
          });
        }
      }

      // Standard append merge
      const separator = this.options.separator ?? "\n\n";
      const mergedContent = targetMainContent + separator + sourceMainContent;

      return Promise.resolve({
        success: true,
        content: mergedContent,
        frontmatter: this.options.mergeFrontmatter
          ? this.mergeFrontmatter(targetFrontmatter, sourceFrontmatter)
          : targetFrontmatter,
        sourceFiles: [targetFile, sourceFile],
        conflicts,
        warnings,
        errors,
        transclusions,
      });
    } catch (error) {
      errors.push(
        `Failed to merge files: ${error instanceof Error ? error.message : String(error)}`,
      );
      return Promise.resolve({
        success: false,
        content: targetContent,
        sourceFiles: [targetFile, sourceFile],
        conflicts,
        warnings,
        errors,
        transclusions,
      });
    }
  }

  private extractFrontmatterFromContent(content: string): string {
    const match = /^---\n(.*?)\n---\n/s.exec(content);
    return match ? match[0] : "";
  }

  private stripFrontmatter(content: string): string {
    return content.replace(/^---\n.*?\n---\n/s, "").trim();
  }
}

/**
 * Merge strategy that prepends source content to the beginning of target content.
 *
 * Adds the source file content to the beginning of the target file, after any frontmatter. This is
 * useful when you want new content to appear first in the document.
 *
 * @category Strategies
 *
 * @example
 *   Prepend merge with custom separator
 *   ```typescript
 *   const strategy = new PrependMergeStrategy({
 *   separator: '\n\n<!-- New Content Above -->\n\n',
 *   mergeFrontmatter: true
 *   });
 *
 *   const result = await strategy.merge(targetContent, sourceContent, 'target.md', 'source.md');
 *   console.log('Source content prepended to target');
 *   ```
 */
export class PrependMergeStrategy extends BaseMergeStrategy {
  /**
   * Places the source content before the target content.
   *
   * Frontmatter is stripped from both bodies, the bodies are joined by the separator with the source first, and frontmatter is merged when `mergeFrontmatter` is on (otherwise the target's is kept). Duplicate headers are recorded as auto-resolved conflicts and left in place. Transclusions are not created by this strategy.
   *
   * @param targetContent - The full content of the file being merged into, including any frontmatter.
   * @param sourceContent - The full content of the file being merged from, including any frontmatter.
   * @param targetFile - The path of the target file.
   * @param sourceFile - The path of the source file.
   * @returns The merged result, or a failed result with `errors` populated and the target content returned unchanged if merging throws.
   */
  merge(
    targetContent: string,
    sourceContent: string,
    targetFile: string,
    sourceFile: string,
  ): Promise<MergeResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts: MergeConflict[] = [];
    const transclusions: string[] = [];

    try {
      // Extract frontmatter
      const targetFrontmatter =
        this.extractFrontmatterFromContent(targetContent);
      const sourceFrontmatter =
        this.extractFrontmatterFromContent(sourceContent);
      const targetMainContent = this.stripFrontmatter(targetContent);
      const sourceMainContent = this.stripFrontmatter(sourceContent);

      // Check for header conflicts
      const headerConflicts = this.findHeaderConflicts(
        targetMainContent,
        sourceMainContent,
      );
      for (const conflict of headerConflicts) {
        conflicts.push({
          type: "header-collision",
          description: `Duplicate header "${conflict.header}" found in both files`,
          sourceFiles: [targetFile, sourceFile],
          resolution: "Headers will be preserved as-is",
          lines: [conflict.targetLine, conflict.sourceLine],
          autoResolved: true,
        });
      }

      // Standard prepend merge
      const separator = this.options.separator ?? "\n\n";
      const mergedContent = sourceMainContent + separator + targetMainContent;

      return Promise.resolve({
        success: true,
        content: mergedContent,
        frontmatter: this.options.mergeFrontmatter
          ? this.mergeFrontmatter(targetFrontmatter, sourceFrontmatter)
          : targetFrontmatter,
        sourceFiles: [targetFile, sourceFile],
        conflicts,
        warnings,
        errors,
        transclusions,
      });
    } catch (error) {
      errors.push(
        `Failed to merge files: ${error instanceof Error ? error.message : String(error)}`,
      );
      return Promise.resolve({
        success: false,
        content: targetContent,
        sourceFiles: [targetFile, sourceFile],
        conflicts,
        warnings,
        errors,
        transclusions,
      });
    }
  }

  private extractFrontmatterFromContent(content: string): string {
    const match = /^---\n(.*?)\n---\n/s.exec(content);
    return match ? match[0] : "";
  }

  private stripFrontmatter(content: string): string {
    return content.replace(/^---\n.*?\n---\n/s, "").trim();
  }
}

/**
 * Merge strategy that provides intelligent conflict detection and resolution.
 *
 * Analyzes both files to detect potential conflicts such as duplicate headers, overlapping content,
 * or structural issues. Provides automatic resolution where possible and clear reporting of
 * conflicts that need manual attention.
 *
 * @category Strategies
 *
 * @example
 *   Interactive merge with conflict resolution
 *   ```typescript
 *   const strategy = new InteractiveMergeStrategy({
 *   conflictResolution: 'auto',
 *   createTransclusions: true,
 *   preserveStructure: true
 *   });
 *
 *   const result = await strategy.merge(targetContent, sourceContent, 'target.md', 'source.md');
 *   console.log(`Merge completed with ${result.conflicts.length} conflicts detected`);
 *   ```
 */
export class InteractiveMergeStrategy extends BaseMergeStrategy {
  /**
   * Merges the files while recording each decision point as an unresolved conflict.
   *
   * Every duplicate header becomes a `header-collision` conflict and every source header becomes a `content-overlap` placement conflict, all marked as not auto-resolved. Two warnings state that manual resolution is required. The returned content is a fallback: the target, a `MERGE CONFLICT` comment and the source, each joined by the separator, with frontmatter merged when `mergeFrontmatter` is on.
   *
   * @param targetContent - The full content of the file being merged into, including any frontmatter.
   * @param sourceContent - The full content of the file being merged from, including any frontmatter.
   * @param targetFile - The path of the target file.
   * @param sourceFile - The path of the source file.
   * @returns The merged result, or a failed result with `errors` populated and the target content returned unchanged if merging throws.
   */
  merge(
    targetContent: string,
    sourceContent: string,
    targetFile: string,
    sourceFile: string,
  ): Promise<MergeResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts: MergeConflict[] = [];
    const transclusions: string[] = [];

    try {
      // Extract frontmatter and content
      const targetFrontmatter =
        this.extractFrontmatterFromContent(targetContent);
      const sourceFrontmatter =
        this.extractFrontmatterFromContent(sourceContent);
      const targetMainContent = this.stripFrontmatter(targetContent);
      const sourceMainContent = this.stripFrontmatter(sourceContent);

      // Analyze content for interactive decision points
      const headerConflicts = this.findHeaderConflicts(
        targetMainContent,
        sourceMainContent,
      );
      const sourceHeaders = this.extractHeaders(sourceMainContent);

      // Create interactive conflicts for each decision point
      for (const conflict of headerConflicts) {
        conflicts.push({
          type: "header-collision",
          description: `Duplicate header "${conflict.header}" - choose resolution strategy`,
          sourceFiles: [targetFile, sourceFile],
          resolution: "Manual resolution required: rename, merge, or skip",
          lines: [conflict.targetLine, conflict.sourceLine],
          autoResolved: false,
        });
      }

      // Create sections for each source header to allow interactive placement
      for (const header of sourceHeaders) {
        // const sectionContent = this.extractSectionContent(sourceMainContent, header);
        conflicts.push({
          type: "content-overlap",
          description: `Place section "${header.text}" from ${sourceFile}`,
          sourceFiles: [sourceFile],
          resolution:
            "Choose position: before, after, or replace existing content",
          lines: [header.line],
          autoResolved: false,
        });
      }

      // For now, create a basic merge that requires manual resolution
      warnings.push("Interactive merge requires manual conflict resolution");
      warnings.push("Use CLI interactive mode or resolve conflicts manually");

      // Create a basic append merge as fallback
      const separator = this.options.separator ?? "\n\n---\n\n";
      const mergedContent = `${
        targetMainContent + separator
      }<!-- MERGE CONFLICT: Review and resolve manually -->${separator}${sourceMainContent}`;

      return Promise.resolve({
        success: true,
        content: mergedContent,
        frontmatter: this.options.mergeFrontmatter
          ? this.mergeFrontmatter(targetFrontmatter, sourceFrontmatter)
          : targetFrontmatter,
        sourceFiles: [targetFile, sourceFile],
        conflicts,
        warnings,
        errors,
        transclusions,
      });
    } catch (error) {
      errors.push(
        `Failed to perform interactive merge: ${error instanceof Error ? error.message : String(error)}`,
      );
      return Promise.resolve({
        success: false,
        content: targetContent,
        sourceFiles: [targetFile, sourceFile],
        conflicts,
        warnings,
        errors,
        transclusions,
      });
    }
  }

  private extractFrontmatterFromContent(content: string): string {
    const match = /^---\n(.*?)\n---\n/s.exec(content);
    return match ? match[0] : "";
  }

  private stripFrontmatter(content: string): string {
    return content.replace(/^---\n.*?\n---\n/s, "").trim();
  }

  // private extractSectionContent(
  //   content: string,
  //   header: { text: string; level: number; line: number }
  // ): string {
  //   const lines = content.split('\n');
  //   const startLine = header.line - 1; // Convert to 0-based
  //   let endLine = lines.length;

  //   // Find the next header of the same or higher level
  //   for (let i = startLine + 1; i < lines.length; i++) {
  //     const line = lines[i];
  //     const match = line.match(/^(#+)\s+(.+)$/);
  //     if (match && match[1].length <= header.level) {
  //       endLine = i;
  //       break;
  //     }
  //   }

  //   return lines.slice(startLine, endLine).join('\n');
  // }
}
