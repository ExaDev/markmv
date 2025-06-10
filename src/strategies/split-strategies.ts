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

export abstract class BaseSplitStrategy {
  protected options: SplitStrategyOptions;

  constructor(options: SplitStrategyOptions = {}) {
    this.options = {
      headerLevel: 2,
      preserveFrontmatter: true,
      filenamePattern: '{title}',
      ...options,
    };
  }

  abstract split(content: string, originalFilename: string): Promise<SplitResult>;

  /**
   * Generate a safe filename from a title
   */
  protected generateFilename(title: string, index: number, originalFilename: string): string {
    const pattern = this.options.filenamePattern!;
    const baseName = this.sanitizeFilename(title) || `section-${index + 1}`;
    const extension = originalFilename.match(/\.[^.]+$/)?.[0] || '.md';

    return (
      pattern
        .replace('{title}', baseName)
        .replace('{index}', String(index + 1))
        .replace('{original}', originalFilename.replace(/\.[^.]+$/, '')) + extension
    );
  }

  /**
   * Sanitize a string to be safe for use as filename
   */
  protected sanitizeFilename(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  /**
   * Extract frontmatter from content
   */
  protected extractFrontmatter(content: string): { frontmatter: string; content: string } {
    const frontmatterMatch = content.match(/^---\n(.*?)\n---\n/s);

    if (frontmatterMatch) {
      return {
        frontmatter: frontmatterMatch[0],
        content: content.substring(frontmatterMatch[0].length),
      };
    }

    return { frontmatter: '', content };
  }

  /**
   * Extract title from header line
   */
  protected extractTitleFromHeader(headerLine: string): string {
    return headerLine.replace(/^#+\s*/, '').trim();
  }

  /**
   * Count the header level (number of # characters)
   */
  protected getHeaderLevel(line: string): number {
    const match = line.match(/^(#+)\s/);
    return match ? match[1].length : 0;
  }

  /**
   * Check if a line is a header at or above the specified level
   */
  protected isTargetHeader(line: string, targetLevel: number): boolean {
    const level = this.getHeaderLevel(line);
    return level > 0 && level <= targetLevel;
  }
}

export class HeaderBasedSplitStrategy extends BaseSplitStrategy {
  async split(content: string, originalFilename: string): Promise<SplitResult> {
    const { frontmatter, content: mainContent } = this.extractFrontmatter(content);
    const lines = mainContent.split('\n');
    const sections: SplitSection[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const targetLevel = this.options.headerLevel!;

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
            content: currentSection.content.join('\n'),
            startLine: currentSection.startLine,
            endLine: i - 1,
            headerLevel: currentSection.headerLevel,
            filename: this.generateFilename(
              currentSection.title,
              sections.length,
              originalFilename
            ),
          });
        }

        // Start new section
        const title = this.extractTitleFromHeader(line);
        const headerLevel = this.getHeaderLevel(line);

        if (!title) {
          warnings.push(`Empty header found at line ${i + 1}`);
        }

        currentSection = {
          title: title || `Section ${sections.length + 1}`,
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
        content: currentSection.content.join('\n'),
        startLine: currentSection.startLine,
        endLine: lines.length - 1,
        headerLevel: currentSection.headerLevel,
        filename: this.generateFilename(currentSection.title, sections.length, originalFilename),
      });
    }

    if (sections.length === 0) {
      errors.push(`No headers found at level ${targetLevel} or above`);
    }

    return {
      sections,
      remainingContent: this.options.preserveFrontmatter ? frontmatter : undefined,
      errors,
      warnings,
    };
  }
}

export class SizeBasedSplitStrategy extends BaseSplitStrategy {
  async split(content: string, originalFilename: string): Promise<SplitResult> {
    const { frontmatter, content: mainContent } = this.extractFrontmatter(content);
    const maxSizeBytes = (this.options.maxSize || 100) * 1024; // Convert KB to bytes
    const lines = mainContent.split('\n');
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
      const lineSize = Buffer.byteLength(`${line}\n`, 'utf8');

      // Start new section if needed
      if (!currentSection) {
        const title = this.findNearestHeader(lines, i) || `Part ${sectionCount + 1}`;
        currentSection = {
          title,
          content: [],
          startLine: i,
          size: 0,
        };
      }

      // Check if adding this line would exceed size limit
      if (currentSection.size + lineSize > maxSizeBytes && currentSection.content.length > 0) {
        // Save current section
        sections.push({
          title: currentSection.title,
          content: currentSection.content.join('\n'),
          startLine: currentSection.startLine,
          endLine: i - 1,
          filename: this.generateFilename(currentSection.title, sections.length, originalFilename),
        });

        // Start new section
        const title = this.findNearestHeader(lines, i) || `Part ${sections.length + 1}`;
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
        content: currentSection.content.join('\n'),
        startLine: currentSection.startLine,
        endLine: lines.length - 1,
        filename: this.generateFilename(currentSection.title, sections.length, originalFilename),
      });
    }

    if (sections.length === 0) {
      errors.push('Content is empty or could not be split');
    }

    return {
      sections,
      remainingContent: this.options.preserveFrontmatter ? frontmatter : undefined,
      errors,
      warnings,
    };
  }

  private findNearestHeader(lines: string[], startIndex: number): string | null {
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
}

export class ManualSplitStrategy extends BaseSplitStrategy {
  async split(content: string, originalFilename: string): Promise<SplitResult> {
    const { frontmatter, content: mainContent } = this.extractFrontmatter(content);
    const markers = this.options.splitMarkers || ['<!-- split -->', '---split---'];
    const sections: SplitSection[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // Find all split markers
    const splitPositions: number[] = [];
    const lines = mainContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (markers.some((marker) => line.includes(marker))) {
        splitPositions.push(i);
      }
    }

    if (splitPositions.length === 0) {
      warnings.push(
        'No split markers found. Use <!-- split --> or ---split--- to mark split points.'
      );
      return {
        sections: [],
        remainingContent: content,
        errors,
        warnings,
      };
    }

    // Split content at markers
    let startLine = 0;

    for (let i = 0; i <= splitPositions.length; i++) {
      const endLine = i < splitPositions.length ? splitPositions[i] : lines.length;

      if (endLine > startLine) {
        const sectionLines = lines.slice(startLine, endLine);
        const sectionContent = sectionLines.join('\n');

        // Find title for this section
        const title = this.findSectionTitle(sectionLines) || `Section ${i + 1}`;

        sections.push({
          title,
          content: sectionContent,
          startLine,
          endLine: endLine - 1,
          filename: this.generateFilename(title, sections.length, originalFilename),
        });
      }

      startLine = endLine + 1; // Skip the marker line
    }

    return {
      sections,
      remainingContent: this.options.preserveFrontmatter ? frontmatter : undefined,
      errors,
      warnings,
    };
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
      if (trimmed && !trimmed.startsWith('<!--') && !trimmed.startsWith('---')) {
        return trimmed.substring(0, 50);
      }
    }

    return null;
  }
}

export class LineBasedSplitStrategy extends BaseSplitStrategy {
  async split(content: string, originalFilename: string): Promise<SplitResult> {
    const { frontmatter, content: mainContent } = this.extractFrontmatter(content);
    const splitLines = this.options.splitLines || [];
    const sections: SplitSection[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    if (splitLines.length === 0) {
      errors.push(
        'No split lines specified. Use --split-lines option with comma-separated line numbers.'
      );
      return {
        sections: [],
        remainingContent: content,
        errors,
        warnings,
      };
    }

    const lines = mainContent.split('\n');
    const totalLines = lines.length;

    // Validate and sort split lines
    const validSplitLines = splitLines
      .filter((lineNum) => {
        if (lineNum < 1 || lineNum > totalLines) {
          warnings.push(`Invalid line number ${lineNum}: file has ${totalLines} lines`);
          return false;
        }
        return true;
      })
      .sort((a, b) => a - b);

    if (validSplitLines.length === 0) {
      errors.push('No valid split lines after validation');
      return {
        sections: [],
        remainingContent: content,
        errors,
        warnings,
      };
    }

    // Split content at specified lines
    let startLine = 0;

    for (let i = 0; i <= validSplitLines.length; i++) {
      const endLine =
        i < validSplitLines.length
          ? validSplitLines[i] - 1 // Convert to 0-based and split before the line
          : lines.length;

      if (endLine > startLine) {
        const sectionLines = lines.slice(startLine, endLine);
        const sectionContent = sectionLines.join('\n');

        if (sectionContent.trim()) {
          // Only create section if it has content
          // Find title for this section
          const title =
            this.findLineSectionTitle(sectionLines, startLine + 1) ||
            `Lines ${startLine + 1}-${endLine}`;

          sections.push({
            title,
            content: sectionContent,
            startLine,
            endLine: endLine - 1,
            filename: this.generateFilename(title, sections.length, originalFilename),
          });
        }
      }

      startLine = endLine;
    }

    if (sections.length === 0) {
      errors.push('No sections were created from the specified line splits');
    }

    return {
      sections,
      remainingContent: this.options.preserveFrontmatter ? frontmatter : undefined,
      errors,
      warnings,
    };
  }

  private findLineSectionTitle(lines: string[], actualStartLine: number): string | null {
    // Look for the first header in the section
    for (const line of lines) {
      if (this.getHeaderLevel(line) > 0) {
        return this.extractTitleFromHeader(line);
      }
    }

    // If no header, try to extract from first meaningful line
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('<!--') && !trimmed.startsWith('---')) {
        // Use first few words as title
        const words = trimmed.split(/\s+/).slice(0, 5).join(' ');
        return words.length > 50 ? `${words.substring(0, 47)}...` : words;
      }
    }

    return `Section starting at line ${actualStartLine}`;
  }
}
