import { describe, it, expect } from 'vitest';
import { 
  HeaderBasedSplitStrategy, 
  SizeBasedSplitStrategy, 
  ManualSplitStrategy 
} from './split-strategies.js';

describe('Split Strategies', () => {
  describe('HeaderBasedSplitStrategy', () => {
    it('should split content by headers', async () => {
      const strategy = new HeaderBasedSplitStrategy({ headerLevel: 2 });
      const content = `# Main Title

Some intro content.

## Section 1

Content for section 1.

## Section 2

Content for section 2.

### Subsection 2.1

Nested content.

## Section 3

Final section content.`;

      const result = await strategy.split(content, 'test.md');

      expect(result.sections).toHaveLength(3);
      expect(result.sections[0].title).toBe('Section 1');
      expect(result.sections[1].title).toBe('Section 2');
      expect(result.sections[2].title).toBe('Section 3');
      expect(result.sections[1].content).toContain('### Subsection 2.1');
      expect(result.errors).toHaveLength(0);
    });

    it('should handle frontmatter preservation', async () => {
      const strategy = new HeaderBasedSplitStrategy({ 
        headerLevel: 2,
        preserveFrontmatter: true 
      });
      const content = `---
title: Test Document
author: Test Author
---

# Main Title

## Section 1

Content here.`;

      const result = await strategy.split(content, 'test.md');

      expect(result.remainingContent).toContain('title: Test Document');
      expect(result.sections[0].content).not.toContain('title: Test Document');
    });

    it('should generate safe filenames', async () => {
      const strategy = new HeaderBasedSplitStrategy();
      const content = `## Section with Special Characters!@#$%

Content.

## Another Section with Spaces

More content.`;

      const result = await strategy.split(content, 'test.md');

      expect(result.sections[0].filename).toBe('section-with-special-characters.md');
      expect(result.sections[1].filename).toBe('another-section-with-spaces.md');
    });

    it('should handle empty headers gracefully', async () => {
      const strategy = new HeaderBasedSplitStrategy();
      const content = `##

Content under empty header.

## Valid Section

Valid content.`;

      const result = await strategy.split(content, 'test.md');

      expect(result.warnings).toContain('Empty header found at line 1');
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].title).toBe('Section 1'); // Default title
    });
  });

  describe('SizeBasedSplitStrategy', () => {
    it('should split content by size', async () => {
      const strategy = new SizeBasedSplitStrategy({ maxSize: 1 }); // 1KB
      const content = 'A'.repeat(2048) + '\n\n## Middle Header\n\n' + 'B'.repeat(2048);

      const result = await strategy.split(content, 'test.md');

      expect(result.sections.length).toBeGreaterThan(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should use nearby headers for section titles', async () => {
      const strategy = new SizeBasedSplitStrategy({ maxSize: 1 });
      const content = `## First Section

${'Content line.\n'.repeat(100)}

## Second Section

${'More content.\n'.repeat(100)}`;

      const result = await strategy.split(content, 'test.md');

      expect(result.sections[0].title).toBe('First Section');
      // Depending on split point, might be 'First Section' or 'Second Section'
      expect(result.sections[0].title).toMatch(/First Section|Second Section/);
    });

    it('should handle content without headers', async () => {
      const strategy = new SizeBasedSplitStrategy({ maxSize: 1 });
      const content = 'Just plain content without any headers.\n'.repeat(100);

      const result = await strategy.split(content, 'test.md');

      expect(result.sections.length).toBeGreaterThan(0);
      expect(result.sections[0].title).toMatch(/Part \d+/);
    });
  });

  describe('ManualSplitStrategy', () => {
    it('should split at manual markers', async () => {
      const strategy = new ManualSplitStrategy();
      const content = `# Document

First section content.

<!-- split -->

## Second Section

Second section content.

---split---

## Third Section

Third section content.`;

      const result = await strategy.split(content, 'test.md');

      expect(result.sections).toHaveLength(3);
      expect(result.sections[0].content).toContain('First section content');
      expect(result.sections[1].title).toBe('Second Section');
      expect(result.sections[2].title).toBe('Third Section');
    });

    it('should handle custom split markers', async () => {
      const strategy = new ManualSplitStrategy({ 
        splitMarkers: ['<!-- break -->', '===SPLIT==='] 
      });
      const content = `Content 1

<!-- break -->

Content 2

===SPLIT===

Content 3`;

      const result = await strategy.split(content, 'test.md');

      expect(result.sections).toHaveLength(3);
    });

    it('should warn when no markers found', async () => {
      const strategy = new ManualSplitStrategy();
      const content = `Just regular content without any split markers.`;

      const result = await strategy.split(content, 'test.md');

      expect(result.sections).toHaveLength(0);
      expect(result.warnings).toContain('No split markers found. Use <!-- split --> or ---split--- to mark split points.');
      expect(result.remainingContent).toBe(content);
    });

    it('should extract titles from sections', async () => {
      const strategy = new ManualSplitStrategy();
      const content = `## First Title

Content here.

<!-- split -->

## Second Title

More content.

<!-- split -->

Regular text without header as title.`;

      const result = await strategy.split(content, 'test.md');

      expect(result.sections[0].title).toBe('First Title');
      expect(result.sections[1].title).toBe('Second Title');
      expect(result.sections[2].title).toBe('Regular text without header as title.');
    });
  });

  describe('BaseSplitStrategy utilities', () => {
    const strategy = new HeaderBasedSplitStrategy();

    it('should sanitize filenames correctly', () => {
      // Access protected method for testing
      const sanitize = (strategy as any).sanitizeFilename.bind(strategy);
      
      expect(sanitize('Hello World!')).toBe('hello-world');
      expect(sanitize('Special@#$%Characters')).toBe('specialcharacters');
      expect(sanitize('Multiple   Spaces')).toBe('multiple-spaces');
      expect(sanitize('--Leading-And-Trailing--')).toBe('leading-and-trailing');
    });

    it('should extract header levels correctly', () => {
      const getLevel = (strategy as any).getHeaderLevel.bind(strategy);
      
      expect(getLevel('# Header 1')).toBe(1);
      expect(getLevel('## Header 2')).toBe(2);
      expect(getLevel('### Header 3')).toBe(3);
      expect(getLevel('#### Header 4')).toBe(4);
      expect(getLevel('##### Header 5')).toBe(5);
      expect(getLevel('###### Header 6')).toBe(6);
      expect(getLevel('Regular text')).toBe(0);
      expect(getLevel('#No space after hash')).toBe(0);
    });

    it('should extract titles from headers', () => {
      const extractTitle = (strategy as any).extractTitleFromHeader.bind(strategy);
      
      expect(extractTitle('# Main Title')).toBe('Main Title');
      expect(extractTitle('## Section Title')).toBe('Section Title');
      expect(extractTitle('### Title with Extra   Spaces   ')).toBe('Title with Extra   Spaces');
      expect(extractTitle('#### ')).toBe('');
    });
  });
});