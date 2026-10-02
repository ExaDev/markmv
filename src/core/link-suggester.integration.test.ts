import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { suggestLinkFixes } from "./link-suggester.js";

describe("link suggester", () => {
  let vaultRoot: string;

  beforeEach(async () => {
    vaultRoot = join(
      tmpdir(),
      `markmv-suggest-test-${String(Date.now())}-${Math.random().toString(36).slice(2, 11)}`,
    );
    await mkdir(join(vaultRoot, "guides"), { recursive: true });
    await mkdir(join(vaultRoot, "reference"), { recursive: true });
    await writeFile(
      join(vaultRoot, "guides", "getting-started.md"),
      "# Getting Started\n",
    );
    await writeFile(
      join(vaultRoot, "guides", "testing-strategies.md"),
      "# Testing\n",
    );
    await writeFile(
      join(vaultRoot, "reference", "magic-numbers.md"),
      "# Magic\n",
    );
  });

  afterEach(async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  });

  const knownFiles = (): string[] => [
    join(vaultRoot, "guides", "getting-started.md"),
    join(vaultRoot, "guides", "testing-strategies.md"),
    join(vaultRoot, "reference", "magic-numbers.md"),
  ];

  it("ranks an exact-stem match with different extension or case first", () => {
    const suggestions = suggestLinkFixes(
      "./Getting-Started.md",
      join(vaultRoot, "docs", "note.md"),
      knownFiles(),
    );

    expect(suggestions[0]?.replacementHref).toBe(
      "../guides/getting-started.md",
    );
  });

  it("matches separator and case variations of the target", () => {
    const suggestions = suggestLinkFixes(
      "./testing_strategies.md",
      join(vaultRoot, "docs", "note.md"),
      knownFiles(),
    );

    expect(suggestions[0]?.replacementHref).toBe(
      "../guides/testing-strategies.md",
    );
  });

  it("returns near misses ordered by edit distance", () => {
    const suggestions = suggestLinkFixes(
      "./magic-number.md",
      join(vaultRoot, "docs", "note.md"),
      knownFiles(),
    );

    expect(suggestions[0]?.replacementHref).toBe(
      "../reference/magic-numbers.md",
    );
  });

  it("returns an empty list when nothing is reasonably similar", () => {
    const suggestions = suggestLinkFixes(
      "./completely-unrelated.md",
      join(vaultRoot, "docs", "note.md"),
      knownFiles(),
    );

    expect(suggestions).toHaveLength(0);
  });

  it("caps the number of suggestions", () => {
    const suggestions = suggestLinkFixes(
      "./getting-started.md",
      join(vaultRoot, "docs", "note.md"),
      knownFiles(),
      1,
    );

    expect(suggestions.length).toBeLessThanOrEqual(1);
  });
});
