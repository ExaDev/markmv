/**
 * Represents a section of content extracted during a split operation.
 *
 * Contains all information needed to create a separate file from a portion of the original markdown
 * content.
 *
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
 *
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
 *
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
 *
 * @category Strategies
 *
 * @example
 *   Implementing a custom split strategy
 *   ```typescript
 *   class CustomSplitStrategy extends BaseSplitStrategy {
 *   async split(content: string, originalFilename: string): Promise<SplitResult> {
 *   // Custom splitting logic
 *   const sections = this.customSplit(content);
 *   return { sections, remainingContent: undefined, errors: [], warnings: [] };
 *   }
 *   }
 *   ```
 */
export abstract class BaseSplitStrategy {
  protected options: SplitStrategyOptions;

  constructor(options: SplitStrategyOptions = {}) {
    this.options = {
      headerLevel: 2,
      preserveFrontmatter: true,
      filenamePattern: "{title}",
      ...options,
    };
  }

  abstract split(
    content: string,
    originalFilename: string,
  ): Promise<SplitResult>;

  /**
   * Returns `value` unless it is nullish or the empty string, in which case `fallback` is used --
   * an empty string is treated as "no value supplied" rather than a meaningful value to preserve.
   */
  protected static stringOrDefault(
    value: string | null | undefined,
    fallback: string,
  ): string {
    if (value) {
      return value;
    }
    return fallback;
  }

  /**
   * Returns `value` unless it is nullish or zero, in which case `fallback` is used -- zero is not a
   * meaningful value for these options (header levels start at 1, size limits must be positive).
   */
  protected static numberOrDefault(
    value: number | undefined,
    fallback: number,
  ): number {
    if (value) {
      return value;
    }
    return fallback;
  }

  /** Generate a safe filename from a title */
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

  /** Sanitize a string to be safe for use as filename */
  protected sanitizeFilename(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50);
  }

  /** Extract frontmatter from content */
  protected extractFrontmatter(content: string): {
    frontmatter: string;
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

  /** Extract title from header line */
  protected extractTitleFromHeader(headerLine: string): string {
    return headerLine.replace(/^#+\s*/, "").trim();
  }

  /** Count the header level (number of # characters) */
  protected getHeaderLevel(line: string): number {
    const match = /^(#+)(\s|$)/.exec(line);
    return match ? match[1].length : 0;
  }

  /** Check if a line is a header at or above the specified level */
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
 *
 * @category Strategies
 *
 * @example
 *   Header-based splitting
 *   ```typescript
 *   const strategy = new HeaderBasedSplitStrategy({
 *   headerLevel: 2,  // Split on ## headers
 *   outputDir: './sections/',
 *   filenamePattern: '{title}'
 *   });
 *
 *   const result = await strategy.split(content, 'document.md');
 *   console.log(`Created ${result.sections.length} sections`);
 *   ```
 */
export class HeaderBasedSplitStrategy extends BaseSplitStrategy {
  split(content: string, originalFilename: string): Promise<SplitResult> {
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
      errors.push(`No headers found at level ${String(targetLevel)} or above`);
    }

    return Promise.resolve({
      sections,
      remainingContent: this.options.preserveFrontmatter
        ? frontmatter
        : undefined,
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
 *
 * @category Strategies
 *
 * @example
 *   Size-based splitting
 *   ```typescript
 *   const strategy = new SizeBasedSplitStrategy({
 *   maxSize: 50,  // 50KB per file
 *   outputDir: './chunks/',
 *   filenamePattern: '{original}-part-{index}'
 *   });
 *
 *   const result = await strategy.split(content, 'large-document.md');
 *   console.log(`Split into ${result.sections.length} files under 50KB each`);
 *   ```
 */
export class SizeBasedSplitStrategy extends BaseSplitStrategy {
  split(content: string, originalFilename: string): Promise<SplitResult> {
    const { frontmatter, content: mainContent } =
      this.extractFrontmatter(content);
    const maxSizeBytes =
      BaseSplitStrategy.numberOrDefault(this.options.maxSize, 100) * 1024; // Convert KB to bytes
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
      remainingContent: this.options.preserveFrontmatter
        ? frontmatter
        : undefined,
      errors,
      warnings,
    });
  }

  private findNearestHeader(
    lines: string[],
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
 *
 * @category Strategies
 *
 * @example
 *   Manual marker splitting
 *   ```typescript
 *   const strategy = new ManualSplitStrategy({
 *   splitMarkers: ['<!-- split -->', '---BREAK---'],
 *   outputDir: './parts/',
 *   filenamePattern: '{title}'
 *   });
 *
 *   // Content with markers like: <!-- split -->
 *   const result = await strategy.split(content, 'document.md');
 *   ```
 */
export class ManualSplitStrategy extends BaseSplitStrategy {
  split(content: string, originalFilename: string): Promise<SplitResult> {
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

      startLine = endLine + 1; // Skip the marker line
    }

    return Promise.resolve({
      sections,
      remainingContent: this.options.preserveFrontmatter
        ? frontmatter
        : undefined,
      errors,
      warnings,
    });
  }

  private findSectionTitle(lines: string[]): string | null {
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
        return trimmed.substring(0, 50);
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
 *
 * @category Strategies
 *
 * @example
 *   Line-based splitting
 *   ```typescript
 *   const strategy = new LineBasedSplitStrategy({
 *   splitLines: [100, 250, 400],  // Split at these line numbers
 *   outputDir: './sections/',
 *   filenamePattern: 'section-{index}'
 *   });
 *
 *   const result = await strategy.split(content, 'document.md');
 *   console.log(`Split at lines: ${strategy.options.splitLines?.join(', ')}`);
 *   ```
 */
export class LineBasedSplitStrategy extends BaseSplitStrategy {
  split(content: string, originalFilename: string): Promise<SplitResult> {
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
        remainingContent: this.options.preserveFrontmatter
          ? frontmatter
          : undefined,
        errors,
        warnings,
      });
    }

    // Split content at specified lines
    let startLine = 0;

    for (let i = 0; i <= uniqueSplitLines.length; i++) {
      const endLine =
        i < uniqueSplitLines.length
          ? uniqueSplitLines[i] - 1 // Convert to 0-based and split before the line
          : lines.length;

      if (endLine > startLine) {
        const sectionLines = lines.slice(startLine, endLine);
        const sectionContent = sectionLines.join("\n");

        if (sectionContent.trim()) {
          // Only create section if it has content
          // Find title for this section
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
      remainingContent: this.options.preserveFrontmatter
        ? frontmatter
        : undefined,
      errors,
      warnings,
    });
  }

  private findLineSectionTitle(
    lines: string[],
    actualStartLine: number,
  ): string | null {
    // Look for the first header in the section
    for (const line of lines) {
      if (this.getHeaderLevel(line) > 0) {
        return this.extractTitleFromHeader(line);
      }
    }

    // If no header, try to extract from first meaningful line
    // Look for lines that seem like good titles (complete thoughts, not fragments)
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

        // Use first few words as title, but limit to reasonable length
        const words = trimmed.split(/\s+/).slice(0, 5).join(" ");
        // If the line is long, truncate it
        if (words.length > 50) {
          return `${words.substring(0, 47)}...`;
        }
        // If it's a sentence, remove trailing punctuation for cleaner title
        return words.replace(/[.!?]+$/, "");
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
        const words = trimmed.split(/\s+/).slice(0, 5).join(" ");
        if (words.length > 50) {
          return `${words.substring(0, 47)}...`;
        }
        return words.replace(/[.!?]+$/, "");
      }
    }

    return `Section starting at line ${String(actualStartLine)}`;
  }
}
