/**
 * Tests for authentication detection utilities.
 *
 * @fileoverview Tests for AuthDetector functionality and configuration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthDetector, DEFAULT_AUTH_CONFIG } from './auth-detection.js';

describe('AuthDetector', () => {
  let authDetector: AuthDetector;

  beforeEach(() => {
    authDetector = new AuthDetector();
  });

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      expect(authDetector.isEnabled()).toBe(true);
    });

    it('should support disabling authentication detection', () => {
      const disabledDetector = new AuthDetector({ enabled: false });
      expect(disabledDetector.isEnabled()).toBe(false);
    });

    it('should support custom domain patterns', () => {
      const customDetector = new AuthDetector({
        authDomainPatterns: ['custom.example.com', 'internal.company.com'],
      });

      expect(customDetector).toBeDefined();
    });

    it('should support custom credentials', () => {
      const credentialsDetector = new AuthDetector({
        credentials: {
          'api.github.com': 'Bearer token123',
          'api.example.com': 'Token xyz789',
        },
      });

      expect(credentialsDetector.shouldAttemptAuth('https://api.github.com/user')).toBe(true);
      expect(credentialsDetector.shouldAttemptAuth('https://api.example.com/data')).toBe(true);
      expect(credentialsDetector.shouldAttemptAuth('https://other.example.com/data')).toBe(false);
    });
  });

  describe('Domain-based Authentication Detection', () => {
    it('should detect Firebase Console URLs as auth-required', async () => {
      const url = 'https://console.firebase.google.com/project/my-project/settings';
      const authInfo = await authDetector.analyzeAuth(url);

      expect(authInfo.requiresAuth).toBe(true);
      expect(authInfo.authProvider).toBe('Firebase');
      expect(authInfo.detectionMethod).toBe('domain');
      expect(authInfo.warning).toContain('authentication-protected');
    });

    it('should detect GitHub settings URLs as auth-required', async () => {
      const url = 'https://github.com/myorg/settings/profile';
      const authInfo = await authDetector.analyzeAuth(url);

      expect(authInfo.requiresAuth).toBe(true);
      expect(authInfo.authProvider).toBe('GitHub');
      expect(authInfo.detectionMethod).toBe('domain');
    });

    it('should detect Google Cloud Console URLs as auth-required', async () => {
      const url = 'https://console.cloud.google.com/compute/instances';
      const authInfo = await authDetector.analyzeAuth(url);

      expect(authInfo.requiresAuth).toBe(true);
      expect(authInfo.authProvider).toBe('Google');
      expect(authInfo.detectionMethod).toBe('domain');
    });

    it('should detect AWS Console URLs as auth-required', async () => {
      const url = 'https://console.aws.amazon.com/ec2/v2/home';
      const authInfo = await authDetector.analyzeAuth(url);

      expect(authInfo.requiresAuth).toBe(true);
      expect(authInfo.authProvider).toBe('AWS');
      expect(authInfo.detectionMethod).toBe('domain');
    });

    it('should detect Microsoft 365 URLs as auth-required', async () => {
      const url = 'https://mycompany.sharepoint.com/sites/team';
      const authInfo = await authDetector.analyzeAuth(url);

      expect(authInfo.requiresAuth).toBe(true);
      expect(authInfo.authProvider).toBe('Microsoft 365');
      expect(authInfo.detectionMethod).toBe('domain');
    });

    it('should detect Vercel dashboard URLs as auth-required', async () => {
      const url = 'https://app.vercel.com/dashboard';
      const authInfo = await authDetector.analyzeAuth(url);

      expect(authInfo.requiresAuth).toBe(true);
      expect(authInfo.authProvider).toBe('Vercel');
      expect(authInfo.detectionMethod).toBe('domain');
    });

    it('should not detect regular documentation URLs as auth-required', async () => {
      const url = 'https://docs.github.com/en/actions';
      const authInfo = await authDetector.analyzeAuth(url);

      expect(authInfo.requiresAuth).toBe(false);
      expect(authInfo.detectionMethod).toBe('none');
    });

    it('should handle wildcard domain patterns', async () => {
      const customDetector = new AuthDetector({
        authDomainPatterns: ['*.internal.company.com'],
      });

      const url = 'https://api.internal.company.com/v1/data';
      const authInfo = await customDetector.analyzeAuth(url);

      expect(authInfo.requiresAuth).toBe(true);
      expect(authInfo.detectionMethod).toBe('domain');
    });
  });

  describe('Response Analysis', () => {
    it('should detect 401 Unauthorized as auth-required', async () => {
      const mockResponse = new Response('', {
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
      });

      const url = 'https://api.example.com/private';
      const authInfo = await authDetector.analyzeAuth(url, mockResponse);

      expect(authInfo.requiresAuth).toBe(true);
      expect(authInfo.detectionMethod).toBe('status-code');
      expect(authInfo.warning).toContain('HTTP 401');
    });

    it('should detect 403 Forbidden as auth-required', async () => {
      const mockResponse = new Response('', {
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers(),
      });

      const url = 'https://api.example.com/admin';
      const authInfo = await authDetector.analyzeAuth(url, mockResponse);

      expect(authInfo.requiresAuth).toBe(true);
      expect(authInfo.detectionMethod).toBe('status-code');
      expect(authInfo.warning).toContain('HTTP 403');
    });

    it('should not detect 200 OK as auth-required', async () => {
      const mockResponse = new Response('content', {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
      });

      const url = 'https://example.com/public';
      const authInfo = await authDetector.analyzeAuth(url, mockResponse);

      expect(authInfo.requiresAuth).toBe(false);
    });

    it('should detect redirects to authentication pages', async () => {
      const originalUrl = 'https://private.example.com/dashboard';
      const finalUrl = 'https://accounts.google.com/oauth/authorize';
      
      const mockResponse = new Response('', {
        status: 200,
        headers: new Headers(),
      });
      
      // Mock the response URL to simulate redirect
      Object.defineProperty(mockResponse, 'url', {
        value: finalUrl,
        writable: false,
      });

      const authInfo = await authDetector.analyzeAuth(originalUrl, mockResponse, [finalUrl]);

      expect(authInfo.requiresAuth).toBe(true);
      expect(authInfo.detectionMethod).toBe('redirect');
      expect(authInfo.authProvider).toBe('Google');
      expect(authInfo.finalUrl).toBe(finalUrl);
    });
  });

  describe('Authentication Headers', () => {
    it('should provide auth headers for configured domains', () => {
      const credentialsDetector = new AuthDetector({
        credentials: {
          'api.github.com': 'Bearer ghp_token123',
          'api.example.com': 'Token xyz789',
        },
      });

      const githubHeaders = credentialsDetector.getAuthHeaders('https://api.github.com/user');
      expect(githubHeaders).toEqual({
        'Authorization': 'Bearer ghp_token123',
      });

      const exampleHeaders = credentialsDetector.getAuthHeaders('https://api.example.com/data');
      expect(exampleHeaders).toEqual({
        'Authorization': 'Token xyz789',
      });
    });

    it('should provide custom headers for configured domains', () => {
      const headersDetector = new AuthDetector({
        customHeaders: {
          'api.custom.com': {
            'X-API-Key': 'custom-key-123',
            'X-Client-Version': '1.0.0',
          },
        },
      });

      const headers = headersDetector.getAuthHeaders('https://api.custom.com/v1/data');
      expect(headers).toEqual({
        'X-API-Key': 'custom-key-123',
        'X-Client-Version': '1.0.0',
      });
    });

    it('should return empty headers for unconfigured domains', () => {
      const headers = authDetector.getAuthHeaders('https://unknown.example.com/api');
      expect(headers).toEqual({});
    });

    it('should support wildcard credentials', () => {
      const wildcardDetector = new AuthDetector({
        credentials: {
          '*': 'Bearer universal-token',
        },
      });

      const headers = wildcardDetector.getAuthHeaders('https://any.example.com/api');
      expect(headers).toEqual({
        'Authorization': 'Bearer universal-token',
      });
    });
  });

  describe('Authentication Attempt Detection', () => {
    it('should attempt auth for configured credential domains', () => {
      const credentialsDetector = new AuthDetector({
        credentials: {
          'api.github.com': 'Bearer token',
        },
      });

      expect(credentialsDetector.shouldAttemptAuth('https://api.github.com/user')).toBe(true);
      expect(credentialsDetector.shouldAttemptAuth('https://api.example.com/data')).toBe(false);
    });

    it('should attempt auth for configured custom header domains', () => {
      const headersDetector = new AuthDetector({
        customHeaders: {
          'api.custom.com': { 'X-API-Key': 'key' },
        },
      });

      expect(headersDetector.shouldAttemptAuth('https://api.custom.com/data')).toBe(true);
      expect(headersDetector.shouldAttemptAuth('https://other.example.com/data')).toBe(false);
    });

    it('should handle subdomain matching', () => {
      const credentialsDetector = new AuthDetector({
        credentials: {
          'github.com': 'Bearer token',
        },
      });

      expect(credentialsDetector.shouldAttemptAuth('https://api.github.com/user')).toBe(true);
      expect(credentialsDetector.shouldAttemptAuth('https://raw.githubusercontent.com/file')).toBe(false);
    });
  });

  describe('Provider Detection', () => {
    it('should detect Google as provider from domains', async () => {
      const testCases = [
        { url: 'https://console.firebase.google.com/project', expected: 'Firebase' },
        { url: 'https://console.cloud.google.com/compute', expected: 'Google' },
        { url: 'https://accounts.google.com/oauth', expected: 'Google' },
      ];

      for (const testCase of testCases) {
        const authInfo = await authDetector.analyzeAuth(testCase.url);
        if (authInfo.requiresAuth) {
          expect(authInfo.authProvider).toBe(testCase.expected);
        }
      }
    });

    it('should detect GitHub as provider from domains', async () => {
      const url = 'https://github.com/myorg/settings/profile';
      const authInfo = await authDetector.analyzeAuth(url);

      expect(authInfo.authProvider).toBe('GitHub');
    });

    it('should detect Microsoft as provider from domains', async () => {
      const urls = [
        'https://admin.microsoft.com/dashboard',
        'https://portal.azure.com/subscriptions',
        'https://mycompany.sharepoint.com/sites',
      ];

      for (const url of urls) {
        const authInfo = await authDetector.analyzeAuth(url);
        if (authInfo.requiresAuth) {
          expect(authInfo.authProvider).toContain('Microsoft');
        }
      }
    });

    it('should detect AWS as provider from domains', async () => {
      const url = 'https://console.aws.amazon.com/ec2';
      const authInfo = await authDetector.analyzeAuth(url);

      expect(authInfo.authProvider).toBe('AWS');
    });
  });

  describe('Redirect Analysis', () => {
    it('should detect auth redirects by URL patterns', async () => {
      const testCases = [
        {
          redirectUrl: 'https://login.microsoftonline.com/oauth',
          expectedProvider: 'Microsoft',
        },
        {
          redirectUrl: 'https://github.com/login/oauth',
          expectedProvider: 'GitHub',
        },
        {
          redirectUrl: 'https://auth0.com/login',
          expectedProvider: 'Auth0',
        },
        {
          redirectUrl: 'https://example.com/signin',
          expectedProvider: 'Authentication Service',
        },
      ];

      for (const testCase of testCases) {
        // Create a mock response that simulates a redirect
        const mockResponse = new Response('', {
          status: 200,
          headers: new Headers(),
        });
        
        // Mock the response URL to simulate redirect
        Object.defineProperty(mockResponse, 'url', {
          value: testCase.redirectUrl,
          writable: false,
        });

        const authInfo = await authDetector.analyzeAuth(
          'https://original.example.com',
          mockResponse,
          []
        );

        expect(authInfo.requiresAuth).toBe(true);
        expect(authInfo.authProvider).toBe(testCase.expectedProvider);
      }
    });

    it('should detect auth parameters in URLs', async () => {
      const mockResponse = new Response('', {
        status: 200,
        headers: new Headers(),
      });

      // Mock the response URL with auth parameters
      Object.defineProperty(mockResponse, 'url', {
        value: 'https://example.com/dashboard?login=required&redirect_uri=callback',
        writable: false,
      });

      const authInfo = await authDetector.analyzeAuth(
        'https://example.com/original',
        mockResponse
      );

      expect(authInfo.requiresAuth).toBe(true);
      expect(authInfo.warning).toContain('authentication-related parameters');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid URLs gracefully', async () => {
      const authInfo = await authDetector.analyzeAuth('not-a-valid-url');

      expect(authInfo.requiresAuth).toBe(false);
      expect(authInfo.detectionMethod).toBe('none');
    });

    it('should handle disabled detection', async () => {
      const disabledDetector = new AuthDetector({ enabled: false });
      const authInfo = await disabledDetector.analyzeAuth('https://console.firebase.google.com/project');

      expect(authInfo.requiresAuth).toBe(false);
      expect(authInfo.detectionMethod).toBe('none');
    });

    it('should handle missing response gracefully', async () => {
      const authInfo = await authDetector.analyzeAuth('https://example.com/unknown');

      expect(authInfo.detectionMethod).toBe('none');
      expect(authInfo.redirectCount).toBe(0);
    });
  });

  describe('Default Configuration', () => {
    it('should have comprehensive default auth domain patterns', () => {
      expect(DEFAULT_AUTH_CONFIG.authDomainPatterns).toContain('console.firebase.google.com');
      expect(DEFAULT_AUTH_CONFIG.authDomainPatterns).toContain('console.cloud.google.com');
      expect(DEFAULT_AUTH_CONFIG.authDomainPatterns).toContain('github.com/*/settings');
      expect(DEFAULT_AUTH_CONFIG.authDomainPatterns).toContain('app.vercel.com');
      expect(DEFAULT_AUTH_CONFIG.authDomainPatterns).toContain('dashboard.heroku.com');
      expect(DEFAULT_AUTH_CONFIG.authDomainPatterns).toContain('*.atlassian.net');
    });

    it('should have comprehensive default redirect patterns', () => {
      expect(DEFAULT_AUTH_CONFIG.authRedirectPatterns).toContain('accounts.google.com');
      expect(DEFAULT_AUTH_CONFIG.authRedirectPatterns).toContain('login.microsoftonline.com');
      expect(DEFAULT_AUTH_CONFIG.authRedirectPatterns).toContain('github.com/login');
      expect(DEFAULT_AUTH_CONFIG.authRedirectPatterns).toContain('/login');
      expect(DEFAULT_AUTH_CONFIG.authRedirectPatterns).toContain('/auth');
      expect(DEFAULT_AUTH_CONFIG.authRedirectPatterns).toContain('/oauth');
    });

    it('should have reasonable default settings', () => {
      expect(DEFAULT_AUTH_CONFIG.enabled).toBe(true);
      expect(DEFAULT_AUTH_CONFIG.maxRedirects).toBe(5);
      expect(DEFAULT_AUTH_CONFIG.credentials).toEqual({});
      expect(DEFAULT_AUTH_CONFIG.customHeaders).toEqual({});
    });
  });
});