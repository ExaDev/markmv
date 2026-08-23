import { readFileSync } from 'node:fs';
import type { UserConfig } from '@commitlint/types';

/**
 * Commit-message validation. The allowed type list is derived from .releaserc.json's own
 * commit-analyzer releaseRules rather than restated here, so a conventional-commit type cannot
 * trigger a release without also being accepted by commit-msg validation, or the reverse.
 * .releaserc.json is the canonical release configuration; deriving from it means there is exactly
 * one place a type gets added.
 *
 * Read through fs rather than a JSON import so this file makes no assumption about how commitlint's
 * TypeScript loader handles JSON module resolution or import attributes.
 */

const RELEASE_CONFIG_FILE = '.releaserc.json';
const COMMIT_ANALYZER_PLUGIN = '@semantic-release/commit-analyzer';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/**
 * A semantic-release plugin entry, which is either a bare plugin name or a `[pluginName, options]`
 * tuple. Only the tuple form carries configuration.
 */
function isConfiguredPluginEntry(
  value: unknown
): value is readonly [string, Record<string, unknown>] {
  return (
    isUnknownArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    isRecord(value[1])
  );
}

/**
 * A releaseRules entry keyed by commit type. The `{ breaking: true }` entry has no type and is
 * deliberately not matched: "breaking" is a commit footer, never a type anyone writes in a subject
 * line.
 */
function isTypedReleaseRule(value: unknown): value is { readonly type: string } {
  return isRecord(value) && 'type' in value && typeof value.type === 'string';
}

function releasableCommitTypes(): readonly string[] {
  const raw: unknown = JSON.parse(
    readFileSync(new URL(RELEASE_CONFIG_FILE, import.meta.url), 'utf8')
  );
  if (!isRecord(raw) || !isUnknownArray(raw.plugins)) {
    throw new Error(`${RELEASE_CONFIG_FILE} must define a plugins array`);
  }

  const commitAnalyzerEntry = raw.plugins
    .filter(isConfiguredPluginEntry)
    .find(([pluginName]) => pluginName === COMMIT_ANALYZER_PLUGIN);
  if (!commitAnalyzerEntry) {
    throw new Error(
      `${RELEASE_CONFIG_FILE} has no configured ${COMMIT_ANALYZER_PLUGIN} plugin entry`
    );
  }

  const [, commitAnalyzerOptions] = commitAnalyzerEntry;
  if (!isUnknownArray(commitAnalyzerOptions.releaseRules)) {
    throw new Error(
      `${RELEASE_CONFIG_FILE}'s ${COMMIT_ANALYZER_PLUGIN} plugin must define releaseRules as an array`
    );
  }

  const types = commitAnalyzerOptions.releaseRules
    .filter(isTypedReleaseRule)
    .map((rule) => rule.type);
  if (types.length === 0) {
    throw new Error(
      `${RELEASE_CONFIG_FILE} defines no type-keyed releaseRules, so no commit type would be accepted`
    );
  }
  return types;
}

const Configuration: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', releasableCommitTypes()],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
  },
};

export default Configuration;
