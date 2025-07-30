/**
 * Integration tests for validate command with authentication detection.
 *
 * @fileoverview Tests the full validation pipeline with authentication awareness
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateLinks } from './validate.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Validate Command with Authentication Detection', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'validate-auth-test-'));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Authentication-aware Validation', () => {
    it('should distinguish auth-required from truly broken links', async () => {
      const testFile = join(tempDir, 'auth-test.md');
      await writeFile(testFile, `
# Authentication Test

Firebase Console: [Project Settings](https://console.firebase.google.com/project/test/settings)
Working docs: [GitHub Actions](https://docs.github.com/en/actions)
Broken link: [Missing Page](https://example.com/missing-page)
Private API: [User Profile](https://api.private.com/user/profile)
      `);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          url: 'https://docs.github.com/en/actions',
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: new Map(),
          url: 'https://example.com/missing-page',
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Map(),
          url: 'https://api.private.com/user/profile',
        });

      const result = await validateLinks([testFile], {
        checkExternal: true,
        enableAuthDetection: true,
        allowAuthRequired: true,
      });

      expect(result.filesProcessed).toBe(1);
      expect(result.totalLinks).toBe(4);
      expect(result.brokenLinks).toBe(3); // Firebase (auth), Missing (404), Private API (401)
      expect(result.authRequiredLinks).toBe(2); // Firebase + Private API
      expect(result.authenticatedLinks).toBe(0); // No successful auth

      const brokenLinks = Object.values(result.brokenLinksByFile)[0];
      
      // Firebase Console - domain-based detection
      const firebaseLink = brokenLinks.find(link => link.url.includes('firebase'));
      expect(firebaseLink?.reason).toBe('auth-required');
      expect(firebaseLink?.authInfo?.detectionMethod).toBe('domain');
      
      // Missing page - truly broken
      const missingLink = brokenLinks.find(link => link.url.includes('missing'));
      expect(missingLink?.reason).toBe('external-error');
      expect(missingLink?.authInfo).toBeUndefined();
      
      // Private API - status-based detection
      const privateLink = brokenLinks.find(link => link.url.includes('private'));
      expect(privateLink?.reason).toBe('auth-required');
      expect(privateLink?.authInfo?.detectionMethod).toBe('status-code');
    });

    it('should successfully authenticate with provided credentials', async () => {
      const testFile = join(tempDir, 'auth-success.md');
      await writeFile(testFile, `
# Authentication Success Test

GitHub API: [User Info](https://api.github.com/user)
Custom API: [Data Endpoint](https://api.custom.com/data)
      `);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          url: 'https://api.github.com/user',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          url: 'https://api.custom.com/data',
        });

      const result = await validateLinks([testFile], {
        checkExternal: true,
        enableAuthDetection: true,
        allowAuthRequired: true,
        authCredentials: {
          'api.github.com': 'Bearer ghp_test123',
        },
        authHeaders: {
          'api.custom.com': {
            'X-API-Key': 'custom-key-456',
          },
        },
      });

      expect(result.brokenLinks).toBe(0);
      expect(result.authRequiredLinks).toBe(0);
      expect(result.totalLinks).toBe(2);

      // Verify correct headers were sent
      expect(mockFetch).toHaveBeenCalledWith('https://api.github.com/user', {
        method: 'HEAD',
        signal: expect.any(AbortSignal),
        headers: {
          'User-Agent': 'markmv-validator/1.0 (authentication-aware)',
          'Authorization': 'Bearer ghp_test123',
        },
        redirect: 'follow',
      });

      expect(mockFetch).toHaveBeenCalledWith('https://api.custom.com/data', {
        method: 'HEAD',
        signal: expect.any(AbortSignal),
        headers: {
          'User-Agent': 'markmv-validator/1.0 (authentication-aware)',
          'X-API-Key': 'custom-key-456',
        },
        redirect: 'follow',
      });
    });

    it('should handle redirect-based authentication detection', async () => {
      const testFile = join(tempDir, 'redirect-auth.md');
      await writeFile(testFile, `
# Redirect Authentication Test

Private Dashboard: [Team Dashboard](https://private.example.com/dashboard)
Company Portal: [Employee Portal](https://portal.company.com/employees)
      `);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          url: 'https://accounts.google.com/oauth/authorize?client_id=123', // Redirect to Google
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          url: 'https://login.microsoftonline.com/common/oauth2/authorize', // Redirect to Microsoft
        });

      const result = await validateLinks([testFile], {
        checkExternal: true,
        enableAuthDetection: true,
        allowAuthRequired: true,
      });

      expect(result.brokenLinks).toBe(2);
      expect(result.authRequiredLinks).toBe(2);

      const brokenLinks = Object.values(result.brokenLinksByFile)[0];
      
      const googleRedirect = brokenLinks.find(link => link.url.includes('private.example.com'));
      expect(googleRedirect?.reason).toBe('auth-required');
      expect(googleRedirect?.authInfo?.detectionMethod).toBe('redirect');
      expect(googleRedirect?.authInfo?.authProvider).toBe('Google');

      const microsoftRedirect = brokenLinks.find(link => link.url.includes('portal.company.com'));
      expect(microsoftRedirect?.reason).toBe('auth-required');
      expect(microsoftRedirect?.authInfo?.detectionMethod).toBe('redirect');
      expect(microsoftRedirect?.authInfo?.authProvider).toBe('Microsoft');
    });

    it('should handle mixed internal and external links with auth detection', async () => {
      const internalFile = join(tempDir, 'internal.md');
      await writeFile(internalFile, '# Internal Document\nContent here.');

      const testFile = join(tempDir, 'mixed-auth.md');
      await writeFile(testFile, `
# Mixed Links with Authentication

Internal: [Internal Doc](./internal.md)
Public: [Public Docs](https://docs.example.com/guide)
Auth Required: [Firebase Console](https://console.firebase.google.com/project/test)
Broken: [Missing](https://example.com/404)
Anchor: [Section](#section)

## Section
Content here.
      `);

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
          url: 'https://example.com/404',
        });

      const result = await validateLinks([testFile], {
        checkExternal: true,
        enableAuthDetection: true,
        allowAuthRequired: true,
        strictInternal: true,
      });

      expect(result.totalLinks).toBe(5);
      expect(result.brokenLinks).toBe(2); // Firebase (auth) + Missing (404)
      expect(result.authRequiredLinks).toBe(1); // Firebase

      // Only external links should be fetched (public docs + missing page)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Strict Mode (disallowAuthRequired)', () => {
    it('should treat auth-required links as broken when allowAuthRequired is false', async () => {
      const testFile = join(tempDir, 'strict-auth.md');
      await writeFile(testFile, `
# Strict Authentication Test

Firebase: [Console](https://console.firebase.google.com/project/test)
GitHub: [Settings](https://github.com/org/settings/profile)
      `);

      const result = await validateLinks([testFile], {
        checkExternal: true,
        enableAuthDetection: true,
        allowAuthRequired: false, // Treat auth-required as broken
      });

      // Domain-based links are still detected as auth-required regardless of allowAuthRequired setting
      expect(result.brokenLinks).toBe(2);
      expect(result.authRequiredLinks).toBe(2);

      const brokenLinks = Object.values(result.brokenLinksByFile)[0];
      expect(brokenLinks).toHaveLength(2);
      expect(brokenLinks[0].reason).toBe('auth-required');
      expect(brokenLinks[1].reason).toBe('auth-required');
    });
  });

  describe('Disabled Authentication Detection', () => {
    it('should behave normally when auth detection is disabled', async () => {
      const testFile = join(tempDir, 'no-auth.md');
      await writeFile(testFile, `
# No Authentication Detection

Firebase: [Console](https://console.firebase.google.com/project/test)
Private API: [Endpoint](https://api.private.com/data)
      `);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          url: 'https://console.firebase.google.com/project/test',
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Map(),
          url: 'https://api.private.com/data',
        });

      const result = await validateLinks([testFile], {
        checkExternal: true,
        enableAuthDetection: false, // Disabled
      });

      expect(result.brokenLinks).toBe(1); // Only the 401 error
      expect(result.authRequiredLinks).toBe(0); // No auth detection
      expect(result.authenticatedLinks).toBe(0);

      const brokenLinks = Object.values(result.brokenLinksByFile)[0];
      expect(brokenLinks).toHaveLength(1);
      expect(brokenLinks[0].reason).toBe('external-error'); // Not auth-required
      expect(brokenLinks[0].details).toContain('HTTP 401');
    });
  });

  describe('Statistics and Reporting', () => {
    it('should provide accurate authentication statistics', async () => {
      const testFile = join(tempDir, 'stats-test.md');
      await writeFile(testFile, `
# Authentication Statistics Test

Working: [Public Docs](https://docs.example.com/api)
Auth Domain: [Firebase](https://console.firebase.google.com/project/test)
Auth Creds: [GitHub API](https://api.github.com/user)
Auth Status: [Private API](https://private.api.com/endpoint)
Broken: [Missing](https://example.com/missing)
      `);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          url: 'https://docs.example.com/api',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          url: 'https://api.github.com/user',
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          headers: new Map(),
          url: 'https://private.api.com/endpoint',
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: new Map(),
          url: 'https://example.com/missing',
        });

      const result = await validateLinks([testFile], {
        checkExternal: true,
        enableAuthDetection: true,
        allowAuthRequired: true,
        authCredentials: {
          'api.github.com': 'Bearer token123',
        },
      });

      expect(result.filesProcessed).toBe(1);
      expect(result.totalLinks).toBe(5);
      expect(result.brokenLinks).toBe(3); // Firebase (domain) + Private API (403) + Missing (404)
      expect(result.authRequiredLinks).toBe(2); // Firebase + Private API
      expect(result.authenticatedLinks).toBe(0); // GitHub API was successful (not counted as broken)

      // Verify the truly broken link
      const brokenLinks = Object.values(result.brokenLinksByFile)[0];
      const trulyBroken = brokenLinks.filter(link => link.reason === 'external-error');
      expect(trulyBroken).toHaveLength(1);
      expect(trulyBroken[0].url).toContain('missing');
    });

    it('should handle multiple files with auth detection', async () => {
      const file1 = join(tempDir, 'file1.md');
      await writeFile(file1, `
# File 1
[Firebase](https://console.firebase.google.com/project/test1)
[Working](https://docs.example.com/guide1)
      `);

      const file2 = join(tempDir, 'file2.md');
      await writeFile(file2, `
# File 2
[GitHub Settings](https://github.com/org/settings/billing)
[Broken](https://example.com/broken)
      `);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          url: 'https://docs.example.com/guide1',
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: new Map(),
          url: 'https://example.com/broken',
        });

      const result = await validateLinks([file1, file2], {
        checkExternal: true,
        enableAuthDetection: true,
        allowAuthRequired: true,
      });

      expect(result.filesProcessed).toBe(2);
      expect(result.totalLinks).toBe(4);
      expect(result.brokenLinks).toBe(3); // Firebase + GitHub + Broken
      expect(result.authRequiredLinks).toBe(2); // Firebase + GitHub

      expect(Object.keys(result.brokenLinksByFile)).toHaveLength(2);
    });
  });

  describe('Error Handling with Authentication', () => {
    it('should handle network errors during auth-aware validation', async () => {
      const testFile = join(tempDir, 'network-error.md');
      await writeFile(testFile, `
# Network Error Test

[Timeout Link](https://slow.example.com/endpoint)
[Firebase Console](https://console.firebase.google.com/project/test)
      `);

      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await validateLinks([testFile], {
        checkExternal: true,
        enableAuthDetection: true,
        allowAuthRequired: true,
      });

      expect(result.brokenLinks).toBe(2);
      expect(result.authRequiredLinks).toBe(1); // Firebase

      const brokenLinks = Object.values(result.brokenLinksByFile)[0];
      const networkError = brokenLinks.find(link => link.url.includes('slow'));
      expect(networkError?.reason).toBe('external-error');
      expect(networkError?.details).toContain('Network timeout');

      const authRequired = brokenLinks.find(link => link.url.includes('firebase'));
      expect(authRequired?.reason).toBe('auth-required');
    });

    it('should continue processing after authentication errors', async () => {
      const testFile = join(tempDir, 'continue-after-error.md');
      await writeFile(testFile, `
# Continue After Error Test

[First Link](https://first.example.com/api)
[Error Link](https://error.example.com/api)
[Last Link](https://last.example.com/api)
      `);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          url: 'https://first.example.com/api',
        })
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          url: 'https://last.example.com/api',
        });

      const result = await validateLinks([testFile], {
        checkExternal: true,
        enableAuthDetection: true,
        allowAuthRequired: true,
      });

      expect(result.totalLinks).toBe(3);
      expect(result.filesProcessed).toBe(1);
      expect(result.brokenLinks).toBe(1); // Only the error link
      expect(mockFetch).toHaveBeenCalledTimes(3);

      const brokenLinks = Object.values(result.brokenLinksByFile)[0];
      expect(brokenLinks).toHaveLength(1);
      expect(brokenLinks[0].details).toContain('Connection refused');
    });
  });

  describe('Integration with Other Link Types', () => {
    it('should only apply auth detection to external links', async () => {
      const internalFile = join(tempDir, 'target.md');
      await writeFile(internalFile, '# Target\nContent');

      const testFile = join(tempDir, 'mixed-types.md');
      await writeFile(testFile, `
# Mixed Link Types

Internal: [Target](./target.md)
External Auth: [Firebase](https://console.firebase.google.com/project/test)
External Normal: [Docs](https://docs.example.com/guide)
Anchor: [Section](#section)
Image: ![Image](./image.png)

## Section
Content here.
      `);

      // Create image file
      const imagePath = join(tempDir, 'image.png');
      await writeFile(imagePath, 'fake-image-content');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        url: 'https://docs.example.com/guide',
      });

      const result = await validateLinks([testFile], {
        checkExternal: true,
        enableAuthDetection: true,
        allowAuthRequired: true,
        strictInternal: true,
      });

      expect(result.totalLinks).toBe(5);
      expect(result.brokenLinks).toBe(1); // Only Firebase
      expect(result.authRequiredLinks).toBe(1); // Firebase

      // Only external docs should be fetched (Firebase is detected by domain)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});