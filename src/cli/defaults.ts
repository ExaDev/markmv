/** Deepest heading level Markdown defines (h6), used as the default maximum for table-of-contents depth. */
export const MAX_HEADING_LEVEL = 6;
/** Default timeout for fetching a page in the clip command. */
export const DEFAULT_CLIP_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_REDIRECTS = 5;
/** Default timeout for external link validation in the validate command. */
export const DEFAULT_EXTERNAL_TIMEOUT_MS = 5_000;
/** Two years: content older than this is considered stale. */
export const DEFAULT_FRESHNESS_THRESHOLD_DAYS = 730;
export const DEFAULT_GRAPH_MAX_DEPTH = 10;
/** Default timeout for the check-links command, longer than validate's because check-links retries. */
export const DEFAULT_LINK_CHECK_TIMEOUT_MS = 10_000;
export const DEFAULT_RETRY_COUNT = 3;
export const DEFAULT_RETRY_DELAY_MS = 1_000;
export const DEFAULT_CONCURRENCY = 10;
export const DEFAULT_CACHE_DURATION_MINUTES = 60;
