import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { moveCommand } from "./move.js";

// Mock console methods to capture output
const mockConsoleLog = vi
  .spyOn(console, "log")
  .mockImplementation(() => undefined);
const mockConsoleError = vi
  .spyOn(console, "error")
  .mockImplementation(() => undefined);
vi.spyOn(console, "warn").mockImplementation(() => undefined);

// Mock process.exit to prevent actual process termination
const mockProcessExit = vi
  .spyOn(process, "exit")
  .mockImplementation((code?: string | number | null) => {
    throw new Error(`Process exit called with code ${String(code)}`);
  });

/** A stdin stand-in that reports being an interactive terminal */
class TtyStdin extends PassThrough {
  readonly isTTY = true;
}

/** Backup artefacts left in a directory — asserted empty after rejected batches, since a stray .backup blocks every later move of the same source */
function backupArtefacts(directory: string): string[] {
  return readdirSync(directory).filter((name) => name.endsWith(".backup"));
}

describe("Move Command", () => {
  let testDir: string;

  beforeEach(() => {
    // Create a unique test directory
    testDir = join(
      tmpdir(),
      `markmv-move-test-${String(Date.now())}-${Math.random().toString(36).slice(2, 11)}`,
    );
    mkdirSync(testDir, { recursive: true });

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up test files
    try {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Pair Mode (--pairs)", () => {
    it("should move two files in one operation, rewriting cross-links and bystander links", async () => {
      const dirA = join(testDir, "a");
      const dirB = join(testDir, "b");
      mkdirSync(dirA, { recursive: true });
      mkdirSync(dirB, { recursive: true });
      const one = join(dirA, "one.md");
      const two = join(dirB, "two.md");
      const bystander = join(testDir, "bystander.md");
      writeFileSync(one, "# One\n\n[Two](../b/two.md)\n");
      writeFileSync(two, "# Two\n\n[One](../a/one.md)\n");
      writeFileSync(
        bystander,
        "# Bystander\n\n[One](./a/one.md) and [Two](./b/two.md)\n",
      );

      const alpha = join(dirA, "Alpha.md");
      const beta = join(dirB, "Beta.md");
      await moveCommand([one, alpha, two, beta], { pairs: true });

      expect(existsSync(alpha)).toBe(true);
      expect(existsSync(beta)).toBe(true);
      expect(existsSync(one)).toBe(false);
      expect(existsSync(two)).toBe(false);
      // Links between the co-moved files point at their new sibling locations
      expect(readFileSync(alpha, "utf-8")).toContain("[Two](../b/Beta.md)");
      expect(readFileSync(beta, "utf-8")).toContain("[One](../a/Alpha.md)");
      // Inbound links from the bystander are rewritten too
      expect(readFileSync(bystander, "utf-8")).toContain("[One](./a/Alpha.md)");
      expect(readFileSync(bystander, "utf-8")).toContain("[Two](./b/Beta.md)");
    });

    it("should print the planned rewrites and change nothing in dry run", async () => {
      const dirA = join(testDir, "a");
      const dirB = join(testDir, "b");
      mkdirSync(dirA, { recursive: true });
      mkdirSync(dirB, { recursive: true });
      const one = join(dirA, "one.md");
      const two = join(dirB, "two.md");
      const bystander = join(testDir, "bystander.md");
      writeFileSync(one, "# One\n\n[Two](../b/two.md)\n");
      writeFileSync(two, "# Two\n\n[One](../a/one.md)\n");
      writeFileSync(bystander, "# Bystander\n\n[One](./a/one.md)\n");
      const oneBefore = readFileSync(one, "utf-8");
      const twoBefore = readFileSync(two, "utf-8");
      const bystanderBefore = readFileSync(bystander, "utf-8");

      const alpha = join(dirA, "Alpha.md");
      const beta = join(dirB, "Beta.md");
      await moveCommand([one, alpha, two, beta], { pairs: true, dryRun: true });

      const output = mockConsoleLog.mock.calls
        .map((args) => args.join(" "))
        .join("\n");
      expect(output).toContain("Changes that would be made:");
      expect(output).toContain("../b/two.md → ../b/Beta.md");
      expect(output).toContain("./a/one.md → ./a/Alpha.md");
      expect(existsSync(one)).toBe(true);
      expect(existsSync(two)).toBe(true);
      expect(existsSync(alpha)).toBe(false);
      expect(existsSync(beta)).toBe(false);
      // Byte equality, not just existence: a dry run must not apply the link-rewrite phase any more than the rename phase
      expect(readFileSync(one, "utf-8")).toBe(oneBefore);
      expect(readFileSync(two, "utf-8")).toBe(twoBefore);
      expect(readFileSync(bystander, "utf-8")).toBe(bystanderBefore);
    });

    it("should exit when given no arguments", async () => {
      await expect(moveCommand([], { pairs: true })).rejects.toThrow(
        "Process exit called with code 1",
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        "❌ Error: --pairs requires at least one source and destination pair (an even number of arguments)",
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it("should exit when given an odd number of arguments", async () => {
      await expect(
        moveCommand(["a.md", "b.md", "c.md"], { pairs: true }),
      ).rejects.toThrow("Process exit called with code 1");

      expect(mockConsoleError).toHaveBeenCalledWith(
        "❌ Error: --pairs expects an even number of arguments (alternating source and destination), got 3",
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it("should exit listing a source that appears in more than one pair", async () => {
      const a = join(testDir, "a.md");
      const b = join(testDir, "b.md");
      const c = join(testDir, "c.md");
      writeFileSync(a, "# A\n");
      writeFileSync(b, "# B\n");
      writeFileSync(c, "# C\n");

      await expect(moveCommand([a, b, a, c], { pairs: true })).rejects.toThrow(
        "Process exit called with code 1",
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        "❌ Error: each source may appear in only one pair; duplicated sources:",
      );
      expect(mockConsoleError).toHaveBeenCalledWith(`   ${resolve(a)}`);
    });

    it("should exit listing every source that does not exist", async () => {
      const existing = join(testDir, "existing.md");
      writeFileSync(existing, "# Existing\n");
      const missingOne = join(testDir, "missing-one.md");
      const missingTwo = join(testDir, "missing-two.md");

      await expect(
        moveCommand(
          [
            existing,
            join(testDir, "renamed.md"),
            missingOne,
            join(testDir, "renamed-one.md"),
            missingTwo,
            join(testDir, "renamed-two.md"),
          ],
          { pairs: true },
        ),
      ).rejects.toThrow("Process exit called with code 1");

      expect(mockConsoleError).toHaveBeenCalledWith(
        "❌ Error: pair sources must be existing files:",
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        `   ${resolve(missingOne)}`,
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        `   ${resolve(missingTwo)}`,
      );
    });

    it("should exit listing a directory source", async () => {
      const dir = join(testDir, "folder");
      mkdirSync(dir, { recursive: true });
      const file = join(testDir, "file.md");
      writeFileSync(file, "# File\n");

      await expect(
        moveCommand([dir, join(testDir, "x.md"), file, join(testDir, "y.md")], {
          pairs: true,
        }),
      ).rejects.toThrow("Process exit called with code 1");

      expect(mockConsoleError).toHaveBeenCalledWith(
        "❌ Error: pair sources must be existing files:",
      );
      expect(mockConsoleError).toHaveBeenCalledWith(`   ${resolve(dir)}`);
    });

    it("should exit naming the destination when it already exists, in dry run and real run alike", async () => {
      const a = join(testDir, "a.md");
      const dest = join(testDir, "dest.md");
      writeFileSync(a, "# A\n");
      writeFileSync(dest, "# Dest\n");

      await expect(
        moveCommand([a, dest], { pairs: true, dryRun: true }),
      ).rejects.toThrow("Process exit called with code 1");
      expect(mockConsoleError).toHaveBeenCalledWith(
        `  Destination file already exists: ${dest} (while moving ${a})`,
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      // The real run is rejected the same way, before any rename or backup is attempted
      await expect(moveCommand([a, dest], { pairs: true })).rejects.toThrow(
        "Process exit called with code 1",
      );
      expect(readFileSync(a, "utf-8")).toBe("# A\n");
      expect(readFileSync(dest, "utf-8")).toBe("# Dest\n");
      expect(backupArtefacts(testDir)).toEqual([]);
    });

    it("should exit when two pairs share a destination", async () => {
      const a = join(testDir, "a.md");
      const b = join(testDir, "b.md");
      const x = join(testDir, "x.md");
      writeFileSync(a, "# A\n");
      writeFileSync(b, "# B\n");

      await expect(moveCommand([a, x, b, x], { pairs: true })).rejects.toThrow(
        "Process exit called with code 1",
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        `  Multiple moves target the same destination: ${x} (from ${a}, ${b})`,
      );
      expect(readFileSync(a, "utf-8")).toBe("# A\n");
      expect(readFileSync(b, "utf-8")).toBe("# B\n");
      expect(existsSync(x)).toBe(false);
      expect(backupArtefacts(testDir)).toEqual([]);
    });

    it("should exit listing the pairs when they form a rename cycle", async () => {
      const a = join(testDir, "a.md");
      const b = join(testDir, "b.md");
      writeFileSync(a, "# A content\n");
      writeFileSync(b, "# B content\n");

      await expect(moveCommand([a, b, b, a], { pairs: true })).rejects.toThrow(
        "Process exit called with code 1",
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        "  These moves form a rename cycle, so no execution order can free every destination:",
      );
      expect(mockConsoleError).toHaveBeenCalledWith(`    ${a} → ${b}`);
      expect(mockConsoleError).toHaveBeenCalledWith(`    ${b} → ${a}`);
      expect(readFileSync(a, "utf-8")).toBe("# A content\n");
      expect(readFileSync(b, "utf-8")).toBe("# B content\n");
      expect(backupArtefacts(testDir)).toEqual([]);
    });

    it("should move a chained rename in any argument order, rewriting bystander links to the final names", async () => {
      const makeFixture = (name: string) => {
        const directory = join(testDir, name);
        mkdirSync(directory, { recursive: true });
        const a = join(directory, "a.md");
        const b = join(directory, "b.md");
        const index = join(directory, "index.md");
        writeFileSync(a, "# A\n");
        writeFileSync(b, "# B\n");
        writeFileSync(index, "# Index\n[a](./a.md) [b](./b.md)\n");

        return { a, b, c: join(directory, "c.md"), index };
      };

      // The consumer is listed first: a moves onto b's old name before b itself has vacated it
      const consumerFirst = makeFixture("consumer-first");
      await moveCommand(
        [consumerFirst.a, consumerFirst.b, consumerFirst.b, consumerFirst.c],
        { pairs: true },
      );
      expect(readFileSync(consumerFirst.b, "utf-8")).toBe("# A\n");
      expect(readFileSync(consumerFirst.c, "utf-8")).toBe("# B\n");
      expect(readFileSync(consumerFirst.index, "utf-8")).toBe(
        "# Index\n[a](./b.md) [b](./c.md)\n",
      );

      // The identical relocations listed vacate-first give the identical result
      const vacateFirst = makeFixture("vacate-first");
      await moveCommand(
        [vacateFirst.b, vacateFirst.c, vacateFirst.a, vacateFirst.b],
        { pairs: true },
      );
      expect(readFileSync(vacateFirst.index, "utf-8")).toBe(
        "# Index\n[a](./b.md) [b](./c.md)\n",
      );
    });

    it("should join the source basename when a pair destination is an existing directory", async () => {
      const sub = join(testDir, "sub");
      mkdirSync(sub, { recursive: true });
      const a = join(testDir, "a.md");
      const bystander = join(testDir, "by.md");
      writeFileSync(a, "# A\n");
      writeFileSync(bystander, "[A](./a.md)\n");

      await moveCommand([a, sub], { pairs: true, verbose: true });

      expect(existsSync(join(sub, "a.md"))).toBe(true);
      expect(existsSync(a)).toBe(false);
      expect(readFileSync(bystander, "utf-8")).toBe("[A](./sub/a.md)\n");
      // The verbose plan names the resolved destination, not the directory as typed
      const output = mockConsoleLog.mock.calls
        .map((args) => args.join(" "))
        .join("\n");
      expect(output).toContain(`→ ${join(sub, "a.md")}`);
    });

    it("should exit when a pair destination is empty", async () => {
      const nested = join(testDir, "nested");
      mkdirSync(nested, { recursive: true });
      const a = join(nested, "a.md");
      writeFileSync(a, "# A\n");

      await expect(moveCommand([a, ""], { pairs: true })).rejects.toThrow(
        "Process exit called with code 1",
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        "❌ Error: pair destinations must be non-empty paths; empty destination for:",
      );
      expect(mockConsoleError).toHaveBeenCalledWith(`   ${resolve(a)}`);
      // The file stays where it was instead of silently relocating to the cwd root
      expect(readFileSync(a, "utf-8")).toBe("# A\n");
    });

    it("should resolve relative sources and destinations against the cwd", async () => {
      writeFileSync(join(testDir, "rel-a.md"), "# A\n");
      writeFileSync(join(testDir, "rel-index.md"), "[A](./rel-a.md)\n");

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        await moveCommand(["rel-a.md", "rel-b.md"], { pairs: true });
      } finally {
        process.chdir(originalCwd);
      }

      expect(existsSync(join(testDir, "rel-b.md"))).toBe(true);
      expect(existsSync(join(testDir, "rel-a.md"))).toBe(false);
      expect(readFileSync(join(testDir, "rel-index.md"), "utf-8")).toBe(
        "[A](./rel-b.md)\n",
      );
    });
  });

  describe("Pair Mode (--pairs-file)", () => {
    it("should move pairs from a file, including a path containing a space", async () => {
      const sourceWithSpace = join(testDir, "my note.md");
      const dest = join(testDir, "my-note.md");
      const other = join(testDir, "other.md");
      writeFileSync(sourceWithSpace, "# My note\n\n[Other](./other.md)\n");
      writeFileSync(other, "# Other\n");
      const pairsFile = join(testDir, "pairs.txt");
      writeFileSync(
        pairsFile,
        `${sourceWithSpace}\t${dest}\n${other}\t${join(testDir, "nested", "other.md")}\n`,
      );

      await moveCommand([], { pairsFile });

      expect(existsSync(dest)).toBe(true);
      expect(existsSync(sourceWithSpace)).toBe(false);
      expect(existsSync(join(testDir, "nested", "other.md"))).toBe(true);
      // The link to the co-moved other.md is rewritten to its new sibling location
      expect(readFileSync(dest, "utf-8")).toContain(
        "[Other](./nested/other.md)",
      );
    });

    it("should exit naming the line when the file has a malformed line", async () => {
      const pairsFile = join(testDir, "pairs.txt");
      writeFileSync(
        pairsFile,
        `${join(testDir, "a.md")}\t${join(testDir, "b.md")}\nno tab here\n`,
      );

      await expect(moveCommand([], { pairsFile })).rejects.toThrow(
        "Process exit called with code 1",
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        "❌ Error: pairs file line 2 must contain a source and destination separated by a tab",
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it("should read pairs from stdin when the path is '-'", async () => {
      const a = join(testDir, "a.md");
      const b = join(testDir, "b.md");
      writeFileSync(a, "# A\n");

      const stdin = new PassThrough();
      const stdinSpy = vi
        .spyOn(process, "stdin", "get")
        .mockReturnValue(stdin as unknown as typeof process.stdin);
      try {
        stdin.write(`${a}\t${b}\n`);
        stdin.end();
        await moveCommand([], { pairsFile: "-" });
      } finally {
        stdinSpy.mockRestore();
      }

      expect(existsSync(b)).toBe(true);
      expect(existsSync(a)).toBe(false);
    });

    it("should exit when '-' is given but stdin is a TTY", async () => {
      const ttyStdin = new TtyStdin();
      const stdinSpy = vi
        .spyOn(process, "stdin", "get")
        .mockReturnValue(ttyStdin as unknown as typeof process.stdin);
      try {
        await expect(moveCommand([], { pairsFile: "-" })).rejects.toThrow(
          "Process exit called with code 1",
        );

        expect(mockConsoleError).toHaveBeenCalledWith(
          "❌ Error: --pairs-file - expects piped input",
        );
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      } finally {
        stdinSpy.mockRestore();
        ttyStdin.destroy();
      }
    });

    it("should exit when the input contains no pairs", async () => {
      const pairsFile = join(testDir, "pairs.txt");
      writeFileSync(pairsFile, "\n   \n");

      await expect(moveCommand([], { pairsFile })).rejects.toThrow(
        "Process exit called with code 1",
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        `❌ Error: no source and destination pairs found in ${pairsFile}`,
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it("should exit with the read error and usage when the pairs file does not exist", async () => {
      const missing = join(testDir, "no-such-pairs.txt");

      await expect(moveCommand([], { pairsFile: missing })).rejects.toThrow(
        "Process exit called with code 1",
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("ENOENT"),
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        "Usage: markmv move --pairs-file <path> ('-' reads pairs from stdin)",
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe("Pair Mode Mutual Exclusion", () => {
    it("should exit when --pairs and --pairs-file are combined", async () => {
      await expect(
        moveCommand(["a.md", "b.md"], { pairs: true, pairsFile: "pairs.txt" }),
      ).rejects.toThrow("Process exit called with code 1");

      expect(mockConsoleError).toHaveBeenCalledWith(
        "❌ Error: --pairs and --pairs-file are mutually exclusive",
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it("should exit when --pairs-file is given positional arguments", async () => {
      await expect(
        moveCommand(["a.md"], { pairsFile: "pairs.txt" }),
      ).rejects.toThrow("Process exit called with code 1");

      expect(mockConsoleError).toHaveBeenCalledWith(
        "❌ Error: --pairs-file reads pairs from a file, so positional arguments are not allowed",
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe("Pair Mode Obsidian", () => {
    it("should rewrite a basename-resolved wikilink when a paired move renames the note", async () => {
      // The motivating scenario: one folder per entity with an index named after the folder, renamed to README.md
      const orgDir = join(testDir, "organisations", "acme");
      mkdirSync(orgDir, { recursive: true });
      const acmeIndex = join(orgDir, "acme.md");
      writeFileSync(acmeIndex, "# Acme\n");
      const notes = join(orgDir, "notes.md");
      writeFileSync(notes, "See [[acme]].\n");

      await moveCommand([acmeIndex, join(orgDir, "README.md")], {
        pairs: true,
        obsidian: true,
      });

      expect(existsSync(join(orgDir, "README.md"))).toBe(true);
      expect(existsSync(acmeIndex)).toBe(false);
      const updatedNotes = readFileSync(notes, "utf-8");
      expect(updatedNotes).toContain("[[README]]");
      expect(updatedNotes).not.toContain("[[acme]]");
    });
  });
});
