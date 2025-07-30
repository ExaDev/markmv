/**
 * Tests for the WebClipper core class.
 *
 * @fileoverview Tests for web page content extraction and processing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebClipper } from './web-clipper.js';

// Mock external dependencies
vi.mock('jsdom', () => ({
  JSDOM: vi.fn().mockImplementation((_html: string, _options: { url: string }) => ({
    window: {
      document: {
        title: 'Test Article',
        body: {
          textContent: 'Test content',
        },
      },
    },
  })),
}));

vi.mock('@mozilla/readability', () => ({
  Readability: vi.fn().mockImplementation((_document: Document) => ({
    parse: vi.fn().mockReturnValue({
      title: 'Test Article',
      byline: 'Test Author',
      excerpt: 'Test excerpt',
      content: '<h1>Test Article</h1><p>This is test content.</p>',
    }),
  })),
}));

vi.mock('turndown', () => {
  const TurndownService = vi.fn().mockImplementation(() => ({
    turndown: vi.fn().mockReturnValue('# Test Article\n\nThis is test content.'),
    addRule: vi.fn(),
  }));
  return { default: TurndownService };
});

vi.mock('node-html-parser', () => ({
  parse: vi.fn().mockImplementation((html: string) => {
    const baseElement = {
      innerHTML: '<h1>Test Article</h1><p>This is test content.</p>',
      querySelectorAll: vi.fn().mockImplementation((selector: string) => {
        if (selector === 'img') {
          return [
            { getAttribute: vi.fn().mockImplementation((attr: string) => {
              if (attr === 'src') return '/image1.jpg';
              if (attr === 'alt') return 'Image 1';
              return null;
            })},
            { getAttribute: vi.fn().mockImplementation((attr: string) => {
              if (attr === 'src') return 'https://external.com/image2.png';
              if (attr === 'alt') return 'Image 2';
              return null;
            })},
            { getAttribute: vi.fn().mockImplementation((attr: string) => {
              if (attr === 'src') return 'relative-image.gif';
              if (attr === 'alt') return null;
              return null;
            })},
          ];
        }
        if (selector === 'a[href]') {
          return [
            { 
              getAttribute: vi.fn().mockImplementation((attr: string) => {
                if (attr === 'href') return '/internal-page';
                return null;
              }),
              text: 'this internal link',
            },
            { 
              getAttribute: vi.fn().mockImplementation((attr: string) => {
                if (attr === 'href') return 'https://external.com';
                return null;
              }),
              text: 'this external link',
            },
          ];
        }
        return [];
      }),
    };

    return {
      querySelector: vi.fn().mockImplementation((selector: string) => {
        if (selector === 'body') {
          return {
            ...baseElement,
            innerHTML: '<h1>Test Article</h1><p>This is test content.</p>',
          };
        }
        if (selector === '.article-content') {
          return {
            ...baseElement,
            innerHTML: '<h1>Manual Extraction</h1><p>This content was extracted manually.</p>',
          };
        }
        if (selector === 'h1') {
          return {
            text: 'Test Title',
            getAttribute: vi.fn().mockReturnValue(null),
          };
        }
        if (selector === 'article') {
          return baseElement;
        }
        if (selector === '[role="main"]') {
          return baseElement;
        }
        if (selector === '[itemscope]') {
          if (html.includes('itemscope')) return baseElement;
          return null;
        }
        if (selector === 'script[type="application/ld+json"]') {
          if (html.includes('application/ld+json')) {
            return {
              innerHTML: '{"@context": "http://schema.org", "@type": "Article", "headline": "Test"}',
            };
          }
          return null;
        }
        return null;
      }),
      querySelectorAll: vi.fn().mockImplementation((selector: string) => {
        if (selector === 'img') {
          return [
            { getAttribute: vi.fn().mockImplementation((attr: string) => {
              if (attr === 'src') return '/image1.jpg';
              if (attr === 'alt') return 'Image 1';
              return null;
            })},
            { getAttribute: vi.fn().mockImplementation((attr: string) => {
              if (attr === 'src') return 'https://external.com/image2.png';
              if (attr === 'alt') return 'Image 2';
              return null;
            })},
            { getAttribute: vi.fn().mockImplementation((attr: string) => {
              if (attr === 'src') return 'relative-image.gif';
              if (attr === 'alt') return null;
              return null;
            })},
          ];
        }
        if (selector === 'a[href]') {
          return [
            { 
              getAttribute: vi.fn().mockImplementation((attr: string) => {
                if (attr === 'href') return '/internal-page';
                return null;
              }),
              text: 'this internal link',
            },
            { 
              getAttribute: vi.fn().mockImplementation((attr: string) => {
                if (attr === 'href') return 'https://external.com';
                return null;
              }),
              text: 'this external link',
            },
          ];
        }
        return [];
      }),
    };
  }),
}));

// Mock fetch
global.fetch = vi.fn();

describe('WebClipper', () => {
  let clipper: WebClipper;

  beforeEach(() => {
    vi.clearAllMocks();
    clipper = new WebClipper({
      strategy: 'readability',
      verbose: false,
    });
  });

  describe('Initialization', () => {
    it('should initialize with default options', () => {
      const defaultClipper = new WebClipper();
      expect(defaultClipper).toBeDefined();
    });

    it('should initialize with custom options', () => {
      const customClipper = new WebClipper({
        strategy: 'manual',
        imageStrategy: 'download',
        selectors: ['article', '.content'],
        timeout: 60000,
        verbose: true,
      });
      expect(customClipper).toBeDefined();
    });
  });

  describe('URL fetching', () => {
    it('should fetch HTML content successfully', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html><body><h1>Test</h1></body></html>'),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await clipper.clip('https://example.com/article');

      expect(fetch).toHaveBeenCalledWith('https://example.com/article', expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('markmv-clipper'),
          'Accept': expect.stringContaining('text/html'),
        }),
      }));
      expect(result.sourceUrl).toBe('https://example.com/article');
    });

    it('should handle HTTP errors', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await expect(clipper.clip('https://example.com/nonexistent')).rejects.toThrow('HTTP 404: Not Found');
    });

    it('should handle network errors', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      await expect(clipper.clip('https://example.com/unreachable')).rejects.toThrow('Network error');
    });

    it('should respect timeout', async () => {
      const timeoutClipper = new WebClipper({ timeout: 100 });
      
      // Mock a slow response
      vi.mocked(fetch).mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 200))
      );

      await expect(timeoutClipper.clip('https://slow.example.com')).rejects.toThrow();
    });

    it('should use custom headers when provided', async () => {
      const headerClipper = new WebClipper({
        headers: {
          'Authorization': 'Bearer token123',
          'Custom-Header': 'custom-value',
        },
        userAgent: 'Custom Bot 1.0',
      });

      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html><body><h1>Test</h1></body></html>'),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await headerClipper.clip('https://example.com/protected');

      expect(fetch).toHaveBeenCalledWith('https://example.com/protected', expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer token123',
          'Custom-Header': 'custom-value',
          'User-Agent': 'Custom Bot 1.0',
        }),
      }));
    });
  });

  describe('Strategy determination', () => {
    it('should auto-detect readability strategy for articles', async () => {
      const autoClipper = new WebClipper({ strategy: 'auto' });
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(`
          <html>
            <body>
              <article>
                <h1>Blog Post Title</h1>
                <p>This is a blog post.</p>
              </article>
            </body>
          </html>
        `),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await autoClipper.clip('https://blog.example.com/post');
      expect(result.strategy).toBe('readability');
    });

    it('should auto-detect manual strategy for documentation', async () => {
      const autoClipper = new WebClipper({ strategy: 'auto' });
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(`
          <html>
            <body>
              <div class="content">
                <h1>API Documentation</h1>
                <p>API docs content.</p>
              </div>
            </body>
          </html>
        `),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await autoClipper.clip('https://example.com/docs/api');
      expect(result.strategy).toBe('manual');
    });

    it('should auto-detect structured strategy for schema.org content', async () => {
      const autoClipper = new WebClipper({ strategy: 'auto' });
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(`
          <html>
            <body>
              <div itemscope itemtype="http://schema.org/Article">
                <h1 itemprop="headline">Structured Article</h1>
                <p itemprop="articleBody">Article content.</p>
              </div>
            </body>
          </html>
        `),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await autoClipper.clip('https://example.com/structured');
      expect(result.strategy).toBe('structured');
    });
  });

  describe('Content extraction strategies', () => {
    it('should extract content using readability strategy', async () => {
      const readabilityClipper = new WebClipper({ 
        strategy: 'readability',
        includeFrontmatter: false,
      });
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html><body><article><h1>Test</h1><p>Content</p></article></body></html>'),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await readabilityClipper.clip('https://example.com/article');

      expect(result.strategy).toBe('readability');
      expect(result.title).toBe('Test Article');
      expect(result.author).toBe('Test Author');
      expect(result.description).toBe('Test excerpt');
      expect(result.markdown).toBe('# Test Article\n\nThis is test content.');
    });

    it('should extract content using manual strategy with custom selectors', async () => {
      const manualClipper = new WebClipper({
        strategy: 'manual',
        selectors: ['.article-content', 'main'],
        includeFrontmatter: false,
      });
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(`
          <html>
            <body>
              <div class="article-content">
                <h1>Manual Extraction</h1>
                <p>This content was extracted manually.</p>
              </div>
            </body>
          </html>
        `),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await manualClipper.clip('https://example.com/manual');

      expect(result.strategy).toBe('manual');
      expect(result.markdown).toBe('# Test Article\n\nThis is test content.');
    });

    it('should extract content using full page strategy', async () => {
      const fullClipper = new WebClipper({ 
        strategy: 'full',
        includeFrontmatter: false,
      });
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(`
          <html>
            <body>
              <header>Header content</header>
              <main>Main content</main>
              <footer>Footer content</footer>
            </body>
          </html>
        `),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await fullClipper.clip('https://example.com/full');

      expect(result.strategy).toBe('full');
      expect(result.markdown).toBe('# Test Article\n\nThis is test content.');
    });

    it('should extract content using structured strategy', async () => {
      const structuredClipper = new WebClipper({ 
        strategy: 'structured',
        includeFrontmatter: false,
      });
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(`
          <html>
            <body>
              <script type="application/ld+json">
                {
                  "@context": "http://schema.org",
                  "@type": "Article",
                  "headline": "Structured Article",
                  "author": "John Doe"
                }
              </script>
              <article>
                <h1>Structured Content</h1>
                <p>Content with structured data.</p>
              </article>
            </body>
          </html>
        `),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await structuredClipper.clip('https://example.com/structured');

      expect(result.strategy).toBe('structured');
      expect(result.structuredData).toBeDefined();
      expect(result.structuredData?.['@type']).toBe('Article');
      expect(result.markdown).toBe('# Test Article\n\nThis is test content.');
    });
  });

  describe('Metadata extraction', () => {
    it('should extract title from various sources', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(`
          <html>
            <head>
              <title>Page Title</title>
              <meta property="og:title" content="OG Title" />
            </head>
            <body>
              <h1>Main Heading</h1>
              <p>Content</p>
            </body>
          </html>
        `),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await clipper.clip('https://example.com/metadata');
      expect(result.title).toBe('Test Article');
    });

    it('should extract published date from various sources', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(`
          <html>
            <head>
              <meta property="article:published_time" content="2024-01-01T12:00:00Z" />
            </head>
            <body>
              <article>
                <h1>Article with Date</h1>
                <p>Content</p>
              </article>
            </body>
          </html>
        `),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await clipper.clip('https://example.com/dated-article');
      expect(result.publishedDate).toBe('2024-01-01T12:00:00Z');
    });

    it('should extract author information', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(`
          <html>
            <body>
              <article>
                <h1>Article Title</h1>
                <div class="author">Jane Doe</div>
                <p>Article content</p>
              </article>
            </body>
          </html>
        `),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await clipper.clip('https://example.com/authored-article');
      expect(result.author).toBe('Test Author');
    });
  });

  describe('Link and image processing', () => {
    it('should extract and classify links', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(`
          <html>
            <body>
              <article>
                <h1>Article with Links</h1>
                <p>Check out <a href="/internal-page">this internal link</a> and 
                   <a href="https://external.com">this external link</a>.</p>
              </article>
            </body>
          </html>
        `),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await clipper.clip('https://example.com/article-with-links');

      expect(result.links).toBeDefined();
      expect(result.links.length).toBeGreaterThan(0);
      expect(result.links.some(link => link.type === 'internal')).toBe(true);
      expect(result.links.some(link => link.type === 'external')).toBe(true);
    });

    it('should extract images with metadata', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(`
          <html>
            <body>
              <article>
                <h1>Article with Images</h1>
                <img src="/image1.jpg" alt="Image 1" />
                <img src="https://external.com/image2.png" alt="Image 2" />
                <img src="relative-image.gif" />
              </article>
            </body>
          </html>
        `),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await clipper.clip('https://example.com/article-with-images');

      expect(result.images).toBeDefined();
      expect(result.images.length).toBe(3);
      expect(result.images[0].originalUrl).toBe('https://example.com/image1.jpg');
      expect(result.images[0].alt).toBe('Image 1');
      expect(result.images[1].originalUrl).toBe('https://external.com/image2.png');
      expect(result.images[2].originalUrl).toBe('https://example.com/relative-image.gif');
    });

    it('should handle different image strategies', async () => {
      const skipImagesClipper = new WebClipper({ imageStrategy: 'skip' });
      const linkOnlyClipper = new WebClipper({ imageStrategy: 'link-only' });
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html><body><article><img src="test.jpg" /></article></body></html>'),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const skipResult = await skipImagesClipper.clip('https://example.com/images');
      const linkResult = await linkOnlyClipper.clip('https://example.com/images');

      expect(skipResult.images).toBeDefined();
      expect(linkResult.images).toBeDefined();
    });
  });

  describe('Frontmatter generation', () => {
    it('should generate frontmatter when enabled', async () => {
      const frontmatterClipper = new WebClipper({ 
        includeFrontmatter: true,
        strategy: 'readability',
      });
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html><body><article><h1>Test</h1></article></body></html>'),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await frontmatterClipper.clip('https://example.com/frontmatter-test');

      expect(result.markdown).toContain('---');
      expect(result.markdown).toContain('title:');
      expect(result.markdown).toContain('source:');
      expect(result.markdown).toContain('clipped:');
    });

    it('should skip frontmatter when disabled', async () => {
      const noFrontmatterClipper = new WebClipper({ 
        includeFrontmatter: false,
        strategy: 'readability',
      });
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html><body><article><h1>Test</h1></article></body></html>'),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await noFrontmatterClipper.clip('https://example.com/no-frontmatter');

      expect(result.markdown).not.toContain('---');
      expect(result.markdown).not.toContain('title:');
    });
  });

  describe('Error handling', () => {
    it('should handle Readability parsing failures', async () => {
      const failingClipper = new WebClipper({ strategy: 'readability' });
      
      // Mock the existing Readability mock to return null for parse()
      const { Readability } = await import('@mozilla/readability');
      const mockInstance = {
        parse: vi.fn().mockReturnValue(null),
      };
      vi.mocked(Readability).mockImplementationOnce(() => mockInstance as any);

      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html><body><p>Unparseable content</p></body></html>'),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await expect(failingClipper.clip('https://example.com/unparseable')).rejects.toThrow('Could not extract article content using Readability');
    });

    it('should handle selector not found in manual strategy', async () => {
      const manualClipper = new WebClipper({
        strategy: 'manual',
        selectors: ['.nonexistent-selector'],
      });
      
      // Create a custom mock that returns null for the nonexistent selector
      const customParse = vi.fn().mockReturnValue({
        querySelector: vi.fn().mockImplementation((selector: string) => {
          if (selector === '.nonexistent-selector') return null;
          if (selector === 'body') return null; // Also make body return null
          return null;
        }),
        querySelectorAll: vi.fn().mockReturnValue([]),
      });
      
      // Override the parse function temporarily
      const { parse } = await import('node-html-parser');
      vi.mocked(parse).mockImplementationOnce(customParse);
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html><body><p>No matching selectors</p></body></html>'),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await expect(manualClipper.clip('https://example.com/no-selectors')).rejects.toThrow('Could not find content with specified selectors');
    });

    it('should handle missing body element in full strategy', async () => {
      const fullClipper = new WebClipper({ strategy: 'full' });
      
      // Create a custom mock that returns null for body
      const customParse = vi.fn().mockReturnValue({
        querySelector: vi.fn().mockImplementation((selector: string) => {
          if (selector === 'body') return null;
          return null;
        }),
        querySelectorAll: vi.fn().mockReturnValue([]),
      });
      
      // Override the parse function temporarily
      const { parse } = await import('node-html-parser');
      vi.mocked(parse).mockImplementationOnce(customParse);
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html><head><title>No Body</title></head></html>'),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await expect(fullClipper.clip('https://example.com/no-body')).rejects.toThrow('Could not find body element');
    });

    it('should handle invalid JSON-LD structured data gracefully', async () => {
      const structuredClipper = new WebClipper({ strategy: 'structured' });
      
      // Create a custom mock that returns invalid JSON
      const customParse = vi.fn().mockReturnValue({
        querySelector: vi.fn().mockImplementation((selector: string) => {
          if (selector === 'script[type="application/ld+json"]') {
            return {
              innerHTML: '{ invalid json }', // This will cause JSON.parse to fail
            };
          }
          if (selector === 'article') {
            return {
              innerHTML: '<h1>Test</h1>',
              querySelectorAll: vi.fn().mockReturnValue([]),
            };
          }
          return null;
        }),
        querySelectorAll: vi.fn().mockReturnValue([]),
      });
      
      // Override the parse function temporarily
      const { parse } = await import('node-html-parser');
      vi.mocked(parse).mockImplementationOnce(customParse);
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(`
          <html>
            <body>
              <script type="application/ld+json">
                { invalid json }
              </script>
              <article><h1>Test</h1></article>
            </body>
          </html>
        `),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      // Should not throw, just ignore invalid JSON
      const result = await structuredClipper.clip('https://example.com/invalid-json');
      expect(result.strategy).toBe('structured');
      expect(result.structuredData).toBeUndefined();
    });
  });

  describe('Configuration options', () => {
    it('should respect redirect settings', async () => {
      const noRedirectClipper = new WebClipper({ followRedirects: false });
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html><body><h1>Test</h1></body></html>'),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await noRedirectClipper.clip('https://example.com/test');

      expect(fetch).toHaveBeenCalledWith('https://example.com/test', expect.objectContaining({
        redirect: 'manual',
      }));
    });

    it('should handle verbose logging', async () => {
      const verboseClipper = new WebClipper({ verbose: true });
      
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = vi.fn((message: string) => {
        logs.push(message);
      });

      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html><body><h1>Test</h1></body></html>'),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      try {
        await verboseClipper.clip('https://example.com/verbose');
        expect(logs.some(log => log.includes('Fetching:'))).toBe(true);
        expect(logs.some(log => log.includes('Using strategy:'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });
  });
});