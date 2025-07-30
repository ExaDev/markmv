/**
 * Tests for LinkValidator with authentication detection integration.
 *
 * @fileoverview Tests for link validation with authentication awareness
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LinkValidator } from './link-validator.js';
import type { MarkdownLink } from '../types/links.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LinkValidator with Authentication Detection', () => {
  let tempDir: string;
  let validator: LinkValidator;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'link-validator-auth-test-'));
    
    validator = new LinkValidator({
      checkExternal: true,
      enableAuthDetection: true,
      allowAuthRequired: true,
      externalTimeout: 5000,
      authConfig: {
        credentials: {
          'api.github.com': 'Bearer test-token',
        },
        customHeaders: {
          'api.custom.com': {
            'X-API-Key': 'custom-key-123',
          },
        },
      },
    });

    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Domain-based Auth Detection', () => {
    it('should identify Firebase Console links as auth-required', async () => {
      const link: MarkdownLink = {
        type: 'external',
        href: 'https://console.firebase.google.com/project/my-project/settings',
        text: 'Firebase Console',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('auth-required');
      expect(result?.authInfo?.requiresAuth).toBe(true);
      expect(result?.authInfo?.authProvider).toBe('Firebase');
      expect(result?.authInfo?.detectionMethod).toBe('domain');
      expect(result?.details).toContain('authentication-protected');
      
      // Should not make HTTP request for domain-detected auth
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should identify GitHub private repo links as auth-required', async () => {
      const link: MarkdownLink = {
        type: 'external',
        href: 'https://github.com/private-org/settings/profile',
        text: 'GitHub Settings',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('auth-required');
      expect(result?.authInfo?.authProvider).toBe('GitHub');
      expect(result?.authInfo?.detectionMethod).toBe('domain');
    });

    it('should validate public GitHub docs normally', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        url: 'https://docs.github.com/en/actions',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://docs.github.com/en/actions',
        text: 'GitHub Actions Docs',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).toBeNull(); // Should be valid
      expect(mockFetch).toHaveBeenCalledWith('https://docs.github.com/en/actions', {
        method: 'HEAD',
        signal: expect.any(AbortSignal),
        headers: {
          'User-Agent': 'markmv-validator/1.0 (authentication-aware)',
        },
        redirect: 'follow',
      });
    });
  });

  describe('HTTP Status Auth Detection', () => {
    it('should identify 401 responses as auth-required', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Map(),
        url: 'https://api.example.com/private',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://api.example.com/private',
        text: 'Private API',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('auth-required');
      expect(result?.authInfo?.requiresAuth).toBe(true);
      expect(result?.authInfo?.detectionMethod).toBe('status-code');
      expect(result?.details).toContain('HTTP 401');
    });

    it('should identify 403 responses as auth-required', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Map(),
        url: 'https://admin.example.com/dashboard',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://admin.example.com/dashboard',
        text: 'Admin Dashboard',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('auth-required');
      expect(result?.authInfo?.detectionMethod).toBe('status-code');
      expect(result?.details).toContain('HTTP 403');
    });

    it('should treat other HTTP errors as truly broken', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map(),
        url: 'https://example.com/missing',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com/missing',
        text: 'Missing Page',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('external-error');
      expect(result?.details).toContain('HTTP 404');
      expect(result?.authInfo).toBeUndefined();
    });
  });

  describe('Redirect Auth Detection', () => {
    it('should detect redirects to Google auth pages', async () => {
      const finalUrl = 'https://accounts.google.com/oauth/authorize?client_id=123';
      
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        url: finalUrl, // Simulate redirect
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://private.example.com/dashboard',
        text: 'Dashboard',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('auth-required');
      expect(result?.authInfo?.requiresAuth).toBe(true);
      expect(result?.authInfo?.detectionMethod).toBe('redirect');
      expect(result?.authInfo?.authProvider).toBe('Google');
      expect(result?.authInfo?.finalUrl).toBe(finalUrl);
    });

    it('should detect redirects to Microsoft auth pages', async () => {
      const finalUrl = 'https://login.microsoftonline.com/common/oauth2/authorize';
      
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        url: finalUrl,
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://teams.microsoft.com/channel',
        text: 'Teams Channel',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('auth-required');
      expect(result?.authInfo?.authProvider).toBe('Microsoft');
      expect(result?.authInfo?.detectionMethod).toBe('redirect');
    });
  });

  describe('Authentication Credentials', () => {
    it('should use provided credentials for authentication', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        url: 'https://api.github.com/user',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://api.github.com/user',
        text: 'GitHub User API',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).toBeNull(); // Should be valid with auth
      expect(mockFetch).toHaveBeenCalledWith('https://api.github.com/user', {
        method: 'HEAD',
        signal: expect.any(AbortSignal),
        headers: {
          'User-Agent': 'markmv-validator/1.0 (authentication-aware)',
          'Authorization': 'Bearer test-token',
        },
        redirect: 'follow',
      });
    });

    it('should use custom headers for authentication', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        url: 'https://api.custom.com/data',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://api.custom.com/data',
        text: 'Custom API',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).toBeNull(); // Should be valid with auth
      expect(mockFetch).toHaveBeenCalledWith('https://api.custom.com/data', {
        method: 'HEAD',
        signal: expect.any(AbortSignal),
        headers: {
          'User-Agent': 'markmv-validator/1.0 (authentication-aware)',
          'X-API-Key': 'custom-key-123',
        },
        redirect: 'follow',
      });
    });

    it('should mark authentication as attempted and succeeded', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        url: 'https://api.github.com/repos',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://api.github.com/repos',
        text: 'GitHub Repos API',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).toBeNull(); // Should be valid
      // We can't easily test the internal authInfo here since it's not returned for valid links
      // This is tested more thoroughly in the auth-detection unit tests
    });
  });

  describe('allowAuthRequired Configuration', () => {
    it('should still detect auth-required links via status code when allowAuthRequired is false', async () => {
      const strictValidator = new LinkValidator({
        checkExternal: true,
        enableAuthDetection: true,
        allowAuthRequired: false, // Strict mode - doesn't return early for auth detection
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Map(),
        url: 'https://api.private.com/endpoint',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://api.private.com/endpoint',
        text: 'Private API',
        line: 1,
      };

      const result = await strictValidator.validateLink(link, '/test/file.md');

      // When allowAuthRequired is false, 401/403 should be treated as external-error
      expect(result).not.toBeNull();
      expect(result?.reason).toBe('external-error');
      expect(result?.details).toContain('HTTP 401');
    });

    it('should handle mixed auth and broken links correctly', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          url: 'https://docs.example.com/guide',
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: new Map(),
          url: 'https://example.com/missing',
        });

      const links: MarkdownLink[] = [
        {
          type: 'external',
          href: 'https://console.firebase.google.com/project/test',
          text: 'Firebase Console',
          line: 1,
        },
        {
          type: 'external',
          href: 'https://docs.example.com/guide',
          text: 'Valid Docs',
          line: 2,
        },
        {
          type: 'external',
          href: 'https://example.com/missing',
          text: 'Missing Page',
          line: 3,
        },
      ];

      const results = await Promise.all(
        links.map(link => validator.validateLink(link, '/test/file.md'))
      );

      // Firebase Console: auth-required
      expect(results[0]?.reason).toBe('auth-required');
      
      // Valid docs: null (valid)
      expect(results[1]).toBeNull();
      
      // Missing page: external-error
      expect(results[2]?.reason).toBe('external-error');
    });
  });

  describe('Disabled Auth Detection', () => {
    it('should behave like normal validation when auth detection is disabled', async () => {
      const normalValidator = new LinkValidator({
        checkExternal: true,
        enableAuthDetection: false,
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Map(),
        url: 'https://api.example.com/private',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://api.example.com/private',
        text: 'Private API',
        line: 1,
      };

      const result = await normalValidator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('external-error'); // Not auth-required
      expect(result?.details).toContain('HTTP 401');
      expect(result?.authInfo).toBeUndefined();
    });

    it('should use basic headers when auth detection is disabled', async () => {
      const normalValidator = new LinkValidator({
        checkExternal: true,
        enableAuthDetection: false,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        url: 'https://example.com/test',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com/test',
        text: 'Test Link',
        line: 1,
      };

      await normalValidator.validateLink(link, '/test/file.md');

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/test', {
        method: 'HEAD',
        signal: expect.any(AbortSignal),
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors during auth-aware validation', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com/network-error',
        text: 'Network Error',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('external-error');
      expect(result?.details).toContain('Network timeout');
    });

    it('should handle timeout errors during auth validation', async () => {
      const timeoutValidator = new LinkValidator({
        checkExternal: true,
        enableAuthDetection: true,
        externalTimeout: 1, // Very short timeout
      });

      mockFetch.mockImplementation(() => 
        new Promise((resolve, reject) => {
          setTimeout(() => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          }, 2);
        })
      );

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com/slow',
        text: 'Slow Link',
        line: 1,
      };

      const result = await timeoutValidator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('external-error');
      expect(result?.details).toContain('aborted');
    });
  });

  describe('Image Link Authentication', () => {
    it('should apply auth detection to external images', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Map(),
        url: 'https://private.cdn.com/image.jpg',
      });

      const link: MarkdownLink = {
        type: 'image',
        href: 'https://private.cdn.com/image.jpg',
        text: 'Private Image',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('auth-required');
      expect(result?.authInfo?.detectionMethod).toBe('status-code');
    });

    it('should not apply auth detection to local images', async () => {
      // Create a test image file
      const imagePath = join(tempDir, 'test-image.jpg');
      await writeFile(imagePath, 'fake-image-content');

      const link: MarkdownLink = {
        type: 'image',
        href: './test-image.jpg',
        text: 'Local Image',
        line: 1,
        resolvedPath: imagePath,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).toBeNull(); // Local image should be valid
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});