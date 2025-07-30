/**
 * Authentication detection utilities for external link validation.
 *
 * @fileoverview Detects authentication-protected URLs and handles auth-aware validation
 */

/**
 * Configuration for authentication detection.
 */
export interface AuthConfig {
  /** Enable authentication detection */
  enabled: boolean;
  /** API keys/tokens for authenticated requests */
  credentials: Record<string, string>;
  /** Patterns for recognizing auth-protected domains */
  authDomainPatterns: string[];
  /** Redirect patterns that indicate authentication requirement */
  authRedirectPatterns: string[];
  /** Maximum number of redirects to follow */
  maxRedirects: number;
  /** Custom headers for authenticated requests */
  customHeaders: Record<string, Record<string, string>>;
}

/**
 * Information about authentication status of a link.
 */
export interface AuthInfo {
  /** URL being checked */
  url: string;
  /** Whether link requires authentication */
  requiresAuth: boolean;
  /** Authentication provider if detected */
  authProvider?: string;
  /** Final URL after redirects */
  finalUrl?: string;
  /** Number of redirects followed */
  redirectCount: number;
  /** Whether authentication was attempted */
  authAttempted: boolean;
  /** Whether authentication succeeded */
  authSucceeded?: boolean;
  /** Auth detection method used */
  detectionMethod: 'domain' | 'redirect' | 'status-code' | 'content' | 'none';
  /** Warning message if auth-protected */
  warning?: string;
  /** Suggestion for handling auth requirement */
  suggestion?: string;
}

/**
 * Authentication detector for external links.
 */
export class AuthDetector {
  private config: AuthConfig;

  constructor(config: Partial<AuthConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      credentials: config.credentials ?? {},
      authDomainPatterns: config.authDomainPatterns ?? [
        'console.firebase.google.com',
        'console.cloud.google.com',
        'github.com/*/settings',
        'github.com/orgs/*/settings',
        'admin.microsoft.com',
        'portal.azure.com',
        'aws.amazon.com/console',
        'console.aws.amazon.com',
        'app.vercel.com',
        'dashboard.heroku.com',
        'app.netlify.com',
        'app.supabase.com',
        'app.planetscale.com',
        '*.atlassian.net',
        'trello.com/b/',
        'notion.so/',
        '*.sharepoint.com',
        '*.onedrive.com',
        'drive.google.com',
        'docs.google.com/*/d/',
        'sheets.google.com/*/d/',
        'slides.google.com/*/d/',
      ],
      authRedirectPatterns: config.authRedirectPatterns ?? [
        'accounts.google.com',
        'login.microsoftonline.com',
        'github.com/login',
        'auth0.com',
        'okta.com',
        'login.salesforce.com',
        'signin.aws.amazon.com',
        'id.heroku.com',
        'auth.netlify.com',
        '/login',
        '/signin',
        '/auth',
        '/oauth',
        '/sso',
      ],
      maxRedirects: config.maxRedirects ?? 5,
      customHeaders: config.customHeaders ?? {},
    };
  }

  /**
   * Check if authentication detection is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Analyze authentication requirements for a URL.
   */
  async analyzeAuth(
    url: string, 
    response?: Response,
    redirectHistory: string[] = []
  ): Promise<AuthInfo> {
    if (!this.config.enabled) {
      return {
        url,
        requiresAuth: false,
        redirectCount: 0,
        authAttempted: false,
        detectionMethod: 'none',
      };
    }

    const result: AuthInfo = {
      url,
      requiresAuth: false,
      redirectCount: redirectHistory.length,
      authAttempted: false,
      detectionMethod: 'none',
    };

    // Check domain-based auth detection first
    const domainAuth = this.checkAuthDomain(url);
    if (domainAuth.requiresAuth) {
      return {
        ...result,
        ...domainAuth,
        detectionMethod: 'domain',
      };
    }

    // If we have a response, analyze it for auth indicators
    if (response) {
      const responseAuth = await this.analyzeResponse(url, response, redirectHistory);
      if (responseAuth.requiresAuth) {
        return {
          ...result,
          ...responseAuth,
        };
      }
    }

    return result;
  }

  /**
   * Check if URL is from a known auth-protected domain.
   */
  private checkAuthDomain(url: string): Partial<AuthInfo> {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const fullUrl = url.toLowerCase();

      for (const pattern of this.config.authDomainPatterns) {
        if (this.matchesPattern(fullUrl, hostname, pattern)) {
          const provider = this.detectAuthProvider(pattern, hostname);
          return {
            requiresAuth: true,
            authProvider: provider,
            warning: `URL appears to be authentication-protected (${provider})`,
            suggestion: 'This is likely working correctly but requires authentication to access',
          };
        }
      }

      return { requiresAuth: false };
    } catch {
      return { requiresAuth: false };
    }
  }

  /**
   * Analyze HTTP response for authentication indicators.
   */
  private async analyzeResponse(
    url: string,
    response: Response,
    redirectHistory: string[]
  ): Promise<Partial<AuthInfo>> {
    const finalUrl = response.url;
    
    // Check for auth redirects
    if (finalUrl !== url || redirectHistory.length > 0) {
      const redirectAuth = this.analyzeRedirects(url, finalUrl, redirectHistory);
      if (redirectAuth.requiresAuth) {
        return {
          ...redirectAuth,
          finalUrl,
          detectionMethod: 'redirect',
        };
      }
    }

    // Check status codes that indicate auth requirement
    if (response.status === 401 || response.status === 403) {
      return {
        requiresAuth: true,
        finalUrl,
        detectionMethod: 'status-code',
        warning: `HTTP ${response.status}: Authentication required`,
        suggestion: 'Provide appropriate credentials or API keys to validate this link',
      };
    }

    // Check response content for auth indicators (if available)
    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        // Don't actually read the content in production to avoid performance issues
        // This would be for future enhancement
        return { requiresAuth: false };
      }
    } catch {
      // Ignore content analysis errors
    }

    return { requiresAuth: false };
  }

  /**
   * Analyze redirect chain for authentication patterns.
   */
  private analyzeRedirects(
    originalUrl: string,
    finalUrl: string,
    redirectHistory: string[]
  ): Partial<AuthInfo> {
    const allUrls = [originalUrl, ...redirectHistory];
    if (finalUrl && finalUrl !== originalUrl) {
      allUrls.push(finalUrl);
    }
    
    for (const redirectUrl of allUrls) {
      for (const pattern of this.config.authRedirectPatterns) {
        if (redirectUrl.toLowerCase().includes(pattern.toLowerCase())) {
          const provider = this.detectAuthProviderFromUrl(redirectUrl);
          return {
            requiresAuth: true,
            authProvider: provider,
            warning: `Redirected to authentication page (${provider})`,
            suggestion: 'This link is working correctly but requires user authentication',
          };
        }
      }
    }

    // Check for common auth-related query parameters
    try {
      const finalUrlObj = new URL(finalUrl);
      const hasAuthParams = ['login', 'auth', 'signin', 'oauth', 'sso'].some(param =>
        finalUrlObj.searchParams.has(param) || finalUrlObj.pathname.includes(`/${param}`)
      );
      
      if (hasAuthParams) {
        return {
          requiresAuth: true,
          warning: 'URL contains authentication-related parameters',
          suggestion: 'This link likely requires user authentication to access',
        };
      }
    } catch {
      // Ignore URL parsing errors
    }

    return { requiresAuth: false };
  }

  /**
   * Check if URL matches an auth domain pattern.
   */
  private matchesPattern(fullUrl: string, hostname: string, pattern: string): boolean {
    // Handle wildcard patterns
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '[^./]*');
      const regex = new RegExp(regexPattern, 'i');
      return regex.test(hostname) || regex.test(fullUrl);
    }

    // Exact match or subdomain match
    return hostname === pattern || 
           hostname.endsWith(`.${pattern}`) ||
           fullUrl.includes(pattern);
  }

  /**
   * Detect authentication provider from domain pattern.
   */
  private detectAuthProvider(pattern: string, hostname: string): string {
    if (pattern.includes('firebase') || hostname.includes('firebase')) {
      return 'Firebase';
    }
    if (pattern.includes('github') || hostname.includes('github')) {
      return 'GitHub';
    }
    if (pattern.includes('microsoft') || pattern.includes('azure') || hostname.includes('microsoft')) {
      return 'Microsoft';
    }
    if (pattern.includes('aws') || pattern.includes('amazon')) {
      return 'AWS';
    }
    if (pattern.includes('google') || hostname.includes('google')) {
      return 'Google';
    }
    if (pattern.includes('vercel')) {
      return 'Vercel';
    }
    if (pattern.includes('netlify')) {
      return 'Netlify';
    }
    if (pattern.includes('heroku')) {
      return 'Heroku';
    }
    if (pattern.includes('supabase')) {
      return 'Supabase';
    }
    if (pattern.includes('planetscale')) {
      return 'PlanetScale';
    }
    if (pattern.includes('atlassian')) {
      return 'Atlassian';
    }
    if (pattern.includes('trello')) {
      return 'Trello';
    }
    if (pattern.includes('notion')) {
      return 'Notion';
    }
    if (pattern.includes('sharepoint') || pattern.includes('onedrive')) {
      return 'Microsoft 365';
    }
    
    return 'Unknown Provider';
  }

  /**
   * Detect authentication provider from redirect URL.
   */
  private detectAuthProviderFromUrl(url: string): string {
    const lowerUrl = url.toLowerCase();
    
    if (lowerUrl.includes('google')) return 'Google';
    if (lowerUrl.includes('github')) return 'GitHub';
    if (lowerUrl.includes('microsoft') || lowerUrl.includes('azure')) return 'Microsoft';
    if (lowerUrl.includes('aws') || lowerUrl.includes('amazon')) return 'AWS';
    if (lowerUrl.includes('auth0')) return 'Auth0';
    if (lowerUrl.includes('okta')) return 'Okta';
    if (lowerUrl.includes('salesforce')) return 'Salesforce';
    if (lowerUrl.includes('heroku')) return 'Heroku';
    if (lowerUrl.includes('netlify')) return 'Netlify';
    
    return 'Authentication Service';
  }

  /**
   * Get headers for authenticated request to a specific domain.
   */
  getAuthHeaders(url: string): Record<string, string> {
    try {
      const hostname = new URL(url).hostname;
      
      // Check for domain-specific headers
      for (const [domain, headers] of Object.entries(this.config.customHeaders)) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          return headers;
        }
      }

      // Check for general credentials
      const authHeader = this.config.credentials[hostname] || this.config.credentials['*'];
      if (authHeader) {
        return {
          'Authorization': authHeader,
        };
      }

      return {};
    } catch {
      return {};
    }
  }

  /**
   * Check if we should attempt authentication for this URL.
   */
  shouldAttemptAuth(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return Object.keys(this.config.credentials).some(key => 
        key === hostname || key === '*' || hostname.endsWith(`.${key}`)
      ) || Object.keys(this.config.customHeaders).some(domain =>
        hostname === domain || hostname.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  }
}

/**
 * Default authentication configuration.
 */
export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  enabled: true,
  credentials: {},
  authDomainPatterns: [
    'console.firebase.google.com',
    'console.cloud.google.com',
    'github.com/*/settings',
    'github.com/orgs/*/settings',
    'admin.microsoft.com',
    'portal.azure.com',
    'aws.amazon.com/console',
    'console.aws.amazon.com',
    'app.vercel.com',
    'dashboard.heroku.com',
    'app.netlify.com',
    'app.supabase.com',
    'app.planetscale.com',
    '*.atlassian.net',
    'trello.com/b/',
    'notion.so/',
    '*.sharepoint.com',
    '*.onedrive.com',
    'drive.google.com',
    'docs.google.com/*/d/',
    'sheets.google.com/*/d/',
    'slides.google.com/*/d/',
  ],
  authRedirectPatterns: [
    'accounts.google.com',
    'login.microsoftonline.com',
    'github.com/login',
    'auth0.com',
    'okta.com',
    'login.salesforce.com',
    'signin.aws.amazon.com',
    'id.heroku.com',
    'auth.netlify.com',
    '/login',
    '/signin',
    '/auth',
    '/oauth',
    '/sso',
  ],
  maxRedirects: 5,
  customHeaders: {},
};