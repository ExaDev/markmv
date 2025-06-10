import type { ParsedMarkdownFile } from '../types/links.js';

export interface FileNode {
  /** Absolute file path */
  path: string;
  /** Parsed markdown data */
  data: ParsedMarkdownFile;
  /** Files this file directly depends on */
  dependencies: Set<string>;
  /** Files that directly depend on this file */
  dependents: Set<string>;
}

export class DependencyGraph {
  private nodes = new Map<string, FileNode>();
  private edges = new Map<string, Set<string>>();

  constructor(files: ParsedMarkdownFile[] = []) {
    if (files.length > 0) {
      this.build(files);
    }
  }

  build(files: ParsedMarkdownFile[]): void {
    this.clear();

    // Create nodes for all files
    for (const file of files) {
      this.addNode(file);
    }

    // Build dependency relationships
    for (const file of files) {
      this.addDependencies(file);
    }

    // Update dependents (reverse dependencies)
    this.updateDependents();
  }

  addNode(file: ParsedMarkdownFile): void {
    const node: FileNode = {
      path: file.filePath,
      data: file,
      dependencies: new Set(file.dependencies),
      dependents: new Set(),
    };

    this.nodes.set(file.filePath, node);
    this.edges.set(file.filePath, new Set(file.dependencies));
  }

  addDependencies(file: ParsedMarkdownFile): void {
    const dependencies = new Set(file.dependencies);
    this.edges.set(file.filePath, dependencies);

    const node = this.nodes.get(file.filePath);
    if (node) {
      node.dependencies = dependencies;
    }
  }

  private updateDependents(): void {
    // Clear existing dependents
    for (const node of this.nodes.values()) {
      node.dependents.clear();
    }

    // Rebuild dependents from dependencies
    for (const [filePath, dependencies] of this.edges) {
      for (const depPath of dependencies) {
        const depNode = this.nodes.get(depPath);
        if (depNode) {
          depNode.dependents.add(filePath);
        }
      }
    }

    // Update the parsed file data
    for (const node of this.nodes.values()) {
      node.data.dependents = Array.from(node.dependents);
    }
  }

  getNode(filePath: string): FileNode | undefined {
    return this.nodes.get(filePath);
  }

  getDependencies(filePath: string): string[] {
    const dependencies = this.edges.get(filePath);
    return dependencies ? Array.from(dependencies) : [];
  }

  getDependents(filePath: string): string[] {
    const node = this.nodes.get(filePath);
    return node ? Array.from(node.dependents) : [];
  }

  getTransitiveDependencies(filePath: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (path: string) => {
      if (visited.has(path)) return;
      visited.add(path);

      const dependencies = this.getDependencies(path);
      for (const dep of dependencies) {
        result.push(dep);
        visit(dep);
      }
    };

    visit(filePath);
    return [...new Set(result)]; // Remove duplicates
  }

  getTransitiveDependents(filePath: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (path: string) => {
      if (visited.has(path)) return;
      visited.add(path);

      const dependents = this.getDependents(path);
      for (const dep of dependents) {
        result.push(dep);
        visit(dep);
      }
    };

    visit(filePath);
    return [...new Set(result)]; // Remove duplicates
  }

  detectCircularDependencies(): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (path: string, currentPath: string[]): void => {
      if (recursionStack.has(path)) {
        // Found a cycle
        const cycleStart = currentPath.indexOf(path);
        cycles.push([...currentPath.slice(cycleStart), path]);
        return;
      }

      if (visited.has(path)) return;

      visited.add(path);
      recursionStack.add(path);
      currentPath.push(path);

      const dependencies = this.getDependencies(path);
      for (const dep of dependencies) {
        dfs(dep, [...currentPath]);
      }

      recursionStack.delete(path);
    };

    for (const filePath of this.nodes.keys()) {
      if (!visited.has(filePath)) {
        dfs(filePath, []);
      }
    }

    return cycles;
  }

  topologicalSort(): string[] {
    const visited = new Set<string>();
    const stack: string[] = [];

    const dfs = (path: string): void => {
      if (visited.has(path)) return;
      visited.add(path);

      const dependencies = this.getDependencies(path);
      for (const dep of dependencies) {
        dfs(dep);
      }

      stack.push(path);
    };

    for (const filePath of this.nodes.keys()) {
      if (!visited.has(filePath)) {
        dfs(filePath);
      }
    }

    return stack.reverse();
  }

  updateFilePath(oldPath: string, newPath: string): void {
    const node = this.nodes.get(oldPath);
    if (!node) return;

    // Update the node
    node.path = newPath;
    node.data.filePath = newPath;

    // Move the node to new key
    this.nodes.delete(oldPath);
    this.nodes.set(newPath, node);

    // Update edges
    const dependencies = this.edges.get(oldPath);
    if (dependencies) {
      this.edges.delete(oldPath);
      this.edges.set(newPath, dependencies);
    }

    // Update all references to this file in other nodes
    for (const [, deps] of this.edges) {
      if (deps.has(oldPath)) {
        deps.delete(oldPath);
        deps.add(newPath);
      }
    }

    // Update dependencies and dependents in nodes
    for (const otherNode of this.nodes.values()) {
      if (otherNode.dependencies.has(oldPath)) {
        otherNode.dependencies.delete(oldPath);
        otherNode.dependencies.add(newPath);
      }
      if (otherNode.dependents.has(oldPath)) {
        otherNode.dependents.delete(oldPath);
        otherNode.dependents.add(newPath);
      }
    }
  }

  removeNode(filePath: string): void {
    const node = this.nodes.get(filePath);
    if (!node) return;

    // Remove from all dependency lists
    for (const otherNode of this.nodes.values()) {
      otherNode.dependencies.delete(filePath);
      otherNode.dependents.delete(filePath);
    }

    // Remove from edges
    for (const deps of this.edges.values()) {
      deps.delete(filePath);
    }

    // Remove the node itself
    this.nodes.delete(filePath);
    this.edges.delete(filePath);
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
  }

  getAllFiles(): string[] {
    return Array.from(this.nodes.keys());
  }

  size(): number {
    return this.nodes.size;
  }

  toJSON(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [filePath, dependencies] of this.edges) {
      result[filePath] = Array.from(dependencies);
    }
    return result;
  }
}
