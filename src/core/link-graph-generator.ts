import { readFile } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { LinkParser } from "./link-parser.js";
import type { MarkdownLink } from "../types/links.js";

/** Depth used when `maxDepth` is not supplied. */
const DEFAULT_MAX_DEPTH = 10;

/** A node with more links than this (inbound plus outbound) is flagged as a hub. */
const HUB_LINK_THRESHOLD = 10;

/**
 * Configuration options for link graph generation.
 * @category Core
 */
export interface LinkGraphOptions {
  /** Include external links in the graph */
  includeExternal?: boolean;
  /** Include image links in the graph */
  includeImages?: boolean;
  /** Include anchor links in the graph */
  includeAnchors?: boolean;
  /** Maximum depth for dependency traversal */
  maxDepth?: number;
  /** Base directory for relative path calculations */
  baseDir?: string;
}

/**
 * Represents a node in the link graph.
 * @category Core
 */
export interface GraphNode {
  /** Unique identifier for the node */
  id: string;
  /** Display label for the node */
  label: string;
  /** Absolute file path */
  path: string;
  /** Relative path from base directory */
  relativePath: string;
  /** Node type */
  type: "markdown" | "external" | "image" | "directory";
  /** Node statistics */
  stats: {
    /** Number of incoming links */
    inbound: number;
    /** Number of outgoing links */
    outbound: number;
    /** Total link count */
    total: number;
  };
  /** Additional node properties */
  properties: {
    /** File size in bytes (for files) */
    size?: number;
    /** Whether this is a hub node (high connectivity) */
    isHub?: boolean;
    /** Whether this is an orphaned node (no connections) */
    isOrphan?: boolean;
  };
}

/**
 * Represents an edge in the link graph.
 * @category Core
 */
export interface GraphEdge {
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** Link type */
  type: "internal" | "external" | "image" | "anchor" | "claude-import";
  /** Original link text */
  text?: string;
  /** Line number where link appears */
  line?: number;
  /** Link weight (frequency or importance) */
  weight: number;
}

/**
 * Complete link graph representation.
 * @category Core
 */
export interface LinkGraph {
  /** All nodes in the graph */
  nodes: GraphNode[];
  /** All edges in the graph */
  edges: GraphEdge[];
  /** Graph metadata */
  metadata: {
    /** Total number of files processed */
    filesProcessed: number;
    /** Total number of links found */
    totalLinks: number;
    /** Base directory used for calculations */
    baseDir: string;
    /** Generation timestamp */
    generatedAt: string;
    /** Options used for generation */
    options: Required<LinkGraphOptions>;
  };
  /** Graph analysis results */
  analysis: {
    /** Hub nodes (high connectivity) */
    hubs: string[];
    /** Orphaned nodes (no connections) */
    orphans: string[];
    /** Circular references detected */
    circularReferences: string[][];
    /** Strongly connected components */
    stronglyConnected: string[][];
  };
}

/**
 * Output format for graph export.
 * @category Core
 */
export type GraphOutputFormat = "json" | "mermaid" | "dot" | "html";

/**
 * Generates interactive link graphs from markdown file relationships.
 *
 * The LinkGraphGenerator analyzes markdown files to extract internal links and builds directed
 * graphs of file relationships. Supports multiple output formats including JSON data, Mermaid
 * diagrams, and interactive HTML visualizations.
 * @category Core
 * @example
 *   Basic graph generation
 * ```typescript
 *   const generator = new LinkGraphGenerator({
 *       includeExternal: false,
 *       maxDepth: 5
 *   });
 *
 *   const graph = await generator.generateGraph(['docs/**\/*.md']);
 *   console.log('Generated graph with ' + graph.nodes.length + ' nodes and ' + graph.edges.length + ' edges');
 * ```
 * @example
 *   Export to different formats
 * ```typescript
 *   const generator = new LinkGraphGenerator();
 *   const graph = await generator.generateGraph(['*.md']);
 *
 *   // Export as JSON
 *   const json = generator.exportGraph(graph, 'json');
 *
 *   // Export as Mermaid diagram
 *   const mermaid = generator.exportGraph(graph, 'mermaid');
 *
 *   // Export as interactive HTML
 *   const html = generator.exportGraph(graph, 'html');
 * ```
 */
export class LinkGraphGenerator {
  private readonly options: Required<LinkGraphOptions>;

  private readonly parser: LinkParser;

  /**
   * Creates a generator, filling any option left unset with its default: external links excluded, images included, anchors excluded, the default maximum depth and the current working directory as base.
   * @param options - Graph generation options.
   */
  constructor(options: Readonly<LinkGraphOptions> = {}) {
    this.options = {
      includeExternal: options.includeExternal ?? false,
      includeImages: options.includeImages ?? true,
      includeAnchors: options.includeAnchors ?? false,
      maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
      baseDir: options.baseDir ?? process.cwd(),
    };
    this.parser = new LinkParser();
  }

  /**
   * Generates a complete link graph from markdown files.
   * @param patterns - File patterns to process (supports globs)
   * @returns Promise resolving to the generated link graph
   */
  async generateGraph(patterns: readonly string[]): Promise<LinkGraph> {
    // Parse all files to extract links
    const parsedFiles = await this.parseFiles(patterns);

    // Build graph nodes and edges
    const { nodes, edges } = await this.buildGraph(parsedFiles);

    // Perform graph analysis
    const analysis = this.analyzeGraph(nodes, edges);

    return {
      nodes,
      edges,
      metadata: {
        filesProcessed: parsedFiles.length,
        totalLinks: edges.length,
        baseDir: this.options.baseDir,
        generatedAt: new Date().toISOString(),
        options: this.options,
      },
      analysis,
    };
  }

  /**
   * Exports a link graph to the specified format.
   * @param graph - The link graph to export
   * @param format - Output format
   * @returns Formatted graph representation
   */
  exportGraph(graph: LinkGraph, format: GraphOutputFormat): string {
    switch (format) {
      case "json":
        return this.exportToJson(graph);
      case "mermaid":
        return this.exportToMermaid(graph);
      case "dot":
        return this.exportToDot(graph);
      case "html":
        return this.exportToHtml(graph);
      default:
        throw new Error(`Unsupported export format: ${String(format)}`);
    }
  }

  private async parseFiles(patterns: readonly string[]): Promise<
    {
      filePath: string;
      links: MarkdownLink[];
    }[]
  > {
    const { glob } = await import("glob");

    // Resolve file patterns
    const matchesPerPattern = await Promise.all(
      patterns.map(async (pattern) =>
        glob(pattern, {
          absolute: true,
          ignore: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
        }),
      ),
    );
    const files = matchesPerPattern.flatMap((matches) =>
      matches.filter((f) => f.endsWith(".md")),
    );

    // Parse each file
    const parsedOrUndefined = await Promise.all(
      files.map(async (filePath) => this.parseFileLinks(filePath)),
    );

    return parsedOrUndefined.filter((parsed) => parsed !== undefined);
  }

  private async parseFileLinks(
    filePath: string,
  ): Promise<{ filePath: string; links: MarkdownLink[] } | undefined> {
    try {
      const parsed = await this.parser.parseFile(filePath);

      return { filePath, links: parsed.links };
    } catch (error) {
      // Skip files that cannot be parsed
      console.warn("Failed to parse " + filePath + ":", error);

      return undefined;
    }
  }

  private async buildGraph(
    parsedFiles: readonly {
      filePath: string;
      links: MarkdownLink[];
    }[],
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const nodeMap = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];

    // Create nodes for all source files
    const sourceNodes = await Promise.all(
      parsedFiles.map(async ({ filePath }) => ({
        filePath,
        node: await this.createNode(filePath, "markdown"),
      })),
    );
    for (const { filePath, node } of sourceNodes) {
      nodeMap.set(filePath, node);
    }

    // Collect the included links and the target nodes they need, in encounter order
    const pendingTargets = new Map<string, GraphNode["type"]>();
    const includedLinks: {
      sourceId: string;
      targetPath: string;
      link: MarkdownLink;
    }[] = [];
    for (const { filePath, links } of parsedFiles) {
      const sourceNode = nodeMap.get(filePath);
      if (!sourceNode) continue;

      for (const link of links) {
        // Filter links based on options
        if (!this.shouldIncludeLink(link)) continue;

        const targetPath = this.resolveTargetPath(link, filePath);
        if (!nodeMap.has(targetPath) && !pendingTargets.has(targetPath)) {
          pendingTargets.set(targetPath, this.getNodeType(link, targetPath));
        }
        includedLinks.push({ sourceId: sourceNode.id, targetPath, link });
      }
    }

    // Create target nodes that do not exist yet
    const targetNodes = await Promise.all(
      [...pendingTargets].map(async ([targetPath, targetType]) =>
        this.createNode(targetPath, targetType),
      ),
    );
    for (const targetNode of targetNodes) {
      nodeMap.set(targetNode.path, targetNode);
    }

    // Create edges
    for (const { sourceId, targetPath, link } of includedLinks) {
      const edge = this.createEdge(sourceId, nodeMap.get(targetPath), link);
      if (edge !== undefined) {
        edges.push(edge);
      }
    }

    // Calculate node statistics
    this.calculateNodeStats(Array.from(nodeMap.values()), edges);

    return {
      nodes: Array.from(nodeMap.values()),
      edges,
    };
  }

  private createEdge(
    sourceId: string,
    targetNode: Readonly<GraphNode> | undefined,
    link: Readonly<MarkdownLink>,
  ): GraphEdge | undefined {
    if (targetNode === undefined) return undefined;

    // Filter out unsupported link types
    const edgeType = link.type === "reference" ? "internal" : link.type;

    // Type guard to ensure we only create edges with valid types
    if (
      edgeType !== "internal" &&
      edgeType !== "external" &&
      edgeType !== "image" &&
      edgeType !== "anchor" &&
      edgeType !== "claude-import"
    ) {
      return undefined;
    }

    const edge: GraphEdge = {
      source: sourceId,
      target: targetNode.id,
      type: edgeType,
      weight: 1,
    };

    if (link.text !== undefined && link.text !== "") {
      edge.text = link.text;
    }
    if (link.line) {
      edge.line = link.line;
    }

    return edge;
  }

  private async createNode(
    path: string,
    type: GraphNode["type"],
  ): Promise<GraphNode> {
    const relativePath = relative(this.options.baseDir, path);
    const id = this.generateNodeId(path);
    const label = this.generateNodeLabel(path, type);

    let size: number | undefined;
    if (type === "markdown") {
      try {
        const content = await readFile(path, "utf-8");
        size = content.length;
      } catch {
        // File might not exist or be readable
      }
    }

    const node: GraphNode = {
      id,
      label,
      path,
      relativePath,
      type,
      stats: {
        inbound: 0,
        outbound: 0,
        total: 0,
      },
      properties: {
        isHub: false,
        isOrphan: false,
      },
    };

    if (size !== undefined) {
      node.properties.size = size;
    }

    return node;
  }

  private shouldIncludeLink(link: Readonly<MarkdownLink>): boolean {
    const includedByType: Record<MarkdownLink["type"], boolean> = {
      external: this.options.includeExternal,
      image: this.options.includeImages,
      anchor: this.options.includeAnchors,
      internal: true,
      "claude-import": true,
      // Reference links are skipped for now
      reference: false,
      wikilink: false,
      "obsidian-transclusion": false,
    };

    return includedByType[link.type];
  }

  private resolveTargetPath(
    link: Readonly<MarkdownLink>,
    sourceFile: string,
  ): string {
    if (link.resolvedPath !== undefined && link.resolvedPath !== "") {
      return resolve(link.resolvedPath);
    }

    if (link.type === "external") {
      return link.href;
    }

    // Fallback: resolve relative to source file
    return resolve(dirname(sourceFile), link.href);
  }

  private getNodeType(
    link: Readonly<MarkdownLink>,
    targetPath: string,
  ): GraphNode["type"] {
    if (link.type === "external") {
      return "external";
    }

    if (link.type === "image") {
      return "image";
    }

    if (targetPath.endsWith(".md")) {
      return "markdown";
    }

    return "directory";
  }

  private generateNodeId(path: string): string {
    return Buffer.from(path).toString("base64").replace(/[+/=]/g, "");
  }

  private generateNodeLabel(path: string, type: GraphNode["type"]): string {
    if (type === "external") {
      try {
        const url = new URL(path);

        return url.hostname;
      } catch {
        return path;
      }
    }

    return relative(this.options.baseDir, path) || path;
  }

  private calculateNodeStats(
    nodes: readonly GraphNode[],
    edges: readonly GraphEdge[],
  ): void {
    // Reset stats
    for (const node of nodes) {
      node.stats.inbound = 0;
      node.stats.outbound = 0;
    }

    // Count edges
    for (const edge of edges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);

      if (sourceNode) {
        sourceNode.stats.outbound++;
      }
      if (targetNode) {
        targetNode.stats.inbound++;
      }
    }

    // Calculate totals and identify hubs/orphans
    for (const node of nodes) {
      node.stats.total = node.stats.inbound + node.stats.outbound;
      // Threshold for hub detection
      node.properties.isHub = node.stats.total > HUB_LINK_THRESHOLD;
      node.properties.isOrphan = node.stats.total === 0;
    }
  }

  private analyzeGraph(
    nodes: readonly GraphNode[],
    edges: readonly GraphEdge[],
  ): LinkGraph["analysis"] {
    const hubs = nodes
      .filter((n) => n.properties.isHub === true)
      .map((n) => n.id);

    const orphans = nodes
      .filter((n) => n.properties.isOrphan === true)
      .map((n) => n.id);

    // Simple circular reference detection
    const circularReferences = this.detectCircularReferences(nodes, edges);

    // For now, use a simple connected component algorithm
    const stronglyConnected = this.findStronglyConnectedComponents(
      nodes,
      edges,
    );

    return {
      hubs,
      orphans,
      circularReferences,
      stronglyConnected,
    };
  }

  private detectCircularReferences(
    nodes: readonly GraphNode[],
    edges: readonly GraphEdge[],
  ): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string, path: readonly string[]): void => {
      if (recursionStack.has(nodeId)) {
        // Found a cycle
        const cycleStart = path.indexOf(nodeId);
        const cycle = path.slice(cycleStart).concat(nodeId);
        cycles.push(cycle);

        return;
      }

      if (visited.has(nodeId)) {
        return;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      // Find outgoing edges
      const outgoingEdges = edges.filter((e) => e.source === nodeId);
      for (const edge of outgoingEdges) {
        dfs(edge.target, [...path, nodeId]);
      }

      recursionStack.delete(nodeId);
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id, []);
      }
    }

    return cycles;
  }

  private findStronglyConnectedComponents(
    nodes: readonly GraphNode[],
    edges: readonly GraphEdge[],
  ): string[][] {
    // Simplified implementation - just return connected components
    const components: string[][] = [];
    const visited = new Set<string>();

    // Collects the nodes first reached from nodeId, in depth-first pre-order
    const collect = (nodeId: string): string[] => {
      if (visited.has(nodeId)) {
        return [];
      }

      visited.add(nodeId);
      const component = [nodeId];

      // Find all connected nodes (both directions)
      const connectedEdges = edges.filter(
        (e) => e.source === nodeId || e.target === nodeId,
      );

      for (const edge of connectedEdges) {
        const connectedNode =
          edge.source === nodeId ? edge.target : edge.source;
        component.push(...collect(connectedNode));
      }

      return component;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        const component = collect(node.id);
        if (component.length > 1) {
          components.push(component);
        }
      }
    }

    return components;
  }

  private exportToJson(graph: LinkGraph): string {
    return JSON.stringify(graph, null, 2);
  }

  private exportToMermaid(graph: LinkGraph): string {
    const lines = ["graph TD"];

    // Add nodes with labels
    for (const node of graph.nodes) {
      const shape = this.getMermaidNodeShape(node);
      // Remove brackets
      const label = node.label.replace(/[[\]]/g, "");
      lines.push("  " + node.id + shape[0] + label + shape[1]);
    }

    // Add edges
    for (const edge of graph.edges) {
      const arrow = this.getMermaidArrow(edge);
      lines.push("  " + edge.source + " " + arrow + " " + edge.target);
    }

    return lines.join("\n");
  }

  private getMermaidNodeShape(node: GraphNode): [string, string] {
    switch (node.type) {
      case "markdown":
        return ["[", "]"];
      case "external":
        return ["((", "))"];
      case "image":
        return ["([", "])"];
      case "directory":
        return ["{", "}"];
      default:
        return ["[", "]"];
    }
  }

  private getMermaidArrow(edge: Readonly<GraphEdge>): string {
    const arrows: Record<GraphEdge["type"], string> = {
      external: "-..->",
      image: "==->",
      internal: "-->",
      anchor: "-->",
      "claude-import": "-->",
    };

    return arrows[edge.type];
  }

  private exportToDot(graph: LinkGraph): string {
    const lines = ["digraph LinkGraph {"];
    lines.push("  node [shape=box];");

    // Add nodes
    for (const node of graph.nodes) {
      const style = this.getDotNodeStyle(node);
      lines.push(
        '  "' + node.id + '" [label="' + node.label + '"' + style + "];",
      );
    }

    // Add edges
    for (const edge of graph.edges) {
      const style = this.getDotEdgeStyle(edge);
      lines.push(
        '  "' + edge.source + '" -> "' + edge.target + '"' + style + ";",
      );
    }

    lines.push("}");

    return lines.join("\n");
  }

  private getDotNodeStyle(node: GraphNode): string {
    const styles = [];

    if (node.properties.isHub === true) {
      styles.push("color=red");
    }

    if (node.properties.isOrphan === true) {
      styles.push("color=gray");
    }

    switch (node.type) {
      case "external":
        styles.push("shape=ellipse");
        break;
      case "image":
        styles.push("shape=diamond");
        break;
      case "markdown":
      case "directory":
        break;
    }

    return styles.length > 0 ? ", " + styles.join(", ") : "";
  }

  private getDotEdgeStyle(edge: Readonly<GraphEdge>): string {
    const styles = [];

    switch (edge.type) {
      case "external":
        styles.push("style=dashed");
        break;
      case "image":
        styles.push("color=blue");
        break;
      case "internal":
      case "anchor":
      case "claude-import":
        break;
    }

    return styles.length > 0 ? " [" + styles.join(", ") + "]" : "";
  }

  private exportToHtml(graph: LinkGraph): string {
    const graphDataJson = JSON.stringify(graph, null, 2);

    return `<!DOCTYPE html>
<html>
<head>
  <title>Link Graph Visualization</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
    #graph { width: 100%; height: 600px; border: 1px solid #ccc; }
    .node { cursor: pointer; }
    .link { stroke: #999; stroke-opacity: 0.6; }
    .node.hub { fill: #ff6b6b; }
    .node.orphan { fill: #95a5a6; }
    .node.markdown { fill: #3498db; }
    .node.external { fill: #e74c3c; }
    .node.image { fill: #f39c12; }
    .tooltip { position: absolute; background: rgba(0,0,0,0.8); color: white; padding: 5px; border-radius: 3px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Link Graph Visualization</h1>
  <div id="graph"></div>
  <script>
    const graphData = ${graphDataJson};
    
    const width = 960;
    const height = 600;
    
    const svg = d3.select("#graph")
      .append("svg")
      .attr("width", width)
      .attr("height", height);
    
    const simulation = d3.forceSimulation(graphData.nodes)
      .force("link", d3.forceLink(graphData.edges).id(d => d.id))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));
    
    const link = svg.append("g")
      .selectAll("line")
      .data(graphData.edges)
      .enter().append("line")
      .attr("class", "link");
    
    const node = svg.append("g")
      .selectAll("circle")
      .data(graphData.nodes)
      .enter().append("circle")
      .attr("class", d => "node " + d.type + (d.properties.isHub ? " hub" : "") + (d.properties.isOrphan ? " orphan" : ""))
      .attr("r", d => Math.sqrt(d.stats.total) * 3 + 5)
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));
    
    node.append("title")
      .text(d => d.label + "\\nInbound: " + d.stats.inbound + "\\nOutbound: " + d.stats.outbound);
    
    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
      
      node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);
    });
    
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  </script>
</body>
</html>`;
  }
}
