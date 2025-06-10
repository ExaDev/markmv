import { beforeEach, describe, expect, it } from 'vitest';
import type { ParsedMarkdownFile } from '../../types/links.js';
import { DependencyGraph } from '../dependency-graph.js';

describe('DependencyGraph', () => {
  let graph: DependencyGraph;
  let mockFiles: ParsedMarkdownFile[];

  beforeEach(() => {
    graph = new DependencyGraph();

    mockFiles = [
      {
        filePath: '/project/a.md',
        links: [],
        references: [],
        dependencies: ['/project/b.md', '/project/c.md'],
        dependents: [],
      },
      {
        filePath: '/project/b.md',
        links: [],
        references: [],
        dependencies: ['/project/c.md'],
        dependents: [],
      },
      {
        filePath: '/project/c.md',
        links: [],
        references: [],
        dependencies: [],
        dependents: [],
      },
    ];
  });

  describe('build', () => {
    it('should build dependency graph from files', () => {
      graph.build(mockFiles);

      expect(graph.size()).toBe(3);
      expect(graph.getDependencies('/project/a.md')).toEqual(['/project/b.md', '/project/c.md']);
      expect(graph.getDependencies('/project/b.md')).toEqual(['/project/c.md']);
      expect(graph.getDependencies('/project/c.md')).toEqual([]);
    });

    it('should update dependents correctly', () => {
      graph.build(mockFiles);

      expect(graph.getDependents('/project/c.md')).toEqual(['/project/a.md', '/project/b.md']);
      expect(graph.getDependents('/project/b.md')).toEqual(['/project/a.md']);
      expect(graph.getDependents('/project/a.md')).toEqual([]);
    });
  });

  describe('getTransitiveDependencies', () => {
    it('should return all transitive dependencies', () => {
      graph.build(mockFiles);

      const transitive = graph.getTransitiveDependencies('/project/a.md');
      expect(transitive.sort()).toEqual(['/project/b.md', '/project/c.md']);

      const bTransitive = graph.getTransitiveDependencies('/project/b.md');
      expect(bTransitive).toEqual(['/project/c.md']);
    });
  });

  describe('getTransitiveDependents', () => {
    it('should return all transitive dependents', () => {
      graph.build(mockFiles);

      const transitive = graph.getTransitiveDependents('/project/c.md');
      expect(transitive.sort()).toEqual(['/project/a.md', '/project/b.md']);

      const bTransitive = graph.getTransitiveDependents('/project/b.md');
      expect(bTransitive).toEqual(['/project/a.md']);
    });
  });

  describe('detectCircularDependencies', () => {
    it('should detect circular dependencies', () => {
      const circularFiles: ParsedMarkdownFile[] = [
        {
          filePath: '/project/a.md',
          links: [],
          references: [],
          dependencies: ['/project/b.md'],
          dependents: [],
        },
        {
          filePath: '/project/b.md',
          links: [],
          references: [],
          dependencies: ['/project/c.md'],
          dependents: [],
        },
        {
          filePath: '/project/c.md',
          links: [],
          references: [],
          dependencies: ['/project/a.md'], // Creates cycle
          dependents: [],
        },
      ];

      graph.build(circularFiles);
      const cycles = graph.detectCircularDependencies();

      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toContain('/project/a.md');
      expect(cycles[0]).toContain('/project/b.md');
      expect(cycles[0]).toContain('/project/c.md');
    });

    it('should return empty array for acyclic graph', () => {
      graph.build(mockFiles);
      const cycles = graph.detectCircularDependencies();

      expect(cycles).toHaveLength(0);
    });
  });

  describe('topologicalSort', () => {
    it('should return files in dependency order', () => {
      graph.build(mockFiles);
      const sorted = graph.topologicalSort();

      expect(sorted).toEqual(['/project/c.md', '/project/b.md', '/project/a.md']);
    });
  });

  describe('updateFilePath', () => {
    it('should update file path and all references', () => {
      graph.build(mockFiles);

      graph.updateFilePath('/project/b.md', '/project/b-renamed.md');

      expect(graph.getNode('/project/b.md')).toBeUndefined();
      expect(graph.getNode('/project/b-renamed.md')).toBeDefined();

      // Check that dependencies are updated
      const aDeps = graph.getDependencies('/project/a.md');
      expect(aDeps).toContain('/project/b-renamed.md');
      expect(aDeps).not.toContain('/project/b.md');

      // Check that dependents are updated
      const cDependents = graph.getDependents('/project/c.md');
      expect(cDependents).toContain('/project/b-renamed.md');
      expect(cDependents).not.toContain('/project/b.md');
    });
  });

  describe('removeNode', () => {
    it('should remove node and all references', () => {
      graph.build(mockFiles);

      graph.removeNode('/project/b.md');

      expect(graph.size()).toBe(2);
      expect(graph.getNode('/project/b.md')).toBeUndefined();

      // Dependencies should be updated
      const aDeps = graph.getDependencies('/project/a.md');
      expect(aDeps).not.toContain('/project/b.md');

      // Dependents should be updated
      const cDependents = graph.getDependents('/project/c.md');
      expect(cDependents).not.toContain('/project/b.md');
    });
  });

  describe('toJSON', () => {
    it('should serialize graph to JSON', () => {
      graph.build(mockFiles);
      const json = graph.toJSON();

      expect(json).toEqual({
        '/project/a.md': ['/project/b.md', '/project/c.md'],
        '/project/b.md': ['/project/c.md'],
        '/project/c.md': [],
      });
    });
  });
});
