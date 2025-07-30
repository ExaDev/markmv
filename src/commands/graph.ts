import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LinkGraphGenerator } from '../core/link-graph-generator.js';
import type { GraphOutputFormat, LinkGraphOptions } from '../core/link-graph-generator.js';
import type { OperationOptions } from '../types/operations.js';

/**
 * Configuration options for graph generation operations.
 *
 * @category Commands
 */
export interface GraphOperationOptions extends OperationOptions, LinkGraphOptions {
  /** Output format for the graph */
  format: GraphOutputFormat;
  /** Output file path (optional) */
  output?: string;
  /** Whether to open the generated file */
  open?: boolean;
}

/**
 * CLI-specific options for the graph command.
 *
 * @category Commands
 */
export interface GraphCliOptions extends Omit<GraphOperationOptions, 'format'> {
  /** Output format as string */
  format?: string;
  /** Output results in JSON format */
  json?: boolean;
}

/**
 * Result of a graph generation operation.
 *
 * @category Commands
 */
export interface GraphResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Number of files processed */
  filesProcessed: number;
  /** Number of nodes in the graph */
  nodeCount: number;
  /** Number of edges in the graph */
  edgeCount: number;
  /** Output file path if written */
  outputFile?: string;
  /** Generated graph content */
  content: string;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Analysis results */
  analysis: {
    /** Number of hub nodes */
    hubCount: number;
    /** Number of orphaned nodes */
    orphanCount: number;
    /** Number of circular references */
    circularReferenceCount: number;
  };
  /** Any errors encountered */
  errors: string[];
  /** Warnings generated */
  warnings: string[];
}

/**
 * Generates interactive link graphs from markdown file relationships.
 *
 * Creates visual representations of how markdown files link to each other, supporting
 * multiple output formats including JSON data, Mermaid diagrams, GraphViz DOT, and
 * interactive HTML visualizations.
 *
 * @example
 *   Basic graph generation
 *   ```typescript
 *   const result = await generateGraph(['docs/**\/*.md'], {
 *     format: 'mermaid',
 *     includeExternal: false
 *   });
 *
 *   console.log('Generated Mermaid diagram:');
 *   console.log(result.content);
 *   ```
 *
 * @example
 *   Generate interactive HTML visualization
 *   ```typescript
 *   const result = await generateGraph(['**\/*.md'], {
 *     format: 'html',
 *     output: 'graph.html',
 *     includeImages: true
 *   });
 *
 *   console.log('Interactive graph saved to: ' + result.outputFile);
 *   ```
 *
 * @param patterns - File patterns to process (supports globs)
 * @param options - Graph generation options
 *
 * @returns Promise resolving to graph generation results
 */
export async function generateGraph(
  patterns: string[],
  options: Partial<GraphOperationOptions> = {}
): Promise<GraphResult> {
  const startTime = Date.now();

  const opts = {
    format: options.format || 'json',
    includeExternal: options.includeExternal ?? false,
    includeImages: options.includeImages ?? true,
    includeAnchors: options.includeAnchors ?? false,
    maxDepth: options.maxDepth ?? 10,
    baseDir: options.baseDir ?? process.cwd(),
    output: options.output,
    open: options.open ?? false,
    dryRun: options.dryRun ?? false,
    verbose: options.verbose ?? false,
    force: options.force ?? false,
  };

  const result: GraphResult = {
    success: false,
    filesProcessed: 0,
    nodeCount: 0,
    edgeCount: 0,
    content: '',
    processingTime: 0,
    analysis: {
      hubCount: 0,
      orphanCount: 0,
      circularReferenceCount: 0,
    },
    errors: [],
    warnings: [],
  };

  try {
    if (opts.verbose) {
      console.log('Generating ' + opts.format + ' graph for patterns: ' + patterns.join(', '));
    }

    // Initialize graph generator
    const generator = new LinkGraphGenerator({
      includeExternal: opts.includeExternal,
      includeImages: opts.includeImages,
      includeAnchors: opts.includeAnchors,
      maxDepth: opts.maxDepth,
      baseDir: opts.baseDir,
    });

    // Generate the graph
    const graph = await generator.generateGraph(patterns);

    // Export to requested format
    const content = generator.exportGraph(graph, opts.format);

    // Update result
    result.success = true;
    result.filesProcessed = graph.metadata.filesProcessed;
    result.nodeCount = graph.nodes.length;
    result.edgeCount = graph.edges.length;
    result.content = content;
    result.analysis = {
      hubCount: graph.analysis.hubs.length,
      orphanCount: graph.analysis.orphans.length,
      circularReferenceCount: graph.analysis.circularReferences.length,
    };

    // Write to file if output path specified
    if (opts.output && !opts.dryRun) {
      const outputPath = resolve(opts.output);
      await writeFile(outputPath, content, 'utf-8');
      result.outputFile = outputPath;

      if (opts.verbose) {
        console.log('Graph written to: ' + outputPath);
      }
    }

    // Add warnings for analysis results
    if (result.analysis.circularReferenceCount > 0) {
      result.warnings.push(
        'Found ' + result.analysis.circularReferenceCount + ' circular reference(s)'
      );
    }

    if (result.analysis.orphanCount > 0) {
      result.warnings.push(
        'Found ' + result.analysis.orphanCount + ' orphaned file(s) with no links'
      );
    }

    if (opts.verbose) {
      console.log('Graph generated: ' + result.nodeCount + ' nodes, ' + result.edgeCount + ' edges');
      console.log('Hubs: ' + result.analysis.hubCount + ', Orphans: ' + result.analysis.orphanCount);
    }

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    if (opts.verbose) {
      console.error('Graph generation failed:', error);
    }
  }

  result.processingTime = Date.now() - startTime;
  return result;
}

/**
 * CLI command handler for graph operations.
 *
 * Processes markdown files to generate interactive link graphs in various formats.
 * Supports JSON data export, Mermaid diagrams, GraphViz DOT format, and interactive
 * HTML visualizations.
 *
 * @example
 *   ```bash
 *   # Generate Mermaid diagram for all markdown files
 *   markmv graph "**\/*.md" --format mermaid --output graph.mmd
 *
 *   # Create interactive HTML visualization
 *   markmv graph docs/ --format html --output visualization.html
 *
 *   # Export JSON data for external processing
 *   markmv graph . --format json --include-external --output graph.json
 *
 *   # Generate GraphViz DOT file
 *   markmv graph "**\/*.md" --format dot --include-images --output graph.dot
 *   ```
 *
 * @param patterns - File patterns to process
 * @param cliOptions - CLI-specific options
 */
export async function graphCommand(
  patterns: string[],
  cliOptions: GraphCliOptions
): Promise<void> {
  // Default to current directory if no patterns provided
  const finalPatterns = patterns.length === 0 ? ['.'] : patterns;

  // Convert CLI options to internal options
  const format = (cliOptions.format || 'json') as GraphOutputFormat;
  
  // Validate format
  const validFormats: GraphOutputFormat[] = ['json', 'mermaid', 'dot', 'html'];
  if (!validFormats.includes(format)) {
    console.error('Invalid format: ' + format + '. Valid formats: ' + validFormats.join(', '));
    process.exitCode = 1;
    return;
  }

  const options: GraphOperationOptions = {
    ...cliOptions,
    format,
  };

  try {
    const result = await generateGraph(finalPatterns, options);

    if (cliOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Format output for human consumption
    console.log('\n📊 Graph Generation Summary');
    console.log('Files processed: ' + result.filesProcessed);
    console.log('Nodes: ' + result.nodeCount);
    console.log('Edges: ' + result.edgeCount);
    console.log('Format: ' + format);
    console.log('Processing time: ' + result.processingTime + 'ms\n');

    if (result.outputFile) {
      console.log('📁 Output written to: ' + result.outputFile + '\n');
    }

    // Analysis summary
    console.log('🔍 Graph Analysis:');
    console.log('  Hub nodes (high connectivity): ' + result.analysis.hubCount);
    console.log('  Orphaned nodes (no connections): ' + result.analysis.orphanCount);
    console.log('  Circular references: ' + result.analysis.circularReferenceCount + '\n');

    if (result.warnings.length > 0) {
      console.log('⚠️  Warnings (' + result.warnings.length + '):');
      for (const warning of result.warnings) {
        console.log('  ' + warning);
      }
      console.log();
    }

    if (result.errors.length > 0) {
      console.log('❌ Errors (' + result.errors.length + '):');
      for (const error of result.errors) {
        console.log('  ' + error);
      }
      console.log();
      process.exitCode = 1;
      return;
    }

    if (!result.success) {
      console.log('❌ Graph generation failed');
      process.exitCode = 1;
      return;
    }

    // Show content preview for small outputs or if no output file
    if (!result.outputFile && result.content.length < 5000) {
      console.log('📋 Generated ' + format.toUpperCase() + ':');
      console.log(result.content);
    } else if (!result.outputFile) {
      console.log('📋 Generated ' + format.toUpperCase() + ' (' + result.content.length + ' characters)');
      console.log(result.content.substring(0, 500) + '...');
    }

    console.log('✅ Graph generation completed successfully!');

  } catch (error) {
    console.error('Graph generation failed:', error);
    process.exitCode = 1;
  }
}