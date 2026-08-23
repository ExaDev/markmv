import { basename, dirname, relative, resolve } from 'node:path';

/**
 * A candidate replacement for a broken link target.
 *
 * @category Core
 */
export interface LinkSuggestion {
  /** Absolute path of the candidate file */
  candidatePath: string;
  /** Replacement href, relative from the linking file and ./-prefixed, matching markmv conventions */
  replacementHref: string;
  /** Human-readable reason this candidate ranked, for display in fix prompts */
  reason: string;
}

/** Normalise a note name for fuzzy comparison: lowercase, extension stripped, separators unified */
function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.(md|markdown|mdx)$/, '')
    .replace(/[\s_-]+/g, '-');
}

/** Classic bounded edit distance, cheap enough for suggestion ranking over small file sets */
function editDistance(a: string, b: string): number {
  const previous: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let carry = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        carry + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      carry = temp;
    }
  }
  return previous[b.length];
}

/**
 * Suggest likely-intended targets for a broken link.
 *
 * Ranks every known file against the broken target by normalised name: an exact normalised stem
 * match wins, separator and case variations come next, then near misses by edit distance bounded
 * relative to the target's length so unrelated names are never suggested. The replacement href is
 * computed relative to the linking file, ./-prefixed like markmv's own rewrites, with posix
 * separators for markdown portability.
 *
 * @example
 *   ```typescript const suggestions = suggestLinkFixes('./Getting-Started.md', sourceFile, knownFiles);
 *
 *   if (suggestions.length > 0) { console.log(`Did you mean ${suggestions[0]?.replacementHref}?`); } ```
 *
 * @param brokenHref - The broken link target as written
 * @param sourceFilePath - Absolute path of the file containing the broken link
 * @param knownFiles - Absolute paths of every candidate file in the project
 * @param limit - Maximum number of suggestions to return (default 3)
 *
 * @returns Ranked suggestions, best first; empty when nothing is reasonably similar
 */
export function suggestLinkFixes(
  brokenHref: string,
  sourceFilePath: string,
  knownFiles: string[],
  limit = 3
): LinkSuggestion[] {
  const target = normalise(basename(brokenHref));
  if (target === '') {
    return [];
  }

  const scored = knownFiles
    .map((candidatePath): { suggestion: LinkSuggestion; score: number } => {
      const candidateStem = normalise(basename(candidatePath));
      let score: number;
      let reason: string;
      if (candidateStem === target) {
        score = 0;
        reason = 'same note name';
      } else if (candidateStem.includes(target) || target.includes(candidateStem)) {
        score = 1 + Math.abs(candidateStem.length - target.length);
        reason = 'name variation';
      } else {
        const distance = editDistance(target, candidateStem);
        const bound = Math.max(2, Math.floor(target.length / 2));
        if (distance > bound) {
          return {
            suggestion: { candidatePath, replacementHref: '', reason: '' },
            score: Number.MAX_SAFE_INTEGER,
          };
        }
        score = 10 + distance;
        reason = 'near miss';
      }
      return {
        suggestion: {
          candidatePath,
          replacementHref: toMarkdownRelative(candidatePath, sourceFilePath),
          reason,
        },
        score,
      };
    })
    .filter((entry) => entry.score !== Number.MAX_SAFE_INTEGER)
    .sort(
      (a, b) =>
        a.score - b.score || a.suggestion.candidatePath.localeCompare(b.suggestion.candidatePath)
    );

  return scored.slice(0, limit).map((entry) => entry.suggestion);
}

/** Relative href from the linking file to a candidate, ./-prefixed with posix separators */
function toMarkdownRelative(candidatePath: string, sourceFilePath: string): string {
  const fromDir = dirname(resolve(sourceFilePath));
  const rel = relative(fromDir, candidatePath).replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}
