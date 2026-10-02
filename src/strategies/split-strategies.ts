/** Longest slug a section title is reduced to when it becomes a filename. */
const MAX_SLUG_LENGTH = 50;

/** Size limit, in kilobytes, applied by the size strategy when `maxSize` is absent or zero. */
const DEFAULT_MAX_SIZE_KB = 100;

const BYTES_PER_KB = 1024;

/** Number of leading words of a line that make up a derived section title. */
const TITLE_WORD_COUNT = 5;

/** Longest derived section title, ellipsis included. */
const MAX_TITLE_LENGTH = 50;

const TITLE_ELLIPSIS = "...";

/**
 * Derives a section title from a prose line: its first few words, truncated with an ellipsis when long and stripped of trailing sentence punctuation otherwise.
 */
function titleFromLine(line: string): string {
  const words = line.split(/\s+/).slice(0, TITLE_WORD_COUNT).join(" ");
  if (words.length > MAX_TITLE_LENGTH) {
    return `${words.substring(0, MAX_TITLE_LENGTH - TITLE_ELLIPSIS.length)}${TITLE_ELLIPSIS}`;
  }

  return words.replace(/[.!?]+$/, "");
}

/**
 * Represents a section of content extracted during a split operation.
 *
 * Contains all information needed to create a separate file from a portion of the original markdown
 * content.
 * @category Strategies
 */
export interface SplitSection {
  /** Section title/identifier */
  title: string;
  /** Content of this section */
  content: string;
  /** Starting line number in original file */
  startLine: number;
  /** Ending line number in original file */
  endLine: number;
  /** Header level (1-6 for # to ######) */
  headerLevel?: number;
  /** Suggested filename for this section */
  filename: string;
}

/**
 * Result of a split operation containing extracted sections and metadata.
 *
 * Provides information about all sections that were created and any content that remains in the
 * original file.
 * @category Strategies
 */
export interface SplitResult {
  /** Array of sections to create as separate files */
  sections: SplitSection[];
  /** Any content that should remain in the original file */
  remainingContent: string | undefined;
  /** Errors encountered during splitting */
  errors: string[];
  /** Warnings */
  warnings: string[];
}

/**
 * Configuration options for split strategy operations.
 *
 * Controls various aspects of the splitting process including output location, splitting criteria,
 * and filename generation patterns.
 * @category Strategies
 */
export interface SplitStrategyOptions {
  /** Output directory for split files */
  outputDir?: string;
  /** Maximum file size in KB (for size-based strategy) */
  maxSize?: number;
  /** Header level to split on (for header-based strategy) */
  headerLevel?: number;
  /** Custom split markers (for manual strategy) */
  splitMarkers?: string[];
  /** Line numbers to split on (for line-based strategy) */
  splitLines?: number[] | undefined;
  /** Whether to preserve frontmatter in original file */
  preserveFrontmatter?: boolean;
  /** Filename pattern for generated files */
  filenamePattern?: string;
}

/**
 * Abstract base class for all split strategies.
 *
 * Provides common functionality for splitting markdown files including filename generation,
 * frontmatter handling, and content sanitization. Concrete strategies implement specific splitting
 * algorithms.
 * @category Strategies
 * @example
 *   Implementing a custom split strategy
 * ```typescript
 *   class CustomSplitStrategy extends BaseSplitStrategy {
 *     async split(content: string, originalFilename: string): Promise<SplitResult> {
 *       // Custom splitting logic
 *       const sections = this.customSplit(content);
 *       return { sections, remainingContent: undefined, errors: [], warnings: [] };
 *     }
 *   }
 * ```
 */
export abstract class BaseSplitStrategy {
  /** The effective options for this strategy: the supplied options layered over the defaults set in the constructor. */
  protected options: SplitStrategyOptions;

  /**
   * Creates a split strategy.
   *
   * The defaults are a header level of 2, frontmatter preserved in the original file, and the `{title}` filename pattern. Any supplied option overrides its default.
   * @param options - Options that override the defaults.
   */
  constructor(options: SplitStrategyOptions = {}) {
    this.options = {
      headerLevel: 2,
      preserveFrontmatter: true,
      filenamePattern: "{title}",
      ...options,
    };
  }

  /**
   * Divides content into sections that can each become their own file.
   *
   * Each concrete strategy decides where the split points are. Problems are reported in the result's `errors` and `warnings` rather than thrown.
   * @param content - The full content of the file to split, including any frontmatter.
   * @param originalFilename - The name of the file being split, used when generating section filenames.
   * @returns The sections to create, the content to leave in the original file (the frontmatter when `preserveFrontmatter` is on), and any errors and warnings.
   */
  abstract split(
    content: string,
    originalFilename: string,
  ): Promise<SplitResult>;

  /**
   * Returns `value` unless it is nullish or the empty string, in which case `fallback` is used,
   * an empty string is treated as "no value supplied" rather than a meaningful value to preserve.
   */
  protected static stringOrDefault(
    value: string | null | undefined,
    fallback: string,
  ): string {
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }

    return fallback;
  }

  /**
   * Returns `value` unless it is nullish or zero, in which case `fallback` is used, since zero is not a
   * meaningful value for these options (header levels start at 1, size limits must be positive).
   */
  protected static numberOrDefault(
    value: number | undefined,
    fallback: number,
  ): number {
    if (value !== undefined && value !== 0 && !Number.isNaN(value)) {
      return value;
    }

    return fallback;
  }

  /**
   * Generates a filename for a section from the `filenamePattern` option.
   *
   * `{title}` is replaced by the sanitised title (or `section-N` when that is empty), `{index}` by the one-based index and `{original}` by the original filename without its extension. The original file's extension is appended, defaulting to `.md`.
   * @param title - The section title.
   * @param index - The zero-based position of the section.
   * @param originalFilename - The name of the file being split.
   * @returns The generated filename.
   */
  protected generateFilename(
    title: string,
    index: number,
    originalFilename: string,
  ): string {
    const pattern = BaseSplitStrategy.stringOrDefault(
      this.options.filenamePattern,
      "{title}",
    );
    const baseName =
      this.sanitizeFilename(title) || `section-${String(index + 1)}`;
    const extension = /\.[^.]+$/.exec(originalFilename)?.[0] ?? ".md";

    return (
      pattern
        .replace("{title}", baseName)
        .replace("{index}", String(index + 1))
        .replace("{original}", originalFilename.replace(/\.[^.]+$/, "")) +
      extension
    );
  }

  /**
   * Converts a string into a filename-safe slug.
   *
   * The text is lower-cased, characters other than letters, digits, spaces and hyphens are removed, whitespace becomes hyphens, repeated and surrounding hyphens are collapsed, and the result is limited to 50 characters.
   * @param str - The text to convert.
   * @returns The slug, which may be empty.
   */
  protected sanitizeFilename(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, MAX_SLUG_LENGTH);
  }

  /**
   * Separates a leading frontmatter block from the rest of the content.
   * @param content - The full file content.
   * @returns The split content.
   */
  protected extractFrontmatter(content: string): {
    /** The leading `---` delimited block including its delimiters, or an empty string when there is none. */
    frontmatter: string;
    /** The content following the frontmatter, or the whole input when there is none. */
    content: string;
  } {
    const frontmatterMatch = /^---\n(.*?)\n---\n/s.exec(content);

    if (frontmatterMatch) {
      return {
        frontmatter: frontmatterMatch[0],
        content: content.substring(frontmatterMatch[0].length),
      };
    }

    return { frontmatter: "", content };
  }

  /**
   * Extracts the title text from a header line.
   * @param headerLine - A markdown header line.
   * @returns The text after the `#` markers, trimmed.
   */
  protected extractTitleFromHeader(headerLine: string): string {
    return headerLine.replace(/^#+\s*/, "").trim();
  }

  /**
   * Returns the header level of a line.
   * @param line - The line to inspect.
   * @returns The number of leading `#` characters when the line is a header (the markers followed by whitespace or the end of the line), otherwise 0.
   */
  protected getHeaderLevel(line: string): number {
    const match = /^(#+)(\s|$)/.exec(line);

    return match ? match[1].length : 0;
  }

  /**
   * Checks whether a line is a header of exactly the given level.
   * @param line - The line to inspect.
   * @param targetLevel - The header level to match.
   * @returns True when the line's header level equals `targetLevel`; headers of other levels do not match.
   */
  protected isTargetHeader(line: string, targetLevel: number): boolean {
    const level = this.getHeaderLevel(line);

    return level === targetLevel;
  }
}

/**
 * Split strategy that divides content based on markdown headers.
 *
 * Splits the file at headers of a specified level, creating a new file for each section. This is
 * ideal for documents with clear hierarchical structure where each major section can stand alone.
 * @category Strategies
 * @example
 *   Header-based splitting
 * ```typescript
 *   const strategy = new HeaderBasedSplitStrategy({
 *       headerLevel: 2,  // Split on ## headers
 *       outputDir: './sections/',
 *       filenamePattern: '{title}'
 *   });
 *
 *   const result = await strategy.split(content, 'document.md');
 *   console.log(`Created ${result.sections.length} sections`);
 * ```
 */
export class HeaderBasedSplitStrategy extends BaseSplitStrategy {
  /**
   * Splits at every header of the `headerLevel` option (default 2).
   *
   * Only headers of exactly that level start a section, so deeper headers stay inside their parent section. Each section runs from its header to the line before the next matching header, and content before the first matching header is not placed in any section. An empty header produces a warning and a numbered title. If no matching header exists, an error is recorded.
   * @param content - The full content of the file to split, including any frontmatter.
   * @param originalFilename - The name of the file being split, used when generating section filenames.
   * @returns The sections, titled by their header text, with the frontmatter as remaining content when `preserveFrontmatter` is on.
   */
  async split(content: string, originalFilename: string): Promise<SplitResult> {
    const { frontmatter, content: mainContent } =
      this.extractFrontmatter(content);
    const lines = mainContent.split("\n");
    const sections: SplitSection[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const targetLevel = BaseSplitStrategy.numberOrDefault(
      this.options.headerLevel,
      2,
    );

    let currentSection: {
      title: string;
      content: string[];
      startLine: number;
      headerLevel: number;
    } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (this.isTargetHeader(line, targetLevel)) {
        // Save previous section
        if (currentSection) {
          sections.push({
            title: currentSection.title,
            content: currentSection.content.join("\n"),
            startLine: currentSection.startLine,
            endLine: i - 1,
            headerLevel: currentSection.headerLevel,
            filename: this.generateFilename(
              currentSection.title,
              sections.length,
              originalFilename,
            ),
          });
        }

        // Start new section
        const title = this.extractTitleFromHeader(line);
        const headerLevel = this.getHeaderLevel(line);

        if (!title.trim()) {
          warnings.push(`Empty header found at line ${String(i + 1)}`);
        }

        currentSection = {
          title: title || `Section ${String(sections.length + 1)}`,
          content: [line],
          startLine: i,
          headerLevel,
        };
      } else if (currentSection) {
        currentSection.content.push(line);
      }
    }

    // Save the last section
    if (currentSection) {
      sections.push({
        title: currentSection.title,
        content: currentSection.content.join("\n"),
        startLine: currentSection.startLine,
        endLine: lines.length - 1,
        headerLevel: currentSection.headerLevel,
        filename: this.generateFilename(
          currentSection.title,
          sections.length,
          originalFilename,
        ),
      });
    }

    if (sections.length === 0) {
      errors.push(`No headers found at level ${String(targetLevel)}`);
    }

    return Promise.resolve({
      sections,
      remainingContent:
        this.options.preserveFrontmatter === true ? frontmatter : undefined,
      errors,
      warnings,
    });
  }
}

/**
 * Split strategy that divides content based on file size limits.
 *
 * Creates new files when the current section exceeds a specified size limit. This ensures that no
 * generated file becomes too large, which is useful for performance or platform constraints.
 * @category Strategies
 * @example
 *   Size-based splitting
 * ```typescript
 *   const strategy = new SizeBasedSplitStrategy({
 *       maxSize: 50,  // 50KB per file
 *       outputDir: './chunks/',
 *       filenamePattern: '{original}-part-{index}'
 *   });
 *
 *   const result = await strategy.split(content, 'large-document.md');
 *   console.log(`Split into ${result.sections.length} files under 50KB each`);
 * ```
 */
export class SizeBasedSplitStrategy extends BaseSplitStrategy {
  /**
   * Splits into consecutive parts that stay within the `maxSize` option (in kilobytes, default 100).
   *
   * Lines are accumulated until adding the next one would exceed the limit, then a new part starts at that line, so splits fall on line boundaries and a single line larger than the limit becomes a part of its own. Each part is titled after the nearest header (searching backwards from its first line, then forwards), or `Part N` when the content has no headers. Filenames from the second part onwards carry an index suffix to keep them unique. An error is recorded when the content yields no parts.
   * @param content - The full content of the file to split, including any frontmatter.
   * @param originalFilename - The name of the file being split, used when generating section filenames.
   * @returns The parts, with the frontmatter as remaining content when `preserveFrontmatter` is on.
   */
  async split(content: string, originalFilename: string): Promise<SplitResult> {
    const { frontmatter, content: mainContent } =
      this.extractFrontmatter(content);
    const maxSizeBytes =
      BaseSplitStrategy.numberOrDefault(
        this.options.maxSize,
        DEFAULT_MAX_SIZE_KB,
      ) * BYTES_PER_KB;
    const lines = mainContent.split("\n");
    const sections: SplitSection[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    let currentSection: {
      title: string;
      content: string[];
      startLine: number;
      size: number;
    } | null = null;

    let sectionCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineSize = Buffer.byteLength(`${line}\n`, "utf8");

      // Start new section if needed
      if (!currentSection) {
        const title = BaseSplitStrategy.stringOrDefault(
          this.findNearestHeader(lines, i),
          `Part ${String(sectionCount + 1)}`,
        );
        currentSection = {
          title,
          content: [],
          startLine: i,
          size: 0,
        };
      }

      // Check if adding this line would exceed size limit
      if (
        currentSection.size + lineSize > maxSizeBytes &&
        currentSection.content.length > 0
      ) {
        // Save current section
        sections.push({
          title: currentSection.title,
          content: currentSection.content.join("\n"),
          startLine: currentSection.startLine,
          endLine: i - 1,
          filename: this.generateSizeBasedFilename(
            currentSection.title,
            sections.length,
            originalFilename,
          ),
        });

        // Start new section
        const title = BaseSplitStrategy.stringOrDefault(
          this.findNearestHeader(lines, i),
          `Part ${String(sections.length + 1)}`,
        );
        currentSection = {
          title,
          content: [line],
          startLine: i,
          size: lineSize,
        };
        sectionCount++;
      } else {
        currentSection.content.push(line);
        currentSection.size += lineSize;
      }
    }

    // Save the last section
    if (currentSection && currentSection.content.length > 0) {
      sections.push({
        title: currentSection.title,
        content: currentSection.content.join("\n"),
        startLine: currentSection.startLine,
        endLine: lines.length - 1,
        filename: this.generateSizeBasedFilename(
          currentSection.title,
          sections.length,
          originalFilename,
        ),
      });
    }

    if (sections.length === 0) {
      errors.push("Content is empty or could not be split");
    }

    return Promise.resolve({
      sections,
      remainingContent:
        this.options.preserveFrontmatter === true ? frontmatter : undefined,
      errors,
      warnings,
    });
  }

  private findNearestHeader(
    lines: readonly string[],
    startIndex: number,
  ): string | null {
    // Look backwards for a header
    for (let i = startIndex; i >= 0; i--) {
      if (this.getHeaderLevel(lines[i]) > 0) {
        return this.extractTitleFromHeader(lines[i]);
      }
    }

    // Look forwards for a header
    for (let i = startIndex; i < lines.length; i++) {
      if (this.getHeaderLevel(lines[i]) > 0) {
        return this.extractTitleFromHeader(lines[i]);
      }
    }

    return null;
  }

  /** Generate filename for size-based sections, ensuring uniqueness */
  private generateSizeBasedFilename(
    title: string,
    index: number,
    originalFilename: string,
  ): string {
    const pattern = BaseSplitStrategy.stringOrDefault(
      this.options.filenamePattern,
      "{title}",
    );
    let baseName = this.sanitizeFilename(title) || `part-${String(index + 1)}`;
    const extension = /\.[^.]+$/.exec(originalFilename)?.[0] ?? ".md";

    // Always append index for size-based splits to ensure uniqueness
    if (index > 0) {
      baseName = `${baseName}-${String(index + 1)}`;
    }

    return (
      pattern
        .replace("{title}", baseName)
        .replace("{index}", String(index + 1))
        .replace("{original}", originalFilename.replace(/\.[^.]+$/, "")) +
      extension
    );
  }
}

/**
 * Split strategy that divides content at manually specified markers.
 *
 * Looks for specific comment markers or text patterns in the content to determine split points.
 * This provides precise control over where splits occur, regardless of content structure.
 * @category Strategies
 * @example
 *   Manual marker splitting
 * ```typescript
 *   const strategy = new ManualSplitStrategy({
 *       splitMarkers: ['<!-- split -->', '---BREAK---'],
 *       outputDir: './parts/',
 *       filenamePattern: '{title}'
 *   });
 *
 *   // Content with markers like: <!-- split -->
 *   const result = await strategy.split(content, 'document.md');
 * ```
 */
export class ManualSplitStrategy extends BaseSplitStrategy {
  /**
   * Splits at lines that contain one of the `splitMarkers` (default `<!-- split -->` and `---split---`).
   *
   * The marker lines are dropped and the text between them becomes the sections, including the text before the first marker and after the last. A section is titled by its first header, otherwise by its first line of text (limited to 50 characters) that is not a comment or rule, otherwise `Section N`. When no marker is found a warning is added, no sections are returned, and the whole original content is returned as remaining content.
   * @param content - The full content of the file to split, including any frontmatter.
   * @param originalFilename - The name of the file being split, used when generating section filenames.
   * @returns The sections, with the frontmatter as remaining content when `preserveFrontmatter` is on.
   */
  async split(content: string, originalFilename: string): Promise<SplitResult> {
    const { frontmatter, content: mainContent } =
      this.extractFrontmatter(content);
    const markers = this.options.splitMarkers ?? [
      "<!-- split -->",
      "---split---",
    ];
    const sections: SplitSection[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // Find all split markers
    const splitPositions: number[] = [];
    const lines = mainContent.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (markers.some((marker) => line.includes(marker))) {
        splitPositions.push(i);
      }
    }

    if (splitPositions.length === 0) {
      warnings.push(
        "No split markers found. Use <!-- split --> or ---split--- to mark split points.",
      );

      return Promise.resolve({
        sections: [],
        remainingContent: content,
        errors,
        warnings,
      });
    }

    // Split content at markers
    let startLine = 0;

    for (let i = 0; i <= splitPositions.length; i++) {
      const endLine =
        i < splitPositions.length ? splitPositions[i] : lines.length;

      if (endLine > startLine) {
        const sectionLines = lines.slice(startLine, endLine);
        const sectionContent = sectionLines.join("\n");

        // Find title for this section
        const title = BaseSplitStrategy.stringOrDefault(
          this.findSectionTitle(sectionLines),
          `Section ${String(i + 1)}`,
        );

        sections.push({
          title,
          content: sectionContent,
          startLine,
          endLine: endLine - 1,
          filename: this.generateFilename(
            title,
            sections.length,
            originalFilename,
          ),
        });
      }

      // Skip the marker line
      startLine = endLine + 1;
    }

    return Promise.resolve({
      sections,
      remainingContent:
        this.options.preserveFrontmatter === true ? frontmatter : undefined,
      errors,
      warnings,
    });
  }

  private findSectionTitle(lines: readonly string[]): string | null {
    // Look for the first header in the section
    for (const line of lines) {
      if (this.getHeaderLevel(line) > 0) {
        return this.extractTitleFromHeader(line);
      }
    }

    // If no header, try to extract from first non-empty line
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed &&
        !trimmed.startsWith("<!--") &&
        !trimmed.startsWith("---")
      ) {
        return trimmed.substring(0, MAX_SLUG_LENGTH);
      }
    }

    return null;
  }
}

/**
 * Split strategy that divides content at specific line numbers.
 *
 * Allows precise splitting at user-specified line numbers. This is useful when you know exactly
 * where you want to split a document, perhaps based on analysis or external requirements.
 * @category Strategies
 * @example
 *   Line-based splitting
 * ```typescript
 *   const strategy = new LineBasedSplitStrategy({
 *       splitLines: [100, 250, 400],  // Split at these line numbers
 *       outputDir: './sections/',
 *       filenamePattern: 'section-{index}'
 *   });
 *
 *   const result = await strategy.split(content, 'document.md');
 *   console.log(`Split at lines: ${strategy.options.splitLines?.join(', ')}`);
 * ```
 */
export class LineBasedSplitStrategy extends BaseSplitStrategy {
  /**
   * Splits before each one-based line number in the `splitLines` option.
   *
   * Line numbers are de-duplicated and sorted, and numbering counts lines after the frontmatter. A number below 1 or beyond the last line produces a warning; a number only slightly past the end is treated as the last line. Sections containing only whitespace are skipped. Each section is titled by its first header, otherwise by the first few words of its first suitable line, otherwise by its starting line. With no `splitLines`, an error is recorded and the whole original content is returned as remaining content. When no valid line remains, the content is returned as a single section.
   * @param content - The full content of the file to split, including any frontmatter.
   * @param originalFilename - The name of the file being split, used when generating section filenames.
   * @returns The sections, with the frontmatter as remaining content when `preserveFrontmatter` is on.
   */
  async split(content: string, originalFilename: string): Promise<SplitResult> {
    const { frontmatter, content: mainContent } =
      this.extractFrontmatter(content);
    const splitLines = this.options.splitLines ?? [];
    const sections: SplitSection[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    if (splitLines.length === 0) {
      errors.push(
        "No split lines specified. Use --split-lines option with comma-separated line numbers.",
      );

      return Promise.resolve({
        sections: [],
        remainingContent: content,
        errors,
        warnings,
      });
    }

    const lines = mainContent.split("\n");
    const totalLines = lines.length;

    // Validate and sort split lines, adjusting invalid ones when possible
    const validSplitLines: number[] = [];

    for (const lineNum of splitLines) {
      if (lineNum < 1) {
        warnings.push(
          `Invalid line number ${String(lineNum)}: file has ${String(totalLines)} lines`,
        );
      } else if (lineNum > totalLines) {
        warnings.push(
          `Invalid line number ${String(lineNum)}: file has ${String(totalLines)} lines`,
        );
        // Adjust to split at end if reasonably close
        if (lineNum <= totalLines + 2) {
          validSplitLines.push(totalLines);
        }
      } else {
        validSplitLines.push(lineNum);
      }
    }

    // Remove duplicates and sort
    const uniqueSplitLines = [...new Set(validSplitLines)].sort(
      (a, b) => a - b,
    );

    if (uniqueSplitLines.length === 0) {
      // Still create sections from the content if there are valid sections to create
      if (lines.length > 0 && lines.some((line) => line.trim())) {
        const title = BaseSplitStrategy.stringOrDefault(
          this.findLineSectionTitle(lines, 1),
          "Content",
        );
        sections.push({
          title,
          content: lines.join("\n"),
          startLine: 0,
          endLine: lines.length - 1,
          filename: this.generateFilename(title, 0, originalFilename),
        });
      }

      return Promise.resolve({
        sections,
        remainingContent:
          this.options.preserveFrontmatter === true ? frontmatter : undefined,
        errors,
        warnings,
      });
    }

    // Split content at specified lines
    let startLine = 0;

    for (let i = 0; i <= uniqueSplitLines.length; i++) {
      // Convert to 0-based and split before the line
      const endLine =
        i < uniqueSplitLines.length ? uniqueSplitLines[i] - 1 : lines.length;

      if (endLine > startLine) {
        const sectionLines = lines.slice(startLine, endLine);
        const sectionContent = sectionLines.join("\n");

        if (sectionContent.trim()) {
          /* Only create section if it has content
             Find title for this section */
          const title = BaseSplitStrategy.stringOrDefault(
            this.findLineSectionTitle(sectionLines, startLine + 1),
            `Lines ${String(startLine + 1)}-${String(endLine)}`,
          );

          sections.push({
            title,
            content: sectionContent,
            startLine,
            endLine: endLine - 1,
            filename: this.generateFilename(
              title,
              sections.length,
              originalFilename,
            ),
          });
        }
      }

      startLine = endLine;
    }

    if (sections.length === 0) {
      errors.push("No sections were created from the specified line splits");
    }

    return Promise.resolve({
      sections,
      remainingContent:
        this.options.preserveFrontmatter === true ? frontmatter : undefined,
      errors,
      warnings,
    });
  }

  private findLineSectionTitle(
    lines: readonly string[],
    actualStartLine: number,
  ): string | null {
    // Look for the first header in the section
    for (const line of lines) {
      if (this.getHeaderLevel(line) > 0) {
        return this.extractTitleFromHeader(line);
      }
    }

    /* If no header, try to extract from first meaningful line
       Look for lines that seem like good titles (complete thoughts, not fragments) */
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed &&
        !trimmed.startsWith("<!--") &&
        !trimmed.startsWith("---")
      ) {
        // Skip obvious continuation/fragment lines
        if (/^(the|that|and|or|but|with|for|in|on|at|to|of)\s/i.exec(trimmed)) {
          continue;
        }

        return titleFromLine(trimmed);
      }
    }

    // Fallback to first non-empty line if no good title found
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed &&
        !trimmed.startsWith("<!--") &&
        !trimmed.startsWith("---")
      ) {
        return titleFromLine(trimmed);
      }
    }

    return `Section starting at line ${String(actualStartLine)}`;
  }
}
