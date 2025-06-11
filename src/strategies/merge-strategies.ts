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
  position: 'before' | 'after' | 'replace' | 'interactive';
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
  type: 'header-collision' | 'content-overlap' | 'transclusion-loop' | 'frontmatter-conflict';
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
  conflictResolution?: 'auto' | 'interactive' | 'manual';
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
  protected options: MergeStrategyOptions;

  constructor(options: MergeStrategyOptions = {}) {
    this.options = {
      conflictResolution: 'auto',
      separator: '\n\n',
      createTransclusions: false,
      mergeFrontmatter: true,
      preserveStructure: true,
      transclusionTemplate: '![[{file}#{section}]]',
      maxTransclusionDepth: 3,
      ...options,
    };
  }

  abstract merge(
    targetContent: string,
    sourceContent: string,
    targetFile: string,
    sourceFile: string
  ): Promise<MergeResult>;

  /** Extract Obsidian transclusions from content */
  protected extractTransclusions(
    content: string
  ): Array<{ ref: string; file: string; section?: string; line: number }> {
    const transclusions: Array<{ ref: string; file: string; section?: string; line: number }> = [];
    const lines = content.split('\n');

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
          file: file.endsWith('.md') ? file : `${file}.md`,
          section,
          line: i + 1,
        });
      }
    }

    return transclusions;
  }

  /** Create an Obsidian transclusion reference */
  protected createTransclusion(file: string, section?: string): string {
    const template = this.options.transclusionTemplate || '![[{file}#{section}]]';
    const cleanFile = file.replace(/\.md$/, '');

    if (section) {
      return template.replace('{file}', cleanFile).replace('{section}', section);
    }
    return template.replace('{file}', cleanFile).replace('#{section}', '');
  }

  /** Detect potential transclusion loops */
  protected detectTransclusionLoops(
    targetFile: string,
    sourceFile: string,
    existingTransclusions: string[]
  ): boolean {
    // Check if source file already references target file
    if (existingTransclusions.some((t) => t.includes(targetFile.replace(/\.md$/, '')))) {
      return true;
    }

    // Check for direct circular reference
    if (sourceFile === targetFile) {
      return true;
    }

    return false;
  }

  /** Merge frontmatter from two sources */
  protected mergeFrontmatter(targetFrontmatter: string, sourceFrontmatter: string): string {
    if (!targetFrontmatter && !sourceFrontmatter) {
      return '';
    }

    if (!targetFrontmatter) return sourceFrontmatter;
    if (!sourceFrontmatter) return targetFrontmatter;

    const targetData = this.parseFrontmatter(targetFrontmatter);
    const sourceData = this.parseFrontmatter(sourceFrontmatter);

    // Merge data - target takes precedence for conflicts
    const mergedData = { ...sourceData, ...targetData };

    // Special handling for arrays (tags, categories)
    for (const key of ['tags', 'categories', 'keywords']) {
      const sourceValue = sourceData[key];
      const targetValue = targetData[key];
      if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
        mergedData[key] = [...new Set([...sourceValue, ...targetValue])];
      }
    }

    return this.stringifyFrontmatter(mergedData);
  }

  private parseFrontmatter(frontmatter: string): Record<string, string | number | string[]> {
    const data: Record<string, string | number | string[]> = {};
    const lines = frontmatter
      .replace(/^---\n/, '')
      .replace(/\n---$/, '')
      .split('\n');

    for (const line of lines) {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();

        if (value.startsWith('[') && value.endsWith(']')) {
          // Parse array
          data[key] = value
            .slice(1, -1)
            .split(',')
            .map((item) => item.trim().replace(/['"]/g, ''));
        } else {
          data[key] = value.replace(/['"]/g, '');
        }
      }
    }

    return data;
  }

  private stringifyFrontmatter(data: Record<string, string | number | string[]>): string {
    if (Object.keys(data).length === 0) {
      return '';
    }

    let result = '---\n';
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        result += `${key}: [${value.map((v) => `"${v}"`).join(', ')}]\n`;
      } else {
        result += `${key}: "${value}"\n`;
      }
    }
    result += '---\n';

    return result;
  }

  /** Extract headers from content with their levels */
  protected extractHeaders(content: string): Array<{ text: string; level: number; line: number }> {
    const headers: Array<{ text: string; level: number; line: number }> = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(#+)\s+(.+)$/);
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

  /** Find potential header conflicts between target and source */
  protected findHeaderConflicts(
    targetContent: string,
    sourceContent: string
  ): Array<{ header: string; targetLine: number; sourceLine: number }> {
    const targetHeaders = this.extractHeaders(targetContent);
    const sourceHeaders = this.extractHeaders(sourceContent);
    const conflicts: Array<{ header: string; targetLine: number; sourceLine: number }> = [];

    for (const sourceHeader of sourceHeaders) {
      const conflict = targetHeaders.find(
        (th) =>
          th.text.toLowerCase() === sourceHeader.text.toLowerCase() &&
          th.level === sourceHeader.level
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
  async merge(
    targetContent: string,
    sourceContent: string,
    targetFile: string,
    sourceFile: string
  ): Promise<MergeResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts: MergeConflict[] = [];
    const transclusions: string[] = [];

    try {
      // Extract frontmatter
      const targetFrontmatter = this.extractFrontmatterFromContent(targetContent);
      const sourceFrontmatter = this.extractFrontmatterFromContent(sourceContent);
      const targetMainContent = this.stripFrontmatter(targetContent);
      const sourceMainContent = this.stripFrontmatter(sourceContent);

      // Check for header conflicts
      const headerConflicts = this.findHeaderConflicts(targetMainContent, sourceMainContent);
      for (const conflict of headerConflicts) {
        conflicts.push({
          type: 'header-collision',
          description: `Duplicate header "${conflict.header}" found in both files`,
          sourceFiles: [targetFile, sourceFile],
          resolution: 'Headers will be preserved as-is',
          lines: [conflict.targetLine, conflict.sourceLine],
          autoResolved: true,
        });
      }

      // Check for transclusion loops if creating transclusions
      if (this.options.createTransclusions) {
        const existingTransclusions = this.extractTransclusions(targetMainContent);
        const transclusionRefs = existingTransclusions.map((t) => t.ref);

        if (this.detectTransclusionLoops(targetFile, sourceFile, transclusionRefs)) {
          warnings.push('Transclusion loop detected - not creating transclusion reference');
        } else {
          // Create transclusion instead of appending content
          const transclusionRef = this.createTransclusion(sourceFile);
          const finalContent = targetMainContent + this.options.separator + transclusionRef;
          transclusions.push(transclusionRef);

          return {
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
          };
        }
      }

      // Standard append merge
      const separator = this.options.separator || '\n\n';
      const mergedContent = targetMainContent + separator + sourceMainContent;

      return {
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
      };
    } catch (error) {
      errors.push(`Failed to merge files: ${error}`);
      return {
        success: false,
        content: targetContent,
        sourceFiles: [targetFile, sourceFile],
        conflicts,
        warnings,
        errors,
        transclusions,
      };
    }
  }

  private extractFrontmatterFromContent(content: string): string {
    const match = content.match(/^---\n(.*?)\n---\n/s);
    return match ? match[0] : '';
  }

  private stripFrontmatter(content: string): string {
    return content.replace(/^---\n.*?\n---\n/s, '').trim();
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
  async merge(
    targetContent: string,
    sourceContent: string,
    targetFile: string,
    sourceFile: string
  ): Promise<MergeResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts: MergeConflict[] = [];
    const transclusions: string[] = [];

    try {
      // Extract frontmatter
      const targetFrontmatter = this.extractFrontmatterFromContent(targetContent);
      const sourceFrontmatter = this.extractFrontmatterFromContent(sourceContent);
      const targetMainContent = this.stripFrontmatter(targetContent);
      const sourceMainContent = this.stripFrontmatter(sourceContent);

      // Check for header conflicts
      const headerConflicts = this.findHeaderConflicts(targetMainContent, sourceMainContent);
      for (const conflict of headerConflicts) {
        conflicts.push({
          type: 'header-collision',
          description: `Duplicate header "${conflict.header}" found in both files`,
          sourceFiles: [targetFile, sourceFile],
          resolution: 'Headers will be preserved as-is',
          lines: [conflict.targetLine, conflict.sourceLine],
          autoResolved: true,
        });
      }

      // Standard prepend merge
      const separator = this.options.separator || '\n\n';
      const mergedContent = sourceMainContent + separator + targetMainContent;

      return {
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
      };
    } catch (error) {
      errors.push(`Failed to merge files: ${error}`);
      return {
        success: false,
        content: targetContent,
        sourceFiles: [targetFile, sourceFile],
        conflicts,
        warnings,
        errors,
        transclusions,
      };
    }
  }

  private extractFrontmatterFromContent(content: string): string {
    const match = content.match(/^---\n(.*?)\n---\n/s);
    return match ? match[0] : '';
  }

  private stripFrontmatter(content: string): string {
    return content.replace(/^---\n.*?\n---\n/s, '').trim();
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
  async merge(
    targetContent: string,
    sourceContent: string,
    targetFile: string,
    sourceFile: string
  ): Promise<MergeResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts: MergeConflict[] = [];
    const transclusions: string[] = [];

    try {
      // Extract frontmatter and content
      const targetFrontmatter = this.extractFrontmatterFromContent(targetContent);
      const sourceFrontmatter = this.extractFrontmatterFromContent(sourceContent);
      const targetMainContent = this.stripFrontmatter(targetContent);
      const sourceMainContent = this.stripFrontmatter(sourceContent);

      // Analyze content for interactive decision points
      const headerConflicts = this.findHeaderConflicts(targetMainContent, sourceMainContent);
      const sourceHeaders = this.extractHeaders(sourceMainContent);

      // Create interactive conflicts for each decision point
      for (const conflict of headerConflicts) {
        conflicts.push({
          type: 'header-collision',
          description: `Duplicate header "${conflict.header}" - choose resolution strategy`,
          sourceFiles: [targetFile, sourceFile],
          resolution: 'Manual resolution required: rename, merge, or skip',
          lines: [conflict.targetLine, conflict.sourceLine],
          autoResolved: false,
        });
      }

      // Create sections for each source header to allow interactive placement
      for (const header of sourceHeaders) {
        // const sectionContent = this.extractSectionContent(sourceMainContent, header);
        conflicts.push({
          type: 'content-overlap',
          description: `Place section "${header.text}" from ${sourceFile}`,
          sourceFiles: [sourceFile],
          resolution: 'Choose position: before, after, or replace existing content',
          lines: [header.line],
          autoResolved: false,
        });
      }

      // For now, create a basic merge that requires manual resolution
      warnings.push('Interactive merge requires manual conflict resolution');
      warnings.push('Use CLI interactive mode or resolve conflicts manually');

      // Create a basic append merge as fallback
      const separator = this.options.separator || '\n\n---\n\n';
      const mergedContent = `${
        targetMainContent + separator
      }<!-- MERGE CONFLICT: Review and resolve manually -->${separator}${sourceMainContent}`;

      return {
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
      };
    } catch (error) {
      errors.push(`Failed to perform interactive merge: ${error}`);
      return {
        success: false,
        content: targetContent,
        sourceFiles: [targetFile, sourceFile],
        conflicts,
        warnings,
        errors,
        transclusions,
      };
    }
  }

  private extractFrontmatterFromContent(content: string): string {
    const match = content.match(/^---\n(.*?)\n---\n/s);
    return match ? match[0] : '';
  }

  private stripFrontmatter(content: string): string {
    return content.replace(/^---\n.*?\n---\n/s, '').trim();
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
