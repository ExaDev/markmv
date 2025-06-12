import { describe, expect, it } from 'vitest';
import {
  AlphabeticalJoinStrategy,
  ChronologicalJoinStrategy,
  DependencyOrderJoinStrategy,
  ManualOrderJoinStrategy,
} from './join-strategies.js';
import type { JoinSection } from './join-strategies.js';

describe('Join Strategies', () => {
  const mockSections: JoinSection[] = [
    {
      filePath: 'intro.md',
      content: '# Introduction\n\nThis is the introduction section.\n\n[Link to basics](basics.md)',
      frontmatter: '---\ntitle: "Introduction"\norder: 1\n---\n',
      title: 'Introduction',
      dependencies: ['basics.md'],
      order: 1,
    },
    {
      filePath: 'basics.md',
      content: '# Basics\n\nThis covers the basics.\n\n[Link to advanced](advanced.md)',
      frontmatter: '---\ntitle: "Basics"\norder: 2\n---\n',
      title: 'Basics',
      dependencies: ['advanced.md'],
      order: 2,
    },
    {
      filePath: 'advanced.md',
      content: '# Advanced Topics\n\nAdvanced concepts are covered here.',
      frontmatter: '---\ntitle: "Advanced Topics"\norder: 3\n---\n',
      title: 'Advanced Topics',
      dependencies: [],
      order: 3,
    },
  ];

  describe('DependencyOrderJoinStrategy', () => {
    it('should join sections in dependency order', async () => {
      const strategy = new DependencyOrderJoinStrategy();
      const result = await strategy.join(mockSections);

      expect(result.success).toBe(true);
      expect(result.sourceFiles).toEqual(['advanced.md', 'basics.md', 'intro.md']);
      expect(result.content).toContain('# Advanced Topics');
      expect(result.content).toContain('# Basics');
      expect(result.content).toContain('# Introduction');

      // Should be ordered so dependencies come first
      const advancedIndex = result.content.indexOf('# Advanced Topics');
      const basicsIndex = result.content.indexOf('# Basics');
      const introIndex = result.content.indexOf('# Introduction');

      expect(advancedIndex).toBeLessThan(basicsIndex);
      expect(basicsIndex).toBeLessThan(introIndex);
    });

    it('should merge frontmatter correctly', async () => {
      const strategy = new DependencyOrderJoinStrategy({ mergeFrontmatter: true });
      const result = await strategy.join(mockSections);

      expect(result.frontmatter).toContain('title: "Advanced Topics & Basics & Introduction"');
      expect(result.frontmatter).toContain('order: 3'); // Should use first found
    });

    it('should deduplicate links', async () => {
      const sectionsWithDuplicateLinks: JoinSection[] = [
        {
          filePath: 'file1.md',
          content: '# File 1\n\n[Common link](shared.md)\n\nContent 1',
          dependencies: ['shared.md'],
          order: 1,
        },
        {
          filePath: 'file2.md',
          content: '# File 2\n\n[Common link](shared.md)\n\nContent 2',
          dependencies: ['shared.md'],
          order: 2,
        },
      ];

      const strategy = new DependencyOrderJoinStrategy({ deduplicateLinks: true });
      const result = await strategy.join(sectionsWithDuplicateLinks);

      expect(result.deduplicatedLinks.length).toBeGreaterThan(0);
      expect(result.deduplicatedLinks[0]).toBe('[Common link](shared.md)');
    });

    it('should detect header conflicts', async () => {
      const sectionsWithConflicts: JoinSection[] = [
        {
          filePath: 'file1.md',
          content: '# Introduction\n\nFirst intro',
          dependencies: [],
          order: 1,
        },
        {
          filePath: 'file2.md',
          content: '# Introduction\n\nSecond intro',
          dependencies: [],
          order: 2,
        },
      ];

      const strategy = new DependencyOrderJoinStrategy();
      const result = await strategy.join(sectionsWithConflicts);

      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].type).toBe('duplicate-headers');
      expect(result.conflicts[0].files).toEqual(['file1.md', 'file2.md']);
    });

    it('should handle circular dependencies', async () => {
      const circularSections: JoinSection[] = [
        {
          filePath: 'a.md',
          content: '# A\n\n[Link to B](b.md)',
          dependencies: ['b.md'],
          order: 1,
        },
        {
          filePath: 'b.md',
          content: '# B\n\n[Link to A](a.md)',
          dependencies: ['a.md'],
          order: 2,
        },
      ];

      const strategy = new DependencyOrderJoinStrategy();
      const result = await strategy.join(circularSections);

      expect(result.success).toBe(true);
      expect(result.warnings).toContain(
        'Circular dependency detected, falling back to manual order'
      );
    });
  });

  describe('AlphabeticalJoinStrategy', () => {
    it('should join sections in alphabetical order', async () => {
      const strategy = new AlphabeticalJoinStrategy();
      const result = await strategy.join(mockSections);

      expect(result.sourceFiles).toEqual(['advanced.md', 'basics.md', 'intro.md']);

      const advancedIndex = result.content.indexOf('# Advanced Topics');
      const basicsIndex = result.content.indexOf('# Basics');
      const introIndex = result.content.indexOf('# Introduction');

      expect(advancedIndex).toBeLessThan(basicsIndex);
      expect(basicsIndex).toBeLessThan(introIndex);
    });

    it('should handle files without titles', async () => {
      const sectionsWithoutTitles: JoinSection[] = [
        {
          filePath: 'zebra.md',
          content: 'Content without header',
          dependencies: [],
          order: 1,
        },
        {
          filePath: 'alpha.md',
          content: 'Another file without header',
          dependencies: [],
          order: 2,
        },
      ];

      const strategy = new AlphabeticalJoinStrategy();
      const result = await strategy.join(sectionsWithoutTitles);

      expect(result.sourceFiles).toEqual(['alpha.md', 'zebra.md']);
    });
  });

  describe('ManualOrderJoinStrategy', () => {
    it('should join sections in specified manual order', async () => {
      const strategy = new ManualOrderJoinStrategy({
        customOrder: ['basics.md', 'advanced.md', 'intro.md'],
      });
      const result = await strategy.join(mockSections);

      expect(result.sourceFiles).toEqual(['basics.md', 'advanced.md', 'intro.md']);

      const basicsIndex = result.content.indexOf('# Basics');
      const advancedIndex = result.content.indexOf('# Advanced Topics');
      const introIndex = result.content.indexOf('# Introduction');

      expect(basicsIndex).toBeLessThan(advancedIndex);
      expect(advancedIndex).toBeLessThan(introIndex);
    });

    it('should handle missing files in custom order', async () => {
      const strategy = new ManualOrderJoinStrategy({
        customOrder: ['missing.md', 'basics.md', 'intro.md'],
      });
      const result = await strategy.join(mockSections);

      expect(result.warnings).toContain(
        'File missing.md specified in custom order but not found in sections'
      );
      expect(result.sourceFiles).toEqual(['basics.md', 'intro.md', 'advanced.md']);
    });

    it('should fall back to alphabetical for unspecified files', async () => {
      const strategy = new ManualOrderJoinStrategy({
        customOrder: ['intro.md'],
      });
      const result = await strategy.join(mockSections);

      expect(result.sourceFiles[0]).toBe('intro.md');
      // Remaining files should be in alphabetical order
      expect(result.sourceFiles.slice(1)).toEqual(['advanced.md', 'basics.md']);
    });
  });

  describe('ChronologicalJoinStrategy', () => {
    it('should join sections in chronological order', async () => {
      const sectionsWithDates: JoinSection[] = [
        {
          filePath: '2023-01-15-post.md',
          content: '# Post from January\n\nOlder post',
          frontmatter: '---\ndate: 2023-01-15\n---\n',
          dependencies: [],
          order: 1,
        },
        {
          filePath: '2023-03-10-post.md',
          content: '# Post from March\n\nNewer post',
          frontmatter: '---\ndate: 2023-03-10\n---\n',
          dependencies: [],
          order: 2,
        },
        {
          filePath: 'undated-post.md',
          content: '# Undated Post\n\nNo date specified',
          dependencies: [],
          order: 3,
        },
      ];

      const strategy = new ChronologicalJoinStrategy();
      const result = await strategy.join(sectionsWithDates);

      expect(result.sourceFiles[0]).toBe('2023-01-15-post.md');
      expect(result.sourceFiles[1]).toBe('2023-03-10-post.md');
      expect(result.sourceFiles[2]).toBe('undated-post.md'); // Should be last
    });

    it('should extract dates from filenames when frontmatter missing', async () => {
      const sectionsWithFilenameDates: JoinSection[] = [
        {
          filePath: '2023-12-01-newer.md',
          content: '# Newer Post',
          dependencies: [],
          order: 1,
        },
        {
          filePath: '2023-01-01-older.md',
          content: '# Older Post',
          dependencies: [],
          order: 2,
        },
      ];

      const strategy = new ChronologicalJoinStrategy();
      const result = await strategy.join(sectionsWithFilenameDates);

      expect(result.sourceFiles[0]).toBe('2023-01-01-older.md');
      expect(result.sourceFiles[1]).toBe('2023-12-01-newer.md');
    });
  });

  describe('BaseJoinStrategy utilities', () => {
    const strategy = new DependencyOrderJoinStrategy();

    it('should extract titles correctly', () => {
      const extractTitle = (
        strategy as { extractTitle: (content: string, frontmatter: string) => string }
      ).extractTitle.bind(strategy);

      expect(extractTitle('# Main Title\n\nContent', '')).toBe('Main Title');
      expect(extractTitle('Content without header', '---\ntitle: "From Frontmatter"\n---\n')).toBe(
        'From Frontmatter'
      );
      expect(extractTitle('## Second Level\n\nContent', '')).toBe('Second Level');
    });

    it('should merge frontmatter correctly', () => {
      const mergeFrontmatter = (
        strategy as { mergeFrontmatter: (sections: unknown[]) => string }
      ).mergeFrontmatter.bind(strategy);

      const sections = [
        {
          frontmatter: '---\ntitle: "First"\ntags: ["tag1", "tag2"]\n---\n',
          filePath: 'first.md',
          content: '',
          dependencies: [],
          order: 1,
        },
        {
          frontmatter: '---\ntitle: "Second"\ntags: ["tag2", "tag3"]\nauthor: "Test"\n---\n',
          filePath: 'second.md',
          content: '',
          dependencies: [],
          order: 2,
        },
      ];

      const result = mergeFrontmatter(sections);

      expect(result).toContain('title: "First & Second"');
      expect(result).toContain('tags: ["tag1", "tag2", "tag3"]');
      expect(result).toContain('author: "Test"');
    });

    it('should detect header conflicts', () => {
      const detectConflicts = (
        strategy as { detectConflicts: (sections: unknown[]) => unknown[] }
      ).detectConflicts.bind(strategy);

      const sections = [
        {
          filePath: 'file1.md',
          content: '# Same Header\n\nContent 1',
          dependencies: [],
          order: 1,
        },
        {
          filePath: 'file2.md',
          content: '# Same Header\n\nContent 2',
          dependencies: [],
          order: 2,
        },
      ];

      const conflicts = detectConflicts(sections);

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].type).toBe('duplicate-headers');
      expect(conflicts[0].files).toEqual(['file1.md', 'file2.md']);
    });
  });
});
