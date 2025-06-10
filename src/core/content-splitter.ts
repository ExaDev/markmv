import { basename, dirname, join } from 'node:path';
import {
  type BaseSplitStrategy,
  HeaderBasedSplitStrategy,
  LineBasedSplitStrategy,
  ManualSplitStrategy,
  SizeBasedSplitStrategy,
  type SplitResult,
  type SplitSection,
  type SplitStrategyOptions,
} from '../strategies/split-strategies.js';
import type { MarkdownLink, ParsedMarkdownFile } from '../types/links.js';
import type {
  OperationChange,
  OperationResult,
  SplitOperationOptions,
} from '../types/operations.js';
import { FileUtils } from '../utils/file-utils.js';
import { PathUtils } from '../utils/path-utils.js';
import { TransactionManager } from '../utils/transaction-manager.js';
import { LinkParser } from './link-parser.js';
// import { LinkRefactorer } from './link-refactorer.js';

export interface LinkRedistributionResult {
  /** Updated sections with redistributed links */
  updatedSections: SplitSection[];
  /** Links that need to be updated in external files */
  externalLinkUpdates: Array<{
    filePath: string;
    oldHref: string;
    newHref: string;
    line: number;
  }>;
  /** Any errors during redistribution */
  errors: string[];
}

export class ContentSplitter {
  private linkParser = new LinkParser();
  // private linkRefactorer = new LinkRefactorer();

  /**
   * Split a markdown file into multiple files
   */
  async splitFile(
    sourceFilePath: string,
    options: SplitOperationOptions
  ): Promise<OperationResult> {
    const { strategy = 'headers', outputDir, dryRun = false, verbose = false } = options;

    try {
      // Validate input
      if (!(await FileUtils.exists(sourceFilePath))) {
        return {
          success: false,
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
          errors: [`Source file does not exist: ${sourceFilePath}`],
          warnings: [],
          changes: [],
        };
      }

      if (!PathUtils.isMarkdownFile(sourceFilePath)) {
        return {
          success: false,
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
          errors: ['Source file must be a markdown file'],
          warnings: [],
          changes: [],
        };
      }

      // Read and parse the source file
      const content = await FileUtils.readTextFile(sourceFilePath);
      const parsedFile = await this.linkParser.parseFile(sourceFilePath);

      if (verbose) {
        console.log(`Parsing file: ${sourceFilePath}`);
        console.log(`Found ${parsedFile.links.length} links`);
      }

      // Get the output directory
      const outputDirectory = outputDir || dirname(sourceFilePath);
      const sourceFilename = basename(sourceFilePath);

      // Create split strategy
      const splitStrategy = this.createSplitStrategy(strategy, {
        ...options,
        outputDir: outputDirectory,
      });

      // Perform the split
      const splitResult = await splitStrategy.split(content, sourceFilename);

      if (splitResult.errors.length > 0) {
        return {
          success: false,
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
          errors: splitResult.errors,
          warnings: splitResult.warnings,
          changes: [],
        };
      }

      if (splitResult.sections.length === 0) {
        return {
          success: false,
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
          errors: ['No sections were created during split'],
          warnings: splitResult.warnings,
          changes: [],
        };
      }

      // Redistribute links across sections
      const redistributionResult = await this.redistributeLinks(
        splitResult,
        parsedFile,
        outputDirectory
      );

      if (verbose) {
        console.log(`Split into ${redistributionResult.updatedSections.length} sections`);
        console.log(
          `${redistributionResult.externalLinkUpdates.length} external links need updating`
        );
      }

      // Prepare transaction
      const transaction = new TransactionManager({
        createBackups: !dryRun,
        continueOnError: false,
      });

      const changes: OperationChange[] = [];
      const createdFiles: string[] = [];
      const modifiedFiles: string[] = [];
      const warnings = [...splitResult.warnings, ...redistributionResult.errors];

      // Plan section file creation
      for (const section of redistributionResult.updatedSections) {
        const filePath = join(outputDirectory, section.filename);
        createdFiles.push(filePath);

        changes.push({
          type: 'file-created',
          filePath,
          newValue: section.content,
        });

        if (!dryRun) {
          transaction.addFileCreate(
            filePath,
            section.content,
            `Create split section: ${section.title}`
          );
        }
      }

      // Plan original file update (if there's remaining content)
      if (splitResult.remainingContent) {
        modifiedFiles.push(sourceFilePath);
        changes.push({
          type: 'content-modified',
          filePath: sourceFilePath,
          newValue: splitResult.remainingContent,
        });

        if (!dryRun) {
          transaction.addContentUpdate(
            sourceFilePath,
            splitResult.remainingContent,
            'Update original file with remaining content'
          );
        }
      }

      // Handle external file updates (files that link to the split file)
      const externalFiles = await this.findExternalReferences(sourceFilePath);
      for (const externalFile of externalFiles) {
        const updatedContent = await this.updateExternalFileLinks(
          externalFile,
          sourceFilePath,
          redistributionResult.updatedSections,
          outputDirectory
        );

        if (updatedContent !== (await FileUtils.readTextFile(externalFile))) {
          modifiedFiles.push(externalFile);
          changes.push({
            type: 'link-updated',
            filePath: externalFile,
          });

          if (!dryRun) {
            transaction.addContentUpdate(
              externalFile,
              updatedContent,
              'Update links to split sections'
            );
          }
        }
      }

      // Execute or return dry-run results
      if (dryRun) {
        return {
          success: true,
          modifiedFiles: Array.from(new Set(modifiedFiles)),
          createdFiles,
          deletedFiles: [],
          errors: [],
          warnings,
          changes,
        };
      }

      // Execute the transaction
      const executionResult = await transaction.execute();

      if (!executionResult.success) {
        return {
          success: false,
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
          errors: executionResult.errors,
          warnings,
          changes: [],
        };
      }

      return {
        success: true,
        modifiedFiles: Array.from(new Set(modifiedFiles)),
        createdFiles,
        deletedFiles: [],
        errors: [],
        warnings,
        changes,
      };
    } catch (error) {
      return {
        success: false,
        modifiedFiles: [],
        createdFiles: [],
        deletedFiles: [],
        errors: [`Split operation failed: ${error}`],
        warnings: [],
        changes: [],
      };
    }
  }

  private createSplitStrategy(strategy: string, options: SplitStrategyOptions): BaseSplitStrategy {
    switch (strategy) {
      case 'headers':
        return new HeaderBasedSplitStrategy(options);
      case 'size':
        return new SizeBasedSplitStrategy(options);
      case 'manual':
        return new ManualSplitStrategy(options);
      case 'lines':
        return new LineBasedSplitStrategy(options);
      default:
        throw new Error(`Unknown split strategy: ${strategy}`);
    }
  }

  /**
   * Redistribute links across split sections
   */
  private async redistributeLinks(
    splitResult: SplitResult,
    originalFile: ParsedMarkdownFile,
    outputDirectory: string
  ): Promise<LinkRedistributionResult> {
    const updatedSections: SplitSection[] = [];
    const externalLinkUpdates: Array<{
      filePath: string;
      oldHref: string;
      newHref: string;
      line: number;
    }> = [];
    const errors: string[] = [];

    // For each section, find which links belong to it and update them
    for (const section of splitResult.sections) {
      try {
        const sectionFilePath = join(outputDirectory, section.filename);

        // Find links that are within this section's line range
        const sectionLinks = originalFile.links.filter(
          (link) => link.line >= section.startLine + 1 && link.line <= section.endLine + 1
        );

        // Update internal links within the section to account for new file location
        const updatedContent = section.content;
        const lines = updatedContent.split('\n');

        for (const link of sectionLinks) {
          if (link.type === 'internal' || link.type === 'claude-import') {
            try {
              const newHref = this.updateLinkForNewLocation(
                link,
                originalFile.filePath,
                sectionFilePath
              );

              if (newHref !== link.href) {
                const relativeLine = link.line - section.startLine - 1;
                if (relativeLine >= 0 && relativeLine < lines.length) {
                  lines[relativeLine] = this.replaceLinkInLine(lines[relativeLine], link, newHref);
                }
              }
            } catch (error) {
              errors.push(`Failed to update link in section ${section.title}: ${error}`);
            }
          }
        }

        updatedSections.push({
          ...section,
          content: lines.join('\n'),
        });
      } catch (error) {
        errors.push(`Failed to process section ${section.title}: ${error}`);
        updatedSections.push(section);
      }
    }

    return {
      updatedSections,
      externalLinkUpdates,
      errors,
    };
  }

  private updateLinkForNewLocation(
    link: MarkdownLink,
    originalFilePath: string,
    newFilePath: string
  ): string {
    if (link.type === 'claude-import') {
      return PathUtils.updateClaudeImportPath(link.href, originalFilePath, newFilePath);
    }

    if (link.type === 'internal') {
      return PathUtils.updateRelativePath(link.href, originalFilePath, newFilePath);
    }

    return link.href;
  }

  private replaceLinkInLine(line: string, link: MarkdownLink, newHref: string): string {
    if (link.type === 'claude-import') {
      const oldImport = `@${link.href}`;
      const newImport = `@${newHref}`;
      return line.replace(oldImport, newImport);
    }

    // For regular markdown links
    const escapedHref = link.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkRegex = new RegExp(`\\[([^\\]]*)\\]\\(\\s*${escapedHref}(\\s+"[^"]*")?\\s*\\)`, 'g');

    return line.replace(linkRegex, `[$1](${newHref}$2)`);
  }

  /**
   * Find files that reference the source file
   */
  private async findExternalReferences(sourceFilePath: string): Promise<string[]> {
    try {
      const projectRoot = dirname(sourceFilePath);
      const markdownFiles = await FileUtils.findMarkdownFiles(projectRoot, true);
      const referencingFiles: string[] = [];

      for (const filePath of markdownFiles) {
        if (filePath === sourceFilePath) continue;

        try {
          const parsedFile = await this.linkParser.parseFile(filePath);
          const hasReference = parsedFile.dependencies.includes(sourceFilePath);

          if (hasReference) {
            referencingFiles.push(filePath);
          }
        } catch (error) {}
      }

      return referencingFiles;
    } catch (error) {
      console.warn(`Failed to find external references: ${error}`);
      return [];
    }
  }

  /**
   * Update external files that reference the split file
   */
  private async updateExternalFileLinks(
    externalFilePath: string,
    originalFilePath: string,
    sections: SplitSection[],
    outputDirectory: string
  ): Promise<string> {
    try {
      const content = await FileUtils.readTextFile(externalFilePath);
      const parsedFile = await this.linkParser.parseFile(externalFilePath);

      let updatedContent = content;
      const lines = updatedContent.split('\n');

      // Find links that point to the original file
      const linksToUpdate = parsedFile.links.filter(
        (link) => link.resolvedPath === originalFilePath
      );

      // For now, update all links to point to the first section
      // In a more sophisticated implementation, we could analyze the link context
      // to determine which section it should point to
      if (sections.length > 0 && linksToUpdate.length > 0) {
        const firstSectionPath = join(outputDirectory, sections[0].filename);

        for (const link of linksToUpdate) {
          // Calculate relative path from external file to the first section file
          let newHref = PathUtils.makeRelative(firstSectionPath, dirname(externalFilePath));

          // Ensure relative paths start with ./ for markdown compatibility
          if (!newHref.startsWith('./') && !newHref.startsWith('../') && !newHref.startsWith('/')) {
            newHref = `./${newHref}`;
          }

          if (newHref !== link.href) {
            const lineIndex = link.line - 1;
            if (lineIndex >= 0 && lineIndex < lines.length) {
              lines[lineIndex] = this.replaceLinkInLine(lines[lineIndex], link, newHref);
            }
          }
        }

        updatedContent = lines.join('\n');
      }

      return updatedContent;
    } catch (error) {
      console.warn(`Failed to update external file ${externalFilePath}: ${error}`);
      return FileUtils.readTextFile(externalFilePath);
    }
  }
}
