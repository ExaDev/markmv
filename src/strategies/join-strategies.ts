import type { ParsedMarkdownFile } from '../types/links.js';

export interface JoinSection {
  /** Original file path */
  filePath: string;
  /** Content of the file */
  content: string;
  /** Frontmatter extracted from the file */
  frontmatter?: string;
  /** Title extracted from the file (from frontmatter or first header) */
  title?: string;
  /** Dependencies (files this content links to) */
  dependencies: string[];
  /** Order priority for this section */
  order: number;
}

export interface JoinResult {
  /** Whether the join was successful */
  success: boolean;
  /** Combined content */
  content: string;
  /** Combined frontmatter */
  frontmatter?: string;
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

export interface JoinConflict {
  /** Type of conflict */
  type: 'frontmatter-merge' | 'duplicate-headers' | 'link-collision' | 'content-overlap';
  /** Description of the conflict */
  description: string;
  /** Files involved in the conflict */
  files: string[];
  /** Suggested resolution */
  resolution?: string;
  /** Line numbers where conflict occurs */
  lines?: number[];
}

export interface JoinStrategyOptions {
  /** Output file path */
  outputPath?: string;
  /** Strategy for ordering content */
  orderStrategy?: 'alphabetical' | 'manual' | 'dependency' | 'chronological';
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

export abstract class BaseJoinStrategy {
  protected options: JoinStrategyOptions;

  constructor(options: JoinStrategyOptions = {}) {
    this.options = {
      orderStrategy: 'dependency',
      separator: '\n\n---\n\n',
      mergeFrontmatter: true,
      deduplicateLinks: true,
      resolveHeaderConflicts: false,
      preserveStructure: true,
      ...options,
    };
  }

  abstract join(sections: JoinSection[]): Promise<JoinResult>;

  /**
   * Extract title from content (frontmatter or first header)
   */
  protected extractTitle(content: string, frontmatter?: string): string | undefined {
    // Try frontmatter first
    if (frontmatter) {
      const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
      if (titleMatch) {
        return titleMatch[1].trim().replace(/['"]/g, '');
      }
    }

    // Try first header
    const lines = content.split('\n');
    for (const line of lines) {
      const headerMatch = line.match(/^#+\s+(.+)$/);
      if (headerMatch) {
        return headerMatch[1].trim();
      }
    }

    return undefined;
  }

  /**
   * Merge multiple frontmatter blocks
   */
  protected mergeFrontmatter(sections: JoinSection[]): string {
    const frontmatterData: Record<string, any> = {};
    const arrays: Record<string, string[]> = {};

    for (const section of sections) {
      if (!section.frontmatter) continue;

      const lines = section.frontmatter
        .replace(/^---\n/, '')
        .replace(/\n---$/, '')
        .split('\n');

      for (const line of lines) {
        const match = line.match(/^([^:]+):\s*(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim();

          if (key === 'tags' || key === 'categories' || key === 'keywords') {
            // Handle arrays
            if (!arrays[key]) arrays[key] = [];
            if (value.startsWith('[') && value.endsWith(']')) {
              // Parse array format
              const items = value.slice(1, -1).split(',').map(item => item.trim().replace(/['"]/g, ''));
              arrays[key].push(...items);
            } else {
              arrays[key].push(value.replace(/['"]/g, ''));
            }
          } else if (key === 'title') {
            // Use first title found, or combine if different
            if (!frontmatterData[key]) {
              frontmatterData[key] = value.replace(/['"]/g, '');
            } else if (frontmatterData[key] !== value.replace(/['"]/g, '')) {
              frontmatterData[key] = `${frontmatterData[key]} & ${value.replace(/['"]/g, '')}`;
            }
          } else {
            // Simple key-value pairs - use first found
            if (!frontmatterData[key]) {
              let cleanValue = value.replace(/['"]/g, '');
              // Try to parse as number if it looks like one
              if (/^\d+$/.test(cleanValue)) {
                frontmatterData[key] = parseInt(cleanValue, 10);
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
      return '';
    }

    let result = '---\n';
    for (const [key, value] of Object.entries(frontmatterData)) {
      if (Array.isArray(value)) {
        result += `${key}: [${value.map(v => `"${v}"`).join(', ')}]\n`;
      } else if (typeof value === 'number') {
        result += `${key}: ${value}\n`;
      } else {
        result += `${key}: "${value}"\n`;
      }
    }
    result += '---\n';

    return result;
  }

  /**
   * Detect conflicts between sections
   */
  protected detectConflicts(sections: JoinSection[]): JoinConflict[] {
    const conflicts: JoinConflict[] = [];
    const seenHeaders = new Set<string>();
    const headerFiles: Record<string, string[]> = {};

    // Check for duplicate headers
    for (const section of sections) {
      const headers = this.extractHeaders(section.content);
      for (const header of headers) {
        const normalizedHeader = header.toLowerCase().trim();
        if (seenHeaders.has(normalizedHeader)) {
          if (!headerFiles[normalizedHeader]) {
            headerFiles[normalizedHeader] = [];
          }
          headerFiles[normalizedHeader].push(section.filePath);
        } else {
          seenHeaders.add(normalizedHeader);
          headerFiles[normalizedHeader] = [section.filePath];
        }
      }
    }

    // Add conflicts for duplicate headers
    for (const [header, files] of Object.entries(headerFiles)) {
      if (files.length > 1) {
        conflicts.push({
          type: 'duplicate-headers',
          description: `Duplicate header "${header}" found in multiple files`,
          files,
          resolution: 'Consider renaming headers or adding file prefixes',
        });
      }
    }

    // Check for frontmatter conflicts
    const frontmatterKeys = new Set<string>();
    const conflictingKeys: Record<string, string[]> = {};

    for (const section of sections) {
      if (section.frontmatter) {
        const lines = section.frontmatter.split('\n');
        for (const line of lines) {
          const match = line.match(/^([^:]+):/);
          if (match) {
            const key = match[1].trim();
            if (frontmatterKeys.has(key)) {
              if (!conflictingKeys[key]) {
                conflictingKeys[key] = [];
              }
              conflictingKeys[key].push(section.filePath);
            } else {
              frontmatterKeys.add(key);
              conflictingKeys[key] = [section.filePath];
            }
          }
        }
      }
    }

    for (const [key, files] of Object.entries(conflictingKeys)) {
      if (files.length > 1) {
        conflicts.push({
          type: 'frontmatter-merge',
          description: `Conflicting frontmatter key "${key}" in multiple files`,
          files,
          resolution: 'Values will be merged or first value used',
        });
      }
    }

    return conflicts;
  }

  /**
   * Extract all headers from content
   */
  protected extractHeaders(content: string): string[] {
    const headers: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/^#+\s+(.+)$/);
      if (match) {
        headers.push(match[1].trim());
      }
    }

    return headers;
  }

  /**
   * Deduplicate links in combined content
   */
  protected deduplicateLinks(content: string): { content: string; removedLinks: string[] } {
    const seenLinks = new Set<string>();
    const removedLinks: string[] = [];
    const lines = content.split('\n');
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
          processedLine = processedLine.replace(url, '');
          removedLinks.push(url);
        } else {
          seenLinks.add(url);
        }
      }

      processedLines.push(processedLine);
    }

    return {
      content: processedLines.join('\n'),
      removedLinks,
    };
  }
}

export class DependencyOrderJoinStrategy extends BaseJoinStrategy {
  async join(sections: JoinSection[]): Promise<JoinResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts = this.detectConflicts(sections);

    try {
      // Sort sections by dependency order (topological sort)
      const orderedSections = this.topologicalSort(sections);
      
      if (!orderedSections) {
        warnings.push('Circular dependency detected, falling back to manual order');
        const fallbackSections = [...sections].sort((a, b) => a.order - b.order);
        return this.buildResult(fallbackSections, conflicts, warnings, errors);
      }

      return this.buildResult(orderedSections, conflicts, warnings, errors);
    } catch (error) {
      errors.push(`Failed to join sections: ${error}`);
      return {
        success: false,
        content: '',
        sourceFiles: [],
        conflicts,
        warnings,
        errors,
        deduplicatedLinks: [],
      };
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
          inDegree.set(section.filePath, (inDegree.get(section.filePath) || 0) + 1);
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
      const current = queue.shift()!;
      const section = fileToSection.get(current)!;
      result.push(section);

      // Remove edges and update in-degrees
      const neighbors = graph.get(current) || new Set();
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
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
    errors: string[]
  ): JoinResult {
    const sourceFiles = orderedSections.map(s => s.filePath);
    const separator = this.options.separator || '\n\n---\n\n';

    // Combine content
    let combinedContent = orderedSections
      .map(section => section.content.replace(/^---\n.*?\n---\n/s, '').trim())
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

export class AlphabeticalJoinStrategy extends BaseJoinStrategy {
  async join(sections: JoinSection[]): Promise<JoinResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts = this.detectConflicts(sections);

    try {
      // Sort sections alphabetically by title or filename
      const orderedSections = [...sections].sort((a, b) => {
        const titleA = a.title || a.filePath;
        const titleB = b.title || b.filePath;
        return titleA.toLowerCase().localeCompare(titleB.toLowerCase());
      });

      return this.buildResult(orderedSections, conflicts, warnings, errors);
    } catch (error) {
      errors.push(`Failed to join sections: ${error}`);
      return {
        success: false,
        content: '',
        sourceFiles: [],
        conflicts,
        warnings,
        errors,
        deduplicatedLinks: [],
      };
    }
  }

  private buildResult(
    orderedSections: JoinSection[], 
    conflicts: JoinConflict[], 
    warnings: string[], 
    errors: string[]
  ): JoinResult {
    const sourceFiles = orderedSections.map(s => s.filePath);
    const separator = this.options.separator || '\n\n---\n\n';

    let combinedContent = orderedSections
      .map(section => section.content.replace(/^---\n.*?\n---\n/s, '').trim())
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

export class ManualOrderJoinStrategy extends BaseJoinStrategy {
  async join(sections: JoinSection[]): Promise<JoinResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts = this.detectConflicts(sections);

    try {
      const customOrder = this.options.customOrder || [];
      const orderedSections: JoinSection[] = [];
      const usedSections = new Set<string>();

      // Add sections in custom order
      for (const filePath of customOrder) {
        const section = sections.find(s => s.filePath === filePath);
        if (section) {
          orderedSections.push(section);
          usedSections.add(filePath);
        } else {
          warnings.push(`File ${filePath} specified in custom order but not found in sections`);
        }
      }

      // Add remaining sections in alphabetical order
      const remainingSections = sections
        .filter(s => !usedSections.has(s.filePath))
        .sort((a, b) => {
          const titleA = a.title || a.filePath;
          const titleB = b.title || b.filePath;
          return titleA.toLowerCase().localeCompare(titleB.toLowerCase());
        });

      orderedSections.push(...remainingSections);

      return this.buildResult(orderedSections, conflicts, warnings, errors);
    } catch (error) {
      errors.push(`Failed to join sections: ${error}`);
      return {
        success: false,
        content: '',
        sourceFiles: [],
        conflicts,
        warnings,
        errors,
        deduplicatedLinks: [],
      };
    }
  }

  private buildResult(
    orderedSections: JoinSection[], 
    conflicts: JoinConflict[], 
    warnings: string[], 
    errors: string[]
  ): JoinResult {
    const sourceFiles = orderedSections.map(s => s.filePath);
    const separator = this.options.separator || '\n\n---\n\n';

    let combinedContent = orderedSections
      .map(section => section.content.replace(/^---\n.*?\n---\n/s, '').trim())
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

export class ChronologicalJoinStrategy extends BaseJoinStrategy {
  async join(sections: JoinSection[]): Promise<JoinResult> {
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

      return this.buildResult(orderedSections, conflicts, warnings, errors);
    } catch (error) {
      errors.push(`Failed to join sections: ${error}`);
      return {
        success: false,
        content: '',
        sourceFiles: [],
        conflicts,
        warnings,
        errors,
        deduplicatedLinks: [],
      };
    }
  }

  private extractDate(section: JoinSection): Date | null {
    // Try frontmatter first
    if (section.frontmatter) {
      const dateMatch = section.frontmatter.match(/^date:\s*(.+)$/m);
      if (dateMatch) {
        const date = new Date(dateMatch[1].trim().replace(/['"]/g, ''));
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // Try to extract date from filename (YYYY-MM-DD format)
    const filenameDateMatch = section.filePath.match(/(\d{4}-\d{2}-\d{2})/);
    if (filenameDateMatch) {
      const date = new Date(filenameDateMatch[1]);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    return null;
  }

  private buildResult(
    orderedSections: JoinSection[], 
    conflicts: JoinConflict[], 
    warnings: string[], 
    errors: string[]
  ): JoinResult {
    const sourceFiles = orderedSections.map(s => s.filePath);
    const separator = this.options.separator || '\n\n---\n\n';

    let combinedContent = orderedSections
      .map(section => section.content.replace(/^---\n.*?\n---\n/s, '').trim())
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