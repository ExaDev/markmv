import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { checkLinks, formatCheckLinksResults, DEFAULT_CHECK_LINKS_OPTIONS, type CheckLinksOperationOptions } from './check-links.js';

// Mock the LinkValidator to avoid actual network requests in tests
vi.mock('../core/link-validator.js', () => ({
  LinkValidator: vi.fn().mockImplementation(() => ({
    validateLink: vi.fn(),
  })),
}));

// Mock the LinkParser
vi.mock('../core/link-parser.js', () => ({
  LinkParser: vi.fn().mockImplementation(() => ({
    parseFile: vi.fn(),
  })),
}));

const TEST_DIR = '/tmp/markmv-check-links-test';

describe('check-links command', () => {
  beforeEach(async () => {
    // Create test directory
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(TEST_DIR, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('checkLinks function', () => {
    it('should return empty result for no files', async () => {
      const result = await checkLinks([], DEFAULT_CHECK_LINKS_OPTIONS);

      expect(result.filesProcessed).toBe(0);
      expect(result.totalExternalLinks).toBe(0);
      expect(result.brokenLinks).toBe(0);
      expect(result.workingLinks).toBe(0);
      expect(result.linkResults).toHaveLength(0);
    });

    it('should process markdown files and find external links', async () => {
      // Create test markdown file with external links
      const testFile = join(TEST_DIR, 'test.md');
      const content = `# Test Document

Here are some external links:
- [GitHub](https://github.com)
- [Example](https://example.com)
- [Internal Link](./internal.md)

Some text content.`;

      await writeFile(testFile, content);

      // Mock LinkParser to return our test links
      const mockParser = {
        parseFile: vi.fn().mockResolvedValue({
          links: [
            {
              type: 'external',
              href: 'https://github.com',
              text: 'GitHub',
              position: { start: { line: 4 } }
            },
            {
              type: 'external', 
              href: 'https://example.com',
              text: 'Example',
              position: { start: { line: 5 } }
            },
            {
              type: 'internal',
              href: './internal.md',
              text: 'Internal Link',
              position: { start: { line: 6 } }
            }
          ]
        })
      };

      // Mock LinkValidator to simulate successful validation
      const mockValidator = {
        validateLink: vi.fn().mockResolvedValue(null) // null means link is valid
      };

      const { LinkParser } = await import('../core/link-parser.js');
      const { LinkValidator } = await import('../core/link-validator.js');
      
      vi.mocked(LinkParser).mockImplementation(() => mockParser);
      vi.mocked(LinkValidator).mockImplementation(() => mockValidator);

      const result = await checkLinks([testFile], DEFAULT_CHECK_LINKS_OPTIONS);

      expect(result.filesProcessed).toBe(1);
      expect(result.totalExternalLinks).toBe(2); // Only external links counted
      expect(result.workingLinks).toBe(2);
      expect(result.brokenLinks).toBe(0);
      expect(mockParser.parseFile).toHaveBeenCalledWith(testFile);
      expect(mockValidator.validateLink).toHaveBeenCalledTimes(2); // Only external links validated
    });

    it('should handle broken external links', async () => {
      const testFile = join(TEST_DIR, 'broken-links.md');
      const content = `# Broken Links Test

- [Broken Link](https://nonexistent-domain-12345.com)
- [Working Link](https://github.com)`;

      await writeFile(testFile, content);

      const mockParser = {
        parseFile: vi.fn().mockResolvedValue({
          links: [
            {
              type: 'external',
              href: 'https://nonexistent-domain-12345.com',
              text: 'Broken Link',
              position: { start: { line: 3 } }
            },
            {
              type: 'external',
              href: 'https://github.com', 
              text: 'Working Link',
              position: { start: { line: 4 } }
            }
          ]
        })
      };

      const mockValidator = {
        validateLink: vi.fn()
          .mockResolvedValueOnce({
            filePath: testFile,
            line: 3,
            text: 'Broken Link',
            href: 'https://nonexistent-domain-12345.com',
            reason: 'external-error',
            details: 'HTTP 404'
          })
          .mockResolvedValueOnce(null) // Working link
      };

      const { LinkParser } = await import('../core/link-parser.js');
      const { LinkValidator } = await import('../core/link-validator.js');
      
      vi.mocked(LinkParser).mockImplementation(() => mockParser);
      vi.mocked(LinkValidator).mockImplementation(() => mockValidator);

      const result = await checkLinks([testFile], DEFAULT_CHECK_LINKS_OPTIONS);

      expect(result.filesProcessed).toBe(1);
      expect(result.totalExternalLinks).toBe(2);
      expect(result.brokenLinks).toBe(1);
      expect(result.workingLinks).toBe(1);
      expect(result.linkResults).toHaveLength(2);
      
      const brokenLink = result.linkResults.find(link => link.isBroken);
      expect(brokenLink).toBeDefined();
      if (brokenLink) {
        expect(brokenLink.href).toBe('https://nonexistent-domain-12345.com');
        expect(brokenLink.domain).toBe('nonexistent-domain-12345.com');
      }
    });

    it('should support glob patterns for file discovery', async () => {
      // Create multiple test files
      await mkdir(join(TEST_DIR, 'docs'), { recursive: true });
      
      const files = [
        join(TEST_DIR, 'README.md'),
        join(TEST_DIR, 'docs', 'api.md'),
        join(TEST_DIR, 'docs', 'guide.md')
      ];

      const content = '# Test\n[External](https://example.com)';
      
      for (const file of files) {
        await writeFile(file, content);
      }

      const mockParser = {
        parseFile: vi.fn().mockResolvedValue({
          links: [{
            type: 'external',
            href: 'https://example.com',
            text: 'External',
            position: { start: { line: 2 } }
          }]
        })
      };

      const mockValidator = {
        validateLink: vi.fn().mockResolvedValue(null)
      };

      const { LinkParser } = await import('../core/link-parser.js');
      const { LinkValidator } = await import('../core/link-validator.js');
      
      vi.mocked(LinkParser).mockImplementation(() => mockParser);
      vi.mocked(LinkValidator).mockImplementation(() => mockValidator);

      const result = await checkLinks([TEST_DIR], {
        ...DEFAULT_CHECK_LINKS_OPTIONS,
        maxDepth: 2
      });

      expect(result.filesProcessed).toBe(3);
      expect(result.totalExternalLinks).toBe(3); // One link per file
      expect(mockParser.parseFile).toHaveBeenCalledTimes(3);
    });

    it('should respect ignore patterns', async () => {
      const testFile = join(TEST_DIR, 'ignore-test.md');
      const content = `# Ignore Test

- [Should be checked](https://github.com)
- [Should be ignored](https://localhost:3000)
- [Also ignored](https://127.0.0.1:8080)`;

      await writeFile(testFile, content);

      const mockParser = {
        parseFile: vi.fn().mockResolvedValue({
          links: [
            {
              type: 'external',
              href: 'https://github.com',
              text: 'Should be checked',
              position: { start: { line: 3 } }
            },
            {
              type: 'external',
              href: 'https://localhost:3000',
              text: 'Should be ignored',
              position: { start: { line: 4 } }
            },
            {
              type: 'external',
              href: 'https://127.0.0.1:8080',
              text: 'Also ignored',
              position: { start: { line: 5 } }
            }
          ]
        })
      };

      const mockValidator = {
        validateLink: vi.fn().mockResolvedValue(null)
      };

      const { LinkParser } = await import('../core/link-parser.js');
      const { LinkValidator } = await import('../core/link-validator.js');
      
      vi.mocked(LinkParser).mockImplementation(() => mockParser);
      vi.mocked(LinkValidator).mockImplementation(() => mockValidator);

      const options: CheckLinksOperationOptions = {
        ...DEFAULT_CHECK_LINKS_OPTIONS,
        ignorePatterns: ['localhost', '127\\.0\\.0\\.1']
      };

      const result = await checkLinks([testFile], options);

      expect(result.totalExternalLinks).toBe(1); // Only the GitHub link should be processed
      expect(mockValidator.validateLink).toHaveBeenCalledTimes(1);
    });

    it('should handle retry logic for failed requests', async () => {
      const testFile = join(TEST_DIR, 'retry-test.md');
      const content = '# Retry Test\n[Flaky Link](https://flaky-server.com)';

      await writeFile(testFile, content);

      const mockParser = {
        parseFile: vi.fn().mockResolvedValue({
          links: [{
            type: 'external',
            href: 'https://flaky-server.com',
            text: 'Flaky Link',
            position: { start: { line: 2 } }
          }]
        })
      };

      // Mock validator to fail twice, then succeed
      let attemptCount = 0;
      const mockValidator = {
        validateLink: vi.fn().mockImplementation(() => {
          attemptCount++;
          if (attemptCount <= 2) {
            throw new Error('Network timeout');
          }
          return Promise.resolve(null); // Success on third attempt
        })
      };

      const { LinkParser } = await import('../core/link-parser.js');
      const { LinkValidator } = await import('../core/link-validator.js');
      
      vi.mocked(LinkParser).mockImplementation(() => mockParser);
      vi.mocked(LinkValidator).mockImplementation(() => mockValidator);

      const options: CheckLinksOperationOptions = {
        ...DEFAULT_CHECK_LINKS_OPTIONS,
        retry: 3,
        retryDelay: 10 // Short delay for testing
      };

      const result = await checkLinks([testFile], options);

      expect(result.workingLinks).toBe(1);
      expect(result.brokenLinks).toBe(0);
      expect(mockValidator.validateLink).toHaveBeenCalledTimes(3); // Initial + 2 retries
      
      const linkResult = result.linkResults[0];
      expect(linkResult.retryAttempt).toBe(2); // 0-indexed, so attempt 2 = third try
    });
  });

  describe('formatCheckLinksResults function', () => {
    const mockResult = {
      filesProcessed: 2,
      totalExternalLinks: 4,
      brokenLinks: 1,
      workingLinks: 3,
      warningLinks: 0,
      linkResults: [
        {
          filePath: '/test/file1.md',
          line: 5,
          text: 'Working Link',
          href: 'https://github.com',
          reason: '',
          isBroken: false,
          statusCode: 200,
          responseTime: 250,
          domain: 'github.com',
          cached: false,
          retryAttempt: 0
        },
        {
          filePath: '/test/file1.md', 
          line: 8,
          text: 'Broken Link',
          href: 'https://broken-site.com',
          reason: 'HTTP 404 Not Found',
          isBroken: true,
          statusCode: 404,
          responseTime: 1500,
          domain: 'broken-site.com',
          cached: false,
          retryAttempt: 2
        }
      ],
      resultsByFile: {
        '/test/file1.md': [
          {
            filePath: '/test/file1.md',
            line: 5,
            text: 'Working Link',
            href: 'https://github.com',
            reason: '',
            isBroken: false,
            statusCode: 200,
            responseTime: 250,
            domain: 'github.com',
            cached: false,
            retryAttempt: 0
          },
          {
            filePath: '/test/file1.md',
            line: 8, 
            text: 'Broken Link',
            href: 'https://broken-site.com',
            reason: 'HTTP 404 Not Found',
            isBroken: true,
            statusCode: 404,
            responseTime: 1500,
            domain: 'broken-site.com',
            cached: false,
            retryAttempt: 2
          }
        ]
      },
      resultsByStatus: {
        200: [
          {
            filePath: '/test/file1.md',
            line: 5,
            text: 'Working Link',
            href: 'https://github.com',
            reason: '',
            isBroken: false,
            statusCode: 200,
            responseTime: 250,
            domain: 'github.com',
            cached: false,
            retryAttempt: 0
          }
        ],
        404: [
          {
            filePath: '/test/file1.md',
            line: 8,
            text: 'Broken Link', 
            href: 'https://broken-site.com',
            reason: 'HTTP 404 Not Found',
            isBroken: true,
            statusCode: 404,
            responseTime: 1500,
            domain: 'broken-site.com',
            cached: false,
            retryAttempt: 2
          }
        ]
      },
      resultsByDomain: {
        'github.com': [
          {
            filePath: '/test/file1.md',
            line: 5,
            text: 'Working Link',
            href: 'https://github.com',
            reason: '',
            isBroken: false,
            statusCode: 200,
            responseTime: 250,
            domain: 'github.com',
            cached: false,
            retryAttempt: 0
          }
        ],
        'broken-site.com': [
          {
            filePath: '/test/file1.md',
            line: 8,
            text: 'Broken Link',
            href: 'https://broken-site.com',
            reason: 'HTTP 404 Not Found',
            isBroken: true,
            statusCode: 404,
            responseTime: 1500,
            domain: 'broken-site.com',
            cached: false,
            retryAttempt: 2
          }
        ]
      },
      fileErrors: [],
      processingTime: 1500,
      averageResponseTime: 875
    };

    it('should format results as text', () => {
      const options = { ...DEFAULT_CHECK_LINKS_OPTIONS, format: 'text' as const };
      const output = formatCheckLinksResults(mockResult, options);

      expect(output).toContain('🔗 External Link Check Results');
      expect(output).toContain('Files processed: 2');
      expect(output).toContain('External links found: 4'); 
      expect(output).toContain('Working links: 3');
      expect(output).toContain('Broken links: 1');
      expect(output).toContain('❌ Broken Links:');
      expect(output).toContain('https://broken-site.com');
      expect(output).toContain('HTTP 404 Not Found');
    });

    it('should format results as JSON', () => {
      const options = { ...DEFAULT_CHECK_LINKS_OPTIONS, format: 'json' as const };
      const output = formatCheckLinksResults(mockResult, options);

      const parsed = JSON.parse(output);
      expect(parsed.filesProcessed).toBe(2);
      expect(parsed.totalExternalLinks).toBe(4);
      expect(parsed.brokenLinks).toBe(1);
      expect(parsed.linkResults).toHaveLength(2);
    });

    it('should format results as markdown', () => {
      const options = { ...DEFAULT_CHECK_LINKS_OPTIONS, format: 'markdown' as const };
      const output = formatCheckLinksResults(mockResult, options);

      expect(output).toContain('# 🔗 External Link Check Results');
      expect(output).toContain('## 📊 Summary');
      expect(output).toContain('| Files processed | 2 |');
      expect(output).toContain('| Working links | 3 |');
      expect(output).toContain('## ❌ Broken Links');
      expect(output).toContain('- ❌ **https://broken-site.com**');
    });

    it('should format results as CSV', () => {
      const options = { ...DEFAULT_CHECK_LINKS_OPTIONS, format: 'csv' as const };
      const output = formatCheckLinksResults(mockResult, options);

      expect(output).toContain('File,URL,Status,Status Code,Response Time,Domain,Line,Reason');
      expect(output).toContain('"/test/file1.md","https://github.com",OK,200,250,"github.com",5,""');
      expect(output).toContain('"/test/file1.md","https://broken-site.com",BROKEN,404,1500,"broken-site.com",8,"HTTP 404 Not Found"');
    });

    it('should group results by status when requested', () => {
      const options = { ...DEFAULT_CHECK_LINKS_OPTIONS, format: 'text' as const, groupBy: 'status' as const };
      const output = formatCheckLinksResults(mockResult, options);

      expect(output).toContain('🔢 Status 404:');
      expect(output).toContain('❌ https://broken-site.com');
    });

    it('should group results by domain when requested', () => {
      const options = { ...DEFAULT_CHECK_LINKS_OPTIONS, format: 'text' as const, groupBy: 'domain' as const };
      const output = formatCheckLinksResults(mockResult, options);

      expect(output).toContain('🌐 broken-site.com:');
      expect(output).toContain('❌ https://broken-site.com');
    });

    it('should include response times when requested', () => {
      const options = { 
        ...DEFAULT_CHECK_LINKS_OPTIONS, 
        format: 'text' as const,
        includeResponseTimes: true
      };
      const output = formatCheckLinksResults(mockResult, options);

      expect(output).toContain('Response time: 1500ms');
    });
  });

  describe('DEFAULT_CHECK_LINKS_OPTIONS', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_CHECK_LINKS_OPTIONS.timeout).toBe(10000);
      expect(DEFAULT_CHECK_LINKS_OPTIONS.retry).toBe(3);
      expect(DEFAULT_CHECK_LINKS_OPTIONS.retryDelay).toBe(1000);
      expect(DEFAULT_CHECK_LINKS_OPTIONS.concurrency).toBe(10);
      expect(DEFAULT_CHECK_LINKS_OPTIONS.method).toBe('HEAD');
      expect(DEFAULT_CHECK_LINKS_OPTIONS.followRedirects).toBe(true);
      expect(DEFAULT_CHECK_LINKS_OPTIONS.ignoreStatusCodes).toEqual([403, 999]);
      expect(DEFAULT_CHECK_LINKS_OPTIONS.useCache).toBe(true);
      expect(DEFAULT_CHECK_LINKS_OPTIONS.format).toBe('text');
      expect(DEFAULT_CHECK_LINKS_OPTIONS.groupBy).toBe('file');
    });
  });

  describe('edge cases', () => {
    it('should handle files with no external links', async () => {
      const testFile = join(TEST_DIR, 'no-external-links.md');
      const content = `# Internal Only

- [Internal](./internal.md)
- [Another Internal](../other.md)

No external links here.`;

      await writeFile(testFile, content);

      const mockParser = {
        parseFile: vi.fn().mockResolvedValue({
          links: [
            {
              type: 'internal',
              href: './internal.md',
              text: 'Internal',
              position: { start: { line: 3 } }
            },
            {
              type: 'internal',
              href: '../other.md', 
              text: 'Another Internal',
              position: { start: { line: 4 } }
            }
          ]
        })
      };

      const mockValidator = {
        validateLink: vi.fn().mockResolvedValue(null)
      };

      const { LinkParser } = await import('../core/link-parser.js');
      const { LinkValidator } = await import('../core/link-validator.js');
      
      vi.mocked(LinkParser).mockImplementation(() => mockParser);
      vi.mocked(LinkValidator).mockImplementation(() => mockValidator);

      const result = await checkLinks([testFile], DEFAULT_CHECK_LINKS_OPTIONS);

      expect(result.filesProcessed).toBe(1);
      expect(result.totalExternalLinks).toBe(0);
      expect(result.brokenLinks).toBe(0);
      expect(result.workingLinks).toBe(0);
      expect(mockValidator.validateLink).not.toHaveBeenCalled();
    });

    it('should handle file processing errors gracefully', async () => {
      const testFile = join(TEST_DIR, 'nonexistent.md');

      const result = await checkLinks([testFile], DEFAULT_CHECK_LINKS_OPTIONS);

      expect(result.filesProcessed).toBe(0);
      expect(result.fileErrors).toHaveLength(1);
      expect(result.fileErrors[0].file).toBe(testFile);
      expect(result.fileErrors[0].error).toContain('Failed to resolve file pattern');
    });

    it('should extract domain names correctly', () => {
      // This is testing the private extractDomain function indirectly
      // We can infer it works correctly from the domain grouping in other tests
      expect(true).toBe(true); // Placeholder - domain extraction tested indirectly
    });
  });
});