import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  buildFileTree,
  computeTreeStatistics,
  countWords,
  renderTreeAscii,
  scanMarkdownTree,
  treeCommand,
  type ScannedMarkdownFile,
  type TreeDirectoryNode,
} from "./tree.js";

/** Build a minimal scanned file record for pure-function tests */
function scanned(relativePath: string): ScannedMarkdownFile {
  return {
    path: `/vault/${relativePath}`,
    relativePath,
    wordCount: 0,
    linkCount: 0,
    internalLinkCount: 0,
    externalLinkCount: 0,
    brokenInternalLinkCount: 0,
    inboundLinkCount: 1,
  };
}

/** Collect every file relative path present anywhere in a tree node */
function collectRelativePaths(node: TreeDirectoryNode): string[] {
  const paths = node.files.map((file) => file.path);
  for (const dir of node.directories) {
    paths.push(...collectRelativePaths(dir));
  }
  return paths;
}

/** Create the shared fixture: two linked files, one orphan, one broken link, excluded directories */
async function createTreeFixture(testDir: string): Promise<void> {
  await writeFile(
    join(testDir, "README.md"),
    "# Root\n\nSee the [guide](./docs/guide.md) and [the site](https://example.com).\n",
  );
  await mkdir(join(testDir, "docs"), { recursive: true });
  await writeFile(
    join(testDir, "docs", "guide.md"),
    "# Guide\n\nBack to [root](../README.md) via text.\n\nMissing [target](./broken.md).\n",
  );
  await writeFile(
    join(testDir, "docs", "orphan.md"),
    "# Orphan\n\nNobody links here.\n",
  );
  await mkdir(join(testDir, "node_modules"), { recursive: true });
  await writeFile(join(testDir, "node_modules", "dep.md"), "# Dependency\n");
  await mkdir(join(testDir, "docs", "dist"), { recursive: true });
  await writeFile(join(testDir, "docs", "dist", "built.md"), "# Built\n");
}

/** Capture console output and process.exit calls while running the given action */
async function captureCommandOutput(
  action: () => Promise<void>,
): Promise<{ logs: string[]; errors: string[]; exitCode: number }> {
  const logs: string[] = [];
  const errors: string[] = [];
  let exitCode = 0;

  const originalExit = process.exit;
  const originalLog = console.log;
  const originalError = console.error;
  process.exit = (code: number | undefined): never => {
    exitCode = code ?? 0;
    return null as never;
  };
  console.log = (message: string) => {
    logs.push(message);
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.join(" "));
  };

  try {
    await action();
  } finally {
    process.exit = originalExit;
    console.log = originalLog;
    console.error = originalError;
  }

  return { logs, errors, exitCode };
}

describe("Tree Command", () => {
  describe("countWords", () => {
    it("counts whitespace-separated tokens outside code fences and inline code spans", () => {
      const content = [
        "# Title",
        "",
        "Text with `inline code` tokens.",
        "",
        "```typescript",
        'const ignored = "fenced words";',
        "```",
        "",
        "After the fence.",
      ].join("\n");

      expect(countWords(content)).toBe(8);
    });
  });

  describe("computeTreeStatistics", () => {
    it("totals file, word, and link counts and flags files with no inbound links as orphans", () => {
      const files: ScannedMarkdownFile[] = [
        {
          path: "/vault/README.md",
          relativePath: "README.md",
          wordCount: 8,
          linkCount: 2,
          internalLinkCount: 1,
          externalLinkCount: 1,
          brokenInternalLinkCount: 0,
          inboundLinkCount: 1,
        },
        {
          path: "/vault/docs/guide.md",
          relativePath: "docs/guide.md",
          wordCount: 9,
          linkCount: 2,
          internalLinkCount: 2,
          externalLinkCount: 0,
          brokenInternalLinkCount: 1,
          inboundLinkCount: 1,
        },
        {
          path: "/vault/docs/orphan.md",
          relativePath: "docs/orphan.md",
          wordCount: 5,
          linkCount: 0,
          internalLinkCount: 0,
          externalLinkCount: 0,
          brokenInternalLinkCount: 0,
          inboundLinkCount: 0,
        },
      ];

      const statistics = computeTreeStatistics(files);

      expect(statistics).toEqual({
        totalFiles: 3,
        totalWords: 22,
        totalInternalLinks: 3,
        totalExternalLinks: 1,
        brokenInternalLinks: 1,
        orphanedFiles: 1,
      });
    });
  });

  describe("buildFileTree", () => {
    const files: ScannedMarkdownFile[] = [
      scanned("README.md"),
      scanned("docs/guide.md"),
      scanned("docs/orphan.md"),
      scanned("docs/nested/deep.md"),
      scanned("assets/notes.md"),
      scanned("zeta.md"),
      scanned("alpha.md"),
      scanned("node_modules/dep.md"),
      scanned("docs/.git/config.md"),
      scanned("docs/dist/build.md"),
    ];

    it("nests directories and files, ordering directories first then files, alphabetically", () => {
      const tree = buildFileTree(files);

      expect(tree.name).toBe("");
      expect(tree.directories.map((dir) => dir.name)).toEqual([
        "assets",
        "docs",
      ]);
      expect(tree.files.map((file) => file.name)).toEqual([
        "README.md",
        "alpha.md",
        "zeta.md",
      ]);

      const docs = tree.directories.find((dir) => dir.name === "docs");
      expect(docs?.directories.map((dir) => dir.name)).toEqual(["nested"]);
      expect(docs?.files.map((file) => file.name)).toEqual([
        "guide.md",
        "orphan.md",
      ]);
    });

    it("excludes node_modules, .git, and dist directories at any depth", () => {
      const tree = buildFileTree(files);

      const relativePaths = collectRelativePaths(tree);
      expect(relativePaths).not.toContain("node_modules/dep.md");
      expect(relativePaths).not.toContain("docs/.git/config.md");
      expect(relativePaths).not.toContain("docs/dist/build.md");
      expect(relativePaths).toContain("docs/nested/deep.md");
    });

    it("truncates the tree at max-depth while keeping deeper files available to statistics", () => {
      const tree = buildFileTree(files, 1);

      const docs = tree.directories.find((dir) => dir.name === "docs");
      expect(docs?.files).toEqual([]);
      expect(docs?.directories).toEqual([]);
      expect(docs?.truncated).toBe(true);

      // The root level still shows its own direct files
      expect(tree.files.map((file) => file.name)).toEqual([
        "README.md",
        "alpha.md",
        "zeta.md",
      ]);
      // Depth beyond the limit is dropped from rendering entirely
      expect(collectRelativePaths(tree)).not.toContain("docs/guide.md");
    });
  });

  describe("renderTreeAscii", () => {
    const annotated: ScannedMarkdownFile[] = [
      { ...scanned("README.md"), wordCount: 8, linkCount: 2 },
      {
        ...scanned("docs/guide.md"),
        wordCount: 9,
        linkCount: 2,
        internalLinkCount: 2,
        brokenInternalLinkCount: 1,
      },
      {
        ...scanned("docs/orphan.md"),
        wordCount: 5,
        linkCount: 0,
        inboundLinkCount: 0,
      },
    ];

    it("renders box-drawing tree lines with per-file annotations and warning markers", () => {
      const rendering = renderTreeAscii(buildFileTree(annotated), "test-root");

      expect(rendering).toBe(
        [
          "test-root",
          "├── docs/",
          "│   ├── guide.md (9 words, 2 links) [1 broken]",
          "│   └── orphan.md (5 words, 0 links) [orphan]",
          "└── README.md (8 words, 2 links)",
        ].join("\n"),
      );
    });

    it("marks max-depth-truncated directories with an ellipsis", () => {
      const rendering = renderTreeAscii(
        buildFileTree(annotated, 1),
        "test-root",
      );

      expect(rendering).toBe(
        ["test-root", "├── docs/ ...", "└── README.md (8 words, 2 links)"].join(
          "\n",
        ),
      );
    });

    it("uses singular word and link labels for counts of one", () => {
      const single: ScannedMarkdownFile[] = [
        { ...scanned("solo.md"), wordCount: 1, linkCount: 1 },
      ];

      const rendering = renderTreeAscii(buildFileTree(single), "test-root");

      expect(rendering).toBe(
        ["test-root", "└── solo.md (1 word, 1 link)"].join("\n"),
      );
    });
  });

  describe("scanMarkdownTree", () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = await mkdtemp(join(tmpdir(), "markmv-tree-test-"));
      await createTreeFixture(testDir);
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it("scans markdown files, skips node_modules and dist, and measures words, links, broken links, and inbound links", async () => {
      const files = await scanMarkdownTree(testDir);

      expect(files.map((file) => file.relativePath)).toEqual([
        "README.md",
        "docs/guide.md",
        "docs/orphan.md",
      ]);

      const readme = files[0];
      expect(readme).toMatchObject({
        wordCount: 8,
        linkCount: 2,
        internalLinkCount: 1,
        externalLinkCount: 1,
        brokenInternalLinkCount: 0,
        inboundLinkCount: 1,
      });

      const guide = files[1];
      expect(guide).toMatchObject({
        wordCount: 9,
        linkCount: 2,
        internalLinkCount: 2,
        externalLinkCount: 0,
        brokenInternalLinkCount: 1,
        inboundLinkCount: 1,
      });

      const orphan = files[2];
      expect(orphan).toMatchObject({
        wordCount: 5,
        linkCount: 0,
        internalLinkCount: 0,
        externalLinkCount: 0,
        brokenInternalLinkCount: 0,
        inboundLinkCount: 0,
      });
    });
  });

  describe("treeCommand", () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = await mkdtemp(join(tmpdir(), "markmv-tree-cmd-"));
      await createTreeFixture(testDir);
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it("renders the ASCII tree and statistics block by default", async () => {
      const { logs, exitCode } = await captureCommandOutput(() =>
        treeCommand(testDir, { verbose: false }),
      );

      expect(exitCode).toBe(0);
      expect(logs.some((log) => log === testDir)).toBe(true);
      expect(logs.some((log) => log === "├── docs/")).toBe(true);
      expect(
        logs.some(
          (log) => log === "│   ├── guide.md (9 words, 2 links) [1 broken]",
        ),
      ).toBe(true);
      expect(
        logs.some(
          (log) => log === "│   └── orphan.md (5 words, 0 links) [orphan]",
        ),
      ).toBe(true);
      expect(
        logs.some((log) => log === "└── README.md (8 words, 2 links)"),
      ).toBe(true);
      expect(
        logs.some((log) => log.includes("📊 Markdown Tree Statistics")),
      ).toBe(true);
      expect(logs.some((log) => log.includes("📁 Markdown files: 3"))).toBe(
        true,
      );
      expect(logs.some((log) => log.includes("📝 Total words: 22"))).toBe(true);
      expect(logs.some((log) => log.includes("🔗 Internal links: 3"))).toBe(
        true,
      );
      expect(logs.some((log) => log.includes("🌐 External links: 1"))).toBe(
        true,
      );
      expect(
        logs.some((log) => log.includes("❌ Broken internal links: 1")),
      ).toBe(true);
      expect(logs.some((log) => log.includes("🔍 Orphaned files: 1"))).toBe(
        true,
      );
    });

    it("serialises the whole tree and statistics with a stable key order in json format", async () => {
      const { logs, exitCode } = await captureCommandOutput(() =>
        treeCommand(testDir, { format: "json" }),
      );

      expect(exitCode).toBe(0);

      const parsed = JSON.parse(logs.join("\n")) as {
        root: string;
        tree: {
          directories: {
            name: string;
            truncated: boolean;
            files: { name: string; orphaned: boolean }[];
          }[];
        };
        statistics: Record<string, number>;
      };

      expect(Object.keys(parsed)).toEqual(["root", "tree", "statistics"]);
      expect(parsed.root).toBe(resolve(testDir));

      const docs = parsed.tree.directories.find((dir) => dir.name === "docs");
      expect(docs?.truncated).toBe(false);
      expect(docs?.files.map((file) => file.name)).toEqual([
        "guide.md",
        "orphan.md",
      ]);
      expect(
        docs?.files.find((file) => file.name === "orphan.md")?.orphaned,
      ).toBe(true);
      expect(
        docs?.files.find((file) => file.name === "guide.md")?.orphaned,
      ).toBe(false);

      expect(Object.keys(parsed.statistics)).toEqual([
        "totalFiles",
        "totalWords",
        "totalInternalLinks",
        "totalExternalLinks",
        "brokenInternalLinks",
        "orphanedFiles",
      ]);
      expect(parsed.statistics).toEqual({
        totalFiles: 3,
        totalWords: 22,
        totalInternalLinks: 3,
        totalExternalLinks: 1,
        brokenInternalLinks: 1,
        orphanedFiles: 1,
      });
    });

    it("truncates rendering at max-depth while statistics still cover the full scan", async () => {
      const { logs, exitCode } = await captureCommandOutput(() =>
        treeCommand(testDir, { maxDepth: 1 }),
      );

      expect(exitCode).toBe(0);
      expect(logs.some((log) => log === "├── docs/ ...")).toBe(true);
      expect(logs.some((log) => log.includes("guide.md"))).toBe(false);
      expect(logs.some((log) => log.includes("orphan.md"))).toBe(false);
      expect(logs.some((log) => log.includes("📁 Markdown files: 3"))).toBe(
        true,
      );
      expect(logs.some((log) => log.includes("📝 Total words: 22"))).toBe(true);
    });

    it("fails loudly for a path that does not exist", async () => {
      const { errors, exitCode } = await captureCommandOutput(() =>
        treeCommand(join(testDir, "missing"), {}),
      );

      expect(exitCode).toBe(1);
      expect(
        errors.some((error) => error.includes("Tree analysis failed")),
      ).toBe(true);
    });

    it("rejects an invalid format option", async () => {
      const { errors, exitCode } = await captureCommandOutput(() =>
        treeCommand(testDir, { format: "svg" }),
      );

      expect(exitCode).toBe(1);
      expect(
        errors.some((error) =>
          error.includes("Invalid format: svg. Must be 'ascii' or 'json'"),
        ),
      ).toBe(true);
    });

    it("accepts a single markdown file as the scan target", async () => {
      const { logs, exitCode } = await captureCommandOutput(() =>
        treeCommand(join(testDir, "README.md"), {}),
      );

      expect(exitCode).toBe(0);
      expect(
        logs.some((log) => log === "└── README.md (8 words, 2 links) [orphan]"),
      ).toBe(true);
      expect(logs.some((log) => log.includes("📁 Markdown files: 1"))).toBe(
        true,
      );
      // With only one file scanned, nothing links to it, so it counts as an orphan
      expect(logs.some((log) => log.includes("🔍 Orphaned files: 1"))).toBe(
        true,
      );
    });

    it("treats the --json flag as an alias for --format json", async () => {
      const { logs, exitCode } = await captureCommandOutput(() =>
        treeCommand(testDir, { json: true }),
      );

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(logs.join("\n")) as {
        statistics: Record<string, number>;
      };
      expect(parsed.statistics.totalFiles).toBe(3);
    });

    it("prints scan progress in verbose mode", async () => {
      const { logs, exitCode } = await captureCommandOutput(() =>
        treeCommand(testDir, { verbose: true }),
      );

      expect(exitCode).toBe(0);
      expect(logs.some((log) => log.includes("Analysing markdown tree:"))).toBe(
        true,
      );
      expect(
        logs.some((log) =>
          log.includes(`Parsing: ${resolve(testDir, "README.md")}`),
        ),
      ).toBe(true);
      expect(
        logs.some((log) => log.includes("Skipping excluded directory:")),
      ).toBe(true);
    });
  });
});
