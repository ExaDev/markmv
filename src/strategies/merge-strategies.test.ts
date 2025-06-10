import { describe, it, expect } from 'vitest';
import { 
  AppendMergeStrategy,
  PrependMergeStrategy,
  InteractiveMergeStrategy
} from './merge-strategies.js';

describe('Merge Strategies', () => {
  const targetContent = `---
title: "Target Document"
tags: ["target", "main"]
---

# Target Document

This is the target document.

## Section A

Content of section A.

## Section B

Content of section B.`;

  const sourceContent = `---
title: "Source Document"
tags: ["source", "addon"]
author: "Test Author"
---

# Source Document

This is the source document.

## Section C

Content of section C.

## Section A

Different content for section A.`;

  describe('AppendMergeStrategy', () => {
    it('should append source content to target', async () => {
      const strategy = new AppendMergeStrategy();
      const result = await strategy.merge(targetContent, sourceContent, 'target.md', 'source.md');

      expect(result.success).toBe(true);
      expect(result.content).toContain('This is the target document.');
      expect(result.content).toContain('This is the source document.');
      
      // Target content should come first
      const targetIndex = result.content.indexOf('This is the target document.');
      const sourceIndex = result.content.indexOf('This is the source document.');
      expect(targetIndex).toBeLessThan(sourceIndex);
    });

    it('should merge frontmatter correctly', async () => {
      const strategy = new AppendMergeStrategy({ mergeFrontmatter: true });
      const result = await strategy.merge(targetContent, sourceContent, 'target.md', 'source.md');

      expect(result.frontmatter).toContain('title: "Target Document"');
      expect(result.frontmatter).toContain('author: "Test Author"');
      expect(result.frontmatter).toContain('tags: [');
      expect(result.frontmatter).toContain('"target"');
      expect(result.frontmatter).toContain('"main"');
      expect(result.frontmatter).toContain('"source"');
      expect(result.frontmatter).toContain('"addon"');
    });

    it('should detect header conflicts', async () => {
      const strategy = new AppendMergeStrategy();
      const result = await strategy.merge(targetContent, sourceContent, 'target.md', 'source.md');

      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts.some(c => c.type === 'header-collision')).toBe(true);
      expect(result.conflicts.some(c => c.description.includes('Section A'))).toBe(true);
    });

    it('should create transclusions when requested', async () => {
      const strategy = new AppendMergeStrategy({ createTransclusions: true });
      const result = await strategy.merge(targetContent, sourceContent, 'target.md', 'source.md');

      expect(result.success).toBe(true);
      expect(result.transclusions.length).toBeGreaterThan(0);
      expect(result.content).toContain('![[source]]');
    });

    it('should detect transclusion loops', async () => {
      const loopContent = `# Target

Some content.

![[target]]

More content.`;

      const strategy = new AppendMergeStrategy({ createTransclusions: true });
      const result = await strategy.merge(loopContent, sourceContent, 'target.md', 'source.md');

      expect(result.warnings.some(w => w.includes('loop detected'))).toBe(true);
    });

    it('should handle files without frontmatter', async () => {
      const simpleTarget = '# Simple Target\n\nJust content.';
      const simpleSource = '# Simple Source\n\nMore content.';

      const strategy = new AppendMergeStrategy();
      const result = await strategy.merge(simpleTarget, simpleSource, 'target.md', 'source.md');

      expect(result.success).toBe(true);
      expect(result.content).toContain('# Simple Target');
      expect(result.content).toContain('# Simple Source');
    });

    it('should use custom separator', async () => {
      const strategy = new AppendMergeStrategy({ separator: '\n\n---CUSTOM---\n\n' });
      const result = await strategy.merge(targetContent, sourceContent, 'target.md', 'source.md');

      expect(result.content).toContain('---CUSTOM---');
    });
  });

  describe('PrependMergeStrategy', () => {
    it('should prepend source content to target', async () => {
      const strategy = new PrependMergeStrategy();
      const result = await strategy.merge(targetContent, sourceContent, 'target.md', 'source.md');

      expect(result.success).toBe(true);
      expect(result.content).toContain('This is the target document.');
      expect(result.content).toContain('This is the source document.');
      
      // Source content should come first
      const targetIndex = result.content.indexOf('This is the target document.');
      const sourceIndex = result.content.indexOf('This is the source document.');
      expect(sourceIndex).toBeLessThan(targetIndex);
    });

    it('should preserve target frontmatter precedence', async () => {
      const strategy = new PrependMergeStrategy({ mergeFrontmatter: true });
      const result = await strategy.merge(targetContent, sourceContent, 'target.md', 'source.md');

      // Target title should win
      expect(result.frontmatter).toContain('title: "Target Document"');
      // But source-only fields should be included
      expect(result.frontmatter).toContain('author: "Test Author"');
    });
  });

  describe('InteractiveMergeStrategy', () => {
    it('should create interactive conflicts for manual resolution', async () => {
      const strategy = new InteractiveMergeStrategy();
      const result = await strategy.merge(targetContent, sourceContent, 'target.md', 'source.md');

      expect(result.success).toBe(true);
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts.some(c => !c.autoResolved)).toBe(true);
      expect(result.warnings.some(w => w.includes('Interactive merge'))).toBe(true);
    });

    it('should mark content for manual review', async () => {
      const strategy = new InteractiveMergeStrategy();
      const result = await strategy.merge(targetContent, sourceContent, 'target.md', 'source.md');

      expect(result.content).toContain('MERGE CONFLICT');
      expect(result.content).toContain('Review and resolve manually');
    });

    it('should create conflicts for each header placement decision', async () => {
      const strategy = new InteractiveMergeStrategy();
      const result = await strategy.merge(targetContent, sourceContent, 'target.md', 'source.md');

      // Should have conflicts for header collisions AND section placements
      const headerConflicts = result.conflicts.filter(c => c.type === 'header-collision');
      const placementConflicts = result.conflicts.filter(c => c.type === 'content-overlap');
      
      expect(headerConflicts.length).toBeGreaterThan(0);
      expect(placementConflicts.length).toBeGreaterThan(0);
    });

    it('should provide resolution guidance', async () => {
      const strategy = new InteractiveMergeStrategy();
      const result = await strategy.merge(targetContent, sourceContent, 'target.md', 'source.md');

      const hasResolutionGuidance = result.conflicts.every(c => c.resolution && c.resolution.length > 0);
      expect(hasResolutionGuidance).toBe(true);
    });
  });

  describe('BaseMergeStrategy utilities', () => {
    const strategy = new AppendMergeStrategy();

    it('should extract transclusions correctly', () => {
      const extractTransclusions = (strategy as any).extractTransclusions.bind(strategy);
      
      const content = `# Test Document

Some content.

![[other-file]]

More content.

![[another-file#section]]

End.`;

      const transclusions = extractTransclusions(content);
      
      expect(transclusions).toHaveLength(2);
      expect(transclusions[0].file).toBe('other-file.md');
      expect(transclusions[0].section).toBeUndefined();
      expect(transclusions[1].file).toBe('another-file.md');
      expect(transclusions[1].section).toBe('section');
    });

    it('should create transclusion references', () => {
      const createTransclusion = (strategy as any).createTransclusion.bind(strategy);
      
      expect(createTransclusion('test-file.md')).toBe('![[test-file]]');
      expect(createTransclusion('test-file.md', 'section')).toBe('![[test-file#section]]');
    });

    it('should detect transclusion loops', () => {
      const detectLoops = (strategy as any).detectTransclusionLoops.bind(strategy);
      
      const existingRefs = ['![[file-a]]', '![[file-b#section]]'];
      
      expect(detectLoops('file-a.md', 'file-c.md', existingRefs)).toBe(true);
      expect(detectLoops('file-d.md', 'file-c.md', existingRefs)).toBe(false);
      expect(detectLoops('same.md', 'same.md', [])).toBe(true);
    });

    it('should extract headers with levels and positions', () => {
      const extractHeaders = (strategy as any).extractHeaders.bind(strategy);
      
      const content = `# Main Header
Some content.

## Section Header
More content.

### Subsection
Even more content.`;

      const headers = extractHeaders(content);
      
      expect(headers).toHaveLength(3);
      expect(headers[0].text).toBe('Main Header');
      expect(headers[0].level).toBe(1);
      expect(headers[0].line).toBe(1);
      
      expect(headers[1].text).toBe('Section Header');
      expect(headers[1].level).toBe(2);
      expect(headers[1].line).toBe(4);
    });

    it('should find header conflicts', () => {
      const findConflicts = (strategy as any).findHeaderConflicts.bind(strategy);
      
      const target = '# Same Header\n\n## Different Header\n\n### Same Header';
      const source = '# Same Header\n\n## Another Header\n\n### Same Header';
      
      const conflicts = findConflicts(target, source);
      
      expect(conflicts).toHaveLength(2); // Both "Same Header" instances
      expect(conflicts[0].header).toBe('Same Header');
    });

    it('should merge frontmatter with array deduplication', () => {
      const mergeFrontmatter = (strategy as any).mergeFrontmatter.bind(strategy);
      
      const target = `---
title: "Target"
tags: ["tag1", "tag2"]
author: "Target Author"
---`;

      const source = `---
title: "Source"
tags: ["tag2", "tag3"]
category: "Source Category"
---`;

      const merged = mergeFrontmatter(target, source);
      
      expect(merged).toContain('title: "Target"'); // Target wins
      expect(merged).toContain('author: "Target Author"'); // Target only
      expect(merged).toContain('category: "Source Category"'); // Source only
      expect(merged).toContain('"tag1"'); // All tags included
      expect(merged).toContain('"tag2"'); 
      expect(merged).toContain('"tag3"');
    });
  });
});