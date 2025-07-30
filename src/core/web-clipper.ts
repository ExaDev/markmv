/**
 * Core web clipper for converting web pages to markdown.
 *
 * @fileoverview Implements multiple extraction strategies for different types of web content
 * @category Core
 */

import { parse, HTMLElement } from 'node-html-parser';
import TurndownService from 'turndown';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

/**
 * Extraction strategies for different types of content.
 *
 * @category Core
 */
export type ExtractionStrategy = 
  | 'auto'        // Automatically choose best strategy
  | 'readability' // Mozilla Readability algorithm
  | 'manual'      // Custom selectors
  | 'full'        // Full page content
  | 'structured'  // Schema.org and semantic extraction
  | 'headless';   // Browser automation (future)

/**
 * Image handling strategies.
 *
 * @category Core
 */
export type ImageStrategy = 
  | 'skip'        // Don't process images
  | 'link-only'   // Keep as external links
  | 'download'    // Download and save locally
  | 'base64';     // Embed as base64 (small images only)

/**
 * Options for web clipping operations.
 *
 * @category Core
 */
export interface WebClipperOptions {
  /** Extraction strategy to use */
  strategy?: ExtractionStrategy;
  /** How to handle images */
  imageStrategy?: ImageStrategy;
  /** Directory to save downloaded images */
  imageDir?: string;
  /** Custom CSS selectors for manual extraction */
  selectors?: string[];
  /** Include metadata in frontmatter */
  includeFrontmatter?: boolean;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Custom User-Agent string */
  userAgent?: string;
  /** Custom HTTP headers */
  headers?: Record<string, string>;
  /** Path to cookies file */
  cookiesFile?: string;
  /** Follow redirects */
  followRedirects?: boolean;
  /** Maximum redirects to follow */
  maxRedirects?: number;
  /** Show detailed output */
  verbose?: boolean;
  /** Show what would be done without doing it */
  dryRun?: boolean;
}

/**
 * Content extracted from a web page.
 *
 * @category Core
 */
interface ExtractedContent {
  /** Extracted title */
  title?: string;
  /** Extracted author */
  author?: string;
  /** Published date */
  publishedDate?: string;
  /** Description/excerpt */
  description?: string;
  /** HTML content */
  content: string;
  /** Images found in content */
  images: Array<{
    originalUrl: string;
    alt: string | undefined;
    processed: boolean;
  }>;
  /** Links found in content */
  links: Array<{
    url: string;
    text: string;
    type: 'internal' | 'external';
  }>;
  /** Structured data found */
  structuredData?: Record<string, unknown>;
}

/**
 * Result of a web clipping operation.
 *
 * @category Core
 */
export interface ClipResult {
  /** Generated markdown content */
  markdown: string;
  /** Extracted title */
  title?: string;
  /** Extracted author */
  author?: string;
  /** Published date */
  publishedDate?: string;
  /** Description/excerpt */
  description?: string;
  /** Source URL */
  sourceUrl: string;
  /** Extraction strategy used */
  strategy: ExtractionStrategy;
  /** Images found and processed */
  images: Array<{
    originalUrl: string;
    localPath?: string;
    alt: string | undefined;
    processed: boolean;
  }>;
  /** Links found in content */
  links: Array<{
    url: string;
    text: string;
    type: 'internal' | 'external';
  }>;
  /** Structured data found */
  structuredData?: Record<string, unknown>;
}

/**
 * Default options for web clipping.
 */
const DEFAULT_CLIPPER_OPTIONS: Required<Omit<WebClipperOptions, 'selectors' | 'cookiesFile' | 'headers'>> = {
  strategy: 'auto',
  imageStrategy: 'link-only',
  imageDir: './images',
  includeFrontmatter: true,
  timeout: 30000,
  userAgent: 'Mozilla/5.0 (compatible; markmv-clipper/1.0)',
  followRedirects: true,
  maxRedirects: 5,
  verbose: false,
  dryRun: false,
};

/**
 * Core web clipper class with multiple extraction strategies.
 *
 * Provides comprehensive web page to markdown conversion with support for different
 * content types, extraction strategies, and output formats.
 *
 * @category Core
 *
 * @example
 *   Basic usage
 *   ```typescript
 *   const clipper = new WebClipper({
 *     strategy: 'readability',
 *     imageStrategy: 'download'
 *   });
 *   
 *   const result = await clipper.clip('https://example.com/article');
 *   console.log(result.markdown);
 *   ```
 *
 * @example
 *   Custom extraction
 *   ```typescript
 *   const clipper = new WebClipper({
 *     strategy: 'manual',
 *     selectors: ['article', '.content', 'main']
 *   });
 *   
 *   const result = await clipper.clip('https://docs.example.com');
 *   ```
 */
export class WebClipper {
  private options: Required<Omit<WebClipperOptions, 'selectors' | 'cookiesFile' | 'headers'>> & 
    Pick<WebClipperOptions, 'selectors' | 'cookiesFile' | 'headers'>;
  private turndown: TurndownService;

  constructor(options: WebClipperOptions = {}) {
    this.options = { ...DEFAULT_CLIPPER_OPTIONS, ...options };
    this.turndown = this.configureTurndown();
  }

  /**
   * Clip a web page to markdown.
   *
   * @param url - URL to clip
   *
   * @returns Promise resolving to clip result
   */
  async clip(url: string): Promise<ClipResult> {
    if (this.options.verbose) {
      console.log(`🌐 Fetching: ${url}`);
    }

    // Fetch the web page
    const html = await this.fetchHtml(url);
    
    // Determine extraction strategy
    const strategy = this.options.strategy === 'auto' 
      ? this.determineStrategy(html, url)
      : this.options.strategy;

    if (this.options.verbose) {
      console.log(`🔧 Using strategy: ${strategy}`);
    }

    // Extract content using chosen strategy
    const extracted = await this.extractContent(html, url, strategy);
    
    // Process images if needed
    const processedImages = await this.processImages(extracted.images, url);
    
    // Generate markdown
    const markdown = await this.generateMarkdown(extracted, processedImages, url);

    const result: ClipResult = {
      markdown,
      sourceUrl: url,
      strategy,
      images: processedImages,
      links: extracted.links,
    };
    
    if (extracted.title) result.title = extracted.title;
    if (extracted.author) result.author = extracted.author;
    if (extracted.publishedDate) result.publishedDate = extracted.publishedDate;
    if (extracted.description) result.description = extracted.description;
    if (extracted.structuredData) result.structuredData = extracted.structuredData;
    
    return result;
  }

  /**
   * Fetch HTML content from a URL.
   *
   * @private
   */
  private async fetchHtml(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const headers: Record<string, string> = {
        'User-Agent': this.options.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        ...this.options.headers,
      };

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
        redirect: this.options.followRedirects ? 'follow' : 'manual',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Determine the best extraction strategy for content.
   *
   * @private
   */
  private determineStrategy(html: string, url: string): ExtractionStrategy {
    const root = parse(html);
    
    // Check for common article patterns
    const articleSelectors = ['article', '[role="main"]', '.post-content', '.entry-content'];
    const hasArticle = articleSelectors.some(selector => root.querySelector(selector));
    
    // Check for documentation patterns
    const docsPatterns = ['/docs/', '/documentation/', '/api/', '/guide/'];
    const isDocs = docsPatterns.some(pattern => url.includes(pattern));
    
    // Check for blog patterns
    const blogPatterns = ['/blog/', '/post/', '/article/'];
    const isBlog = blogPatterns.some(pattern => url.includes(pattern));

    // Check for structured data
    const hasStructuredData = root.querySelector('[itemscope]') || 
                             root.querySelector('script[type="application/ld+json"]');

    if (hasStructuredData) {
      return 'structured';
    } else if (hasArticle && (isBlog || url.includes('medium.com') || url.includes('dev.to'))) {
      return 'readability';
    } else if (isDocs) {
      return 'manual';
    } else {
      return 'readability';
    }
  }

  /**
   * Extract content using the specified strategy.
   *
   * @private
   */
  private async extractContent(html: string, url: string, strategy: ExtractionStrategy): Promise<ExtractedContent> {
    switch (strategy) {
      case 'readability':
        return this.extractWithReadability(html, url);
      case 'manual':
        return this.extractWithSelectors(html, url);
      case 'full':
        return this.extractFullPage(html, url);
      case 'structured':
        return this.extractStructured(html, url);
      default:
        return this.extractWithReadability(html, url);
    }
  }

  /**
   * Extract content using Mozilla Readability.
   *
   * @private
   */
  private extractWithReadability(html: string, url: string): ExtractedContent {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.content) {
      throw new Error('Could not extract article content using Readability');
    }

    const root = parse(article.content);
    
    const result: ExtractedContent = {
      content: article.content,
      images: this.extractImages(root, url),
      links: this.extractLinks(root, url),
    };
    
    if (article.title) result.title = article.title;
    if (article.byline) result.author = article.byline;
    if (article.excerpt) result.description = article.excerpt;
    
    const publishedDate = this.extractPublishedDate(html);
    if (publishedDate) result.publishedDate = publishedDate;
    
    return result;
  }

  /**
   * Extract content using custom selectors.
   *
   * @private
   */
  private extractWithSelectors(html: string, url: string): ExtractedContent {
    const root = parse(html);
    
    const selectors = this.options.selectors || [
      'article',
      '[role="main"]',
      '.content',
      '#content',
      'main',
      '.post-content',
      '.entry-content',
    ];

    let contentElement: HTMLElement | null = null;
    
    for (const selector of selectors) {
      contentElement = root.querySelector(selector);
      if (contentElement) break;
    }

    if (!contentElement) {
      // Fallback to body
      contentElement = root.querySelector('body');
    }

    if (!contentElement) {
      throw new Error('Could not find content with specified selectors');
    }

    const result: ExtractedContent = {
      content: contentElement.innerHTML,
      images: this.extractImages(contentElement, url),
      links: this.extractLinks(contentElement, url),
    };
    
    const title = this.extractTitle(root);
    if (title) result.title = title;
    
    const author = this.extractAuthor(root);
    if (author) result.author = author;
    
    const publishedDate = this.extractPublishedDate(html);
    if (publishedDate) result.publishedDate = publishedDate;
    
    const description = this.extractDescription(root);
    if (description) result.description = description;
    
    return result;
  }

  /**
   * Extract full page content.
   *
   * @private
   */
  private extractFullPage(html: string, url: string): ExtractedContent {
    const root = parse(html);
    const body = root.querySelector('body');
    
    if (!body) {
      throw new Error('Could not find body element');
    }

    const result: ExtractedContent = {
      content: body.innerHTML,
      images: this.extractImages(body, url),
      links: this.extractLinks(body, url),
    };
    
    const title = this.extractTitle(root);
    if (title) result.title = title;
    
    const author = this.extractAuthor(root);
    if (author) result.author = author;
    
    const publishedDate = this.extractPublishedDate(html);
    if (publishedDate) result.publishedDate = publishedDate;
    
    const description = this.extractDescription(root);
    if (description) result.description = description;
    
    return result;
  }

  /**
   * Extract content using structured data.
   *
   * @private
   */
  private extractStructured(html: string, url: string): ExtractedContent {
    const root = parse(html);
    
    // Try JSON-LD structured data first
    const jsonLdScript = root.querySelector('script[type="application/ld+json"]');
    let structuredData: Record<string, unknown> | undefined;
    
    if (jsonLdScript) {
      try {
        structuredData = JSON.parse(jsonLdScript.innerHTML);
      } catch {
        // Ignore JSON parsing errors
      }
    }

    // For now, fall back to readability with structured data
    const content = this.extractWithReadability(html, url);
    
    const result: ExtractedContent = {
      ...content,
    };
    
    if (structuredData) {
      result.structuredData = structuredData;
    }
    
    return result;
  }

  /**
   * Extract title from HTML.
   *
   * @private
   */
  private extractTitle(root: HTMLElement): string | undefined {
    // Try various title sources in order of preference
    const titleSelectors = [
      'h1',
      'title',
      '[property="og:title"]',
      '[name="twitter:title"]',
      '.title',
      '#title',
    ];

    for (const selector of titleSelectors) {
      const element = root.querySelector(selector);
      if (element) {
        const title = element.getAttribute('content') || element.text?.trim() || '';
        if (title) return title;
      }
    }

    return undefined;
  }

  /**
   * Extract author from HTML.
   *
   * @private
   */
  private extractAuthor(root: HTMLElement): string | undefined {
    const authorSelectors = [
      '[rel="author"]',
      '.author',
      '.byline',
      '[property="article:author"]',
      '[name="author"]',
    ];

    for (const selector of authorSelectors) {
      const element = root.querySelector(selector);
      if (element) {
        const author = element.getAttribute('content') || element.text?.trim() || '';
        if (author) return author;
      }
    }

    return undefined;
  }

  /**
   * Extract published date from HTML.
   *
   * @private
   */
  private extractPublishedDate(html: string): string | undefined {
    // Look for various date patterns in the HTML
    const datePatterns = [
      /"datePublished":\s*"([^"]+)"/,
      /"published_time":\s*"([^"]+)"/,
      /property="article:published_time"\s+content="([^"]+)"/,
      /name="date"\s+content="([^"]+)"/,
    ];

    for (const pattern of datePatterns) {
      const match = html.match(pattern);
      if (match) return match[1];
    }

    return undefined;
  }

  /**
   * Extract description from HTML.
   *
   * @private
   */
  private extractDescription(root: HTMLElement): string | undefined {
    const descriptionSelectors = [
      '[property="og:description"]',
      '[name="description"]',
      '[name="twitter:description"]',
    ];

    for (const selector of descriptionSelectors) {
      const element = root.querySelector(selector);
      if (element) {
        const description = element.getAttribute('content');
        if (description) return description;
      }
    }

    return undefined;
  }

  /**
   * Extract images from content.
   *
   * @private
   */
  private extractImages(root: HTMLElement, baseUrl: string) {
    const images = root.querySelectorAll('img');
    
    return images.map(img => {
      const alt = img.getAttribute('alt');
      return {
        originalUrl: this.resolveUrl(img.getAttribute('src') || '', baseUrl),
        alt: alt || undefined,
        processed: false,
      };
    });
  }

  /**
   * Extract links from content.
   *
   * @private
   */
  private extractLinks(root: HTMLElement, baseUrl: string) {
    const links = root.querySelectorAll('a[href]');
    
    return links.map(link => {
      const url = this.resolveUrl(link.getAttribute('href') || '', baseUrl);
      const text = link.text?.trim() || '';
      const type = this.isInternalLink(url, baseUrl) ? 'internal' : 'external';
      
      return { url, text, type } as const;
    });
  }

  /**
   * Process images according to the image strategy.
   *
   * @private
   */
  private async processImages(images: Array<{ originalUrl: string; alt: string | undefined; processed: boolean }>, _baseUrl: string) {
    // For now, just mark as processed without downloading
    // TODO: Implement actual image downloading and processing
    return images.map(img => ({
      originalUrl: img.originalUrl,
      alt: img.alt,
      processed: true,
    }));
  }

  /**
   * Generate final markdown content.
   *
   * @private
   */
  private async generateMarkdown(extracted: ExtractedContent, _images: ClipResult['images'], sourceUrl: string): Promise<string> {
    const parts: string[] = [];

    // Add frontmatter if requested
    if (this.options.includeFrontmatter) {
      const frontmatter = this.generateFrontmatter(extracted, sourceUrl);
      if (frontmatter) {
        parts.push('---');
        parts.push(frontmatter);
        parts.push('---\n');
      }
    }

    // Convert HTML to markdown
    const markdown = this.turndown.turndown(extracted.content);
    parts.push(markdown);

    return parts.join('\n');
  }

  /**
   * Generate frontmatter for the markdown file.
   *
   * @private
   */
  private generateFrontmatter(extracted: ExtractedContent, sourceUrl: string): string {
    const frontmatter: Record<string, unknown> = {};

    if (extracted.title) frontmatter.title = extracted.title;
    if (extracted.author) frontmatter.author = extracted.author;
    if (extracted.publishedDate) frontmatter.published = extracted.publishedDate;
    if (extracted.description) frontmatter.description = extracted.description;
    
    frontmatter.source = sourceUrl;
    frontmatter.clipped = new Date().toISOString();

    if (Object.keys(frontmatter).length === 0) return '';

    return Object.entries(frontmatter)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');
  }

  /**
   * Configure Turndown service for HTML to Markdown conversion.
   *
   * @private
   */
  private configureTurndown(): TurndownService {
    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '*',
      strongDelimiter: '**',
      linkStyle: 'inlined',
      linkReferenceStyle: 'full',
    });

    // Custom rules for better conversion
    turndown.addRule('strikethrough', {
      filter: ['del', 's'],
      replacement: (content) => `~~${content}~~`,
    });

    turndown.addRule('highlight', {
      filter: ['mark'],
      replacement: (content) => `==${content}==`,
    });

    return turndown;
  }

  /**
   * Resolve a URL relative to a base URL.
   *
   * @private
   */
  private resolveUrl(url: string, baseUrl: string): string {
    try {
      return new URL(url, baseUrl).toString();
    } catch {
      return url;
    }
  }

  /**
   * Check if a URL is internal to the base domain.
   *
   * @private
   */
  private isInternalLink(url: string, baseUrl: string): boolean {
    try {
      const urlObj = new URL(url);
      const baseObj = new URL(baseUrl);
      return urlObj.hostname === baseObj.hostname;
    } catch {
      return false;
    }
  }
}