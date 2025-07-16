import { describe, expect, it } from 'vitest';
import { TocGenerator } from './toc-generator.js';

describe('TocGenerator', () => {
  const tocGenerator = new TocGenerator();

  describe('generateToc', () => {
    it('should generate table of contents from markdown headings', async () => {
      const content = `# Main Title
Some content here.

## Section 1
Content for section 1.

### Subsection 1.1
More content.

## Section 2
Content for section 2.

### Subsection 2.1
Content here.

#### Deep Subsection
Very deep content.
`;

      const result = await tocGenerator.generateToc(content);

      expect(result.headings).toHaveLength(6);
      expect(result.headings[0]).toEqual({
        level: 1,
        text: 'Main Title',
        slug: 'main-title',
        line: 1,
      });
      expect(result.headings[1]).toEqual({
        level: 2,
        text: 'Section 1',
        slug: 'section-1',
        line: 4,
      });

      expect(result.toc).toContain('- [Main Title](#main-title)');
      expect(result.toc).toContain('  - [Section 1](#section-1)');
      expect(result.toc).toContain('    - [Subsection 1.1](#subsection-1-1)');
      expect(result.toc).toContain('  - [Section 2](#section-2)');
      expect(result.toc).toContain('    - [Subsection 2.1](#subsection-2-1)');
      expect(result.toc).toContain('      - [Deep Subsection](#deep-subsection)');
    });

    it('should respect minDepth and maxDepth options', async () => {
      const content = `# Main Title
## Section 1
### Subsection 1.1
#### Deep Subsection
##### Very Deep
###### Extremely Deep
`;

      const result = await tocGenerator.generateToc(content, {
        minDepth: 2,
        maxDepth: 4,
      });

      expect(result.headings).toHaveLength(3);
      expect(result.headings[0].level).toBe(2);
      expect(result.headings[1].level).toBe(3);
      expect(result.headings[2].level).toBe(4);
      expect(result.toc).not.toContain('Main Title');
      expect(result.toc).not.toContain('Very Deep');
      expect(result.toc).not.toContain('Extremely Deep');
    });

    it('should include line numbers when requested', async () => {
      const content = `# Title
## Section 1
### Subsection
## Section 2
`;

      const result = await tocGenerator.generateToc(content, {
        includeLineNumbers: true,
      });

      expect(result.toc).toContain('- [Title](#title) (line 1)');
      expect(result.toc).toContain('  - [Section 1](#section-1) (line 2)');
      expect(result.toc).toContain('    - [Subsection](#subsection) (line 3)');
      expect(result.toc).toContain('  - [Section 2](#section-2) (line 4)');
    });

    it('should handle empty content gracefully', async () => {
      const content = '';
      const result = await tocGenerator.generateToc(content);

      expect(result.headings).toHaveLength(0);
      expect(result.toc).toBe('');
    });

    it('should handle content with no headings', async () => {
      const content = `This is just regular content.

Some more content here.

And even more content.
`;

      const result = await tocGenerator.generateToc(content);

      expect(result.headings).toHaveLength(0);
      expect(result.toc).toBe('');
    });

    it('should handle headings with special characters', async () => {
      const content = `# Title with "Quotes" and Special Characters!
## Section with $pecial Ch@rs & Symbols
### Another Section: With Colons
`;

      const result = await tocGenerator.generateToc(content);

      expect(result.headings).toHaveLength(3);
      expect(result.headings[0].slug).toBe('title-with-quotes-and-special-characters');
      expect(result.headings[1].slug).toBe('section-with-pecial-ch-rs-symbols');
      expect(result.headings[2].slug).toBe('another-section-with-colons');
    });

    it('should use custom slugify function when provided', async () => {
      const content = `# Test Title
## Another Section
`;

      const customSlugify = (text: string) => `custom-${text.toLowerCase().replace(/\s+/g, '-')}`;

      const result = await tocGenerator.generateToc(content, {
        slugify: customSlugify,
      });

      expect(result.headings[0].slug).toBe('custom-test-title');
      expect(result.headings[1].slug).toBe('custom-another-section');
      expect(result.toc).toContain('[Test Title](#custom-test-title)');
      expect(result.toc).toContain('[Another Section](#custom-another-section)');
    });

    it('should handle headings with inline code and links', async () => {
      const content = `# Title with \`code\` and [link](url)
## Section with **bold** and *italic*
`;

      const result = await tocGenerator.generateToc(content);

      expect(result.headings).toHaveLength(2);
      expect(result.headings[0].text).toBe('Title with  and link');
      expect(result.headings[1].text).toBe('Section with bold and italic');
    });

    it('should maintain proper indentation for nested headings', async () => {
      const content = `# Level 1
## Level 2
### Level 3
#### Level 4
##### Level 5
###### Level 6
`;

      const result = await tocGenerator.generateToc(content);

      const lines = result.toc.split('\n');
      expect(lines[0]).toBe('- [Level 1](#level-1)');
      expect(lines[1]).toBe('  - [Level 2](#level-2)');
      expect(lines[2]).toBe('    - [Level 3](#level-3)');
      expect(lines[3]).toBe('      - [Level 4](#level-4)');
      expect(lines[4]).toBe('        - [Level 5](#level-5)');
      expect(lines[5]).toBe('          - [Level 6](#level-6)');
    });
  });

  describe('extractHeadings', () => {
    it('should extract headings without generating TOC', async () => {
      const content = `# Title
## Section 1
### Subsection
## Section 2
`;

      const headings = await tocGenerator.extractHeadings(content);

      expect(headings).toHaveLength(4);
      expect(headings[0]).toEqual({
        level: 1,
        text: 'Title',
        slug: 'title',
        line: 1,
      });
      expect(headings[1]).toEqual({
        level: 2,
        text: 'Section 1',
        slug: 'section-1',
        line: 2,
      });
    });

    it('should respect depth options when extracting headings', async () => {
      const content = `# Title
## Section 1
### Subsection
#### Deep Section
`;

      const headings = await tocGenerator.extractHeadings(content, {
        minDepth: 2,
        maxDepth: 3,
      });

      expect(headings).toHaveLength(2);
      expect(headings[0].level).toBe(2);
      expect(headings[1].level).toBe(3);
    });
  });

  describe('default slugify function', () => {
    it('should handle various text patterns correctly', async () => {
      const testCases = [
        { input: 'Simple Title', expected: 'simple-title' },
        { input: 'Title with UPPERCASE', expected: 'title-with-uppercase' },
        { input: 'Title with    multiple    spaces', expected: 'title-with-multiple-spaces' },
        { input: 'Title with "quotes" and punctuation!', expected: 'title-with-quotes-and-punctuation' },
        { input: 'Title with números and émojis', expected: 'title-with-n-meros-and-mojis' },
        { input: '---Leading and trailing hyphens---', expected: 'leading-and-trailing-hyphens' },
        { input: 'Title--with--double--hyphens', expected: 'title-with-double-hyphens' },
        { input: 'Title with $pecial ch@rs & symbols', expected: 'title-with-pecial-ch-rs-symbols' },
      ];

      for (const { input, expected } of testCases) {
        const content = `# ${input}`;
        const result = await tocGenerator.generateToc(content);
        expect(result.headings[0].slug).toBe(expected);
      }
    });
  });
});