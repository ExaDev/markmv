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
import { moveCommand, parsePairsInput } from "./move.js";

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

  describe("Argument Validation", () => {
    it("should exit with error when fewer than 2 arguments provided", async () => {
      await expect(moveCommand([], {})).rejects.toThrow(
        "Process exit called with code 1",
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        "❌ Error: At least 2 arguments required (source(s) and destination)",
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it("should exit with error when only 1 argument provided", async () => {
      await expect(moveCommand(["single-arg"], {})).rejects.toThrow(
        "Process exit called with code 1",
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        "❌ Error: At least 2 arguments required (source(s) and destination)",
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it("should show usage examples when insufficient arguments provided", async () => {
      await expect(moveCommand(["single"], {})).rejects.toThrow(
        "Process exit called with code 1",
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        "Usage: markmv move <sources...> <destination>",
      );
      expect(mockConsoleError).toHaveBeenCalledWith("Examples:");
      expect(mockConsoleError).toHaveBeenCalledWith(
        "  markmv move file.md ./target/",
      );
    });
  });

  describe("Source Pattern Expansion", () => {
    it("should handle direct file paths", async () => {
      // Create test files
      const sourceFile = join(testDir, "source.md");
      const destFile = join(testDir, "dest.md");

      writeFileSync(sourceFile, "# Test Content\n\nSome content here.");

      await moveCommand([sourceFile, destFile], {
        dryRun: true,
        verbose: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("🔍 Expanding pattern:"),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("✅ Direct file:"),
      );
    });

    it("should exit when no files found", async () => {
      const nonExistentFile = join(testDir, "nonexistent.md");
      const destFile = join(testDir, "dest.md");

      await expect(
        moveCommand([nonExistentFile, destFile], {}),
      ).rejects.toThrow("Process exit called with code 1");

      expect(mockConsoleError).toHaveBeenCalledWith(
        "❌ No files found matching the specified patterns",
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it("should accept non-markdown files in direct paths", async () => {
      const txtFile = join(testDir, "test.txt");
      const destFile = join(testDir, "dest.txt");

      writeFileSync(txtFile, "Some text content");

      await moveCommand([txtFile, destFile], { dryRun: true, verbose: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("✅ Direct file:"),
      );
      expect(mockConsoleError).not.toHaveBeenCalledWith(
        expect.stringContaining("❌"),
      );
    });

    it("should handle glob patterns", async () => {
      // Create test files
      const file1 = join(testDir, "file1.md");
      const file2 = join(testDir, "file2.md");
      const destDir = join(testDir, "dest/");

      writeFileSync(file1, "# File 1");
      writeFileSync(file2, "# File 2");
      mkdirSync(destDir, { recursive: true });

      // Use forward slashes for glob patterns to ensure cross-platform compatibility
      const globPattern = join(testDir, "*.md").replace(/\\/g, "/");

      await moveCommand([globPattern, destDir], {
        dryRun: true,
        verbose: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("📁 Found"),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("file(s) matching pattern"),
      );
    });
  });

  describe("Destination Validation", () => {
    it("should require directory destination for multiple files", async () => {
      const file1 = join(testDir, "file1.md");
      const file2 = join(testDir, "file2.md");
      const destFile = join(testDir, "dest.md");

      writeFileSync(file1, "# File 1");
      writeFileSync(file2, "# File 2");

      await expect(moveCommand([file1, file2, destFile], {})).rejects.toThrow(
        "Process exit called with code 1",
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        "❌ Error: When moving multiple files, destination must be a directory",
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it("should accept directory destination for multiple files", async () => {
      const file1 = join(testDir, "file1.md");
      const file2 = join(testDir, "file2.md");
      const destDir = join(testDir, "dest/");

      writeFileSync(file1, "# File 1");
      writeFileSync(file2, "# File 2");
      mkdirSync(destDir, { recursive: true });

      await moveCommand([file1, file2, destDir], { dryRun: true });

      // Should not throw an error
      expect(mockConsoleError).not.toHaveBeenCalledWith(
        expect.stringContaining("When moving multiple files"),
      );
    });
  });

  describe("Verbose Output", () => {
    it("should show detailed information in verbose mode", async () => {
      const sourceFile = join(testDir, "source.md");
      const destFile = join(testDir, "dest.md");

      writeFileSync(sourceFile, "# Test Content");

      await moveCommand([sourceFile, destFile], {
        dryRun: true,
        verbose: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("🎯 Destination:"),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("📁 Found"),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("🔍 Dry run mode"),
      );
    });

    it("should not show extra details in non-verbose mode", async () => {
      const sourceFile = join(testDir, "source.md");
      const destFile = join(testDir, "dest.md");

      writeFileSync(sourceFile, "# Test Content");

      await moveCommand([sourceFile, destFile], {
        dryRun: true,
        verbose: false,
      });

      expect(mockConsoleLog).not.toHaveBeenCalledWith(
        expect.stringContaining("🎯 Destination:"),
      );
      expect(mockConsoleLog).not.toHaveBeenCalledWith(
        expect.stringContaining("📁 Found"),
      );
    });
  });

  describe("Dry Run Mode", () => {
    it("should show preview of changes in dry run mode", async () => {
      const sourceFile = join(testDir, "source.md");
      const destFile = join(testDir, "dest.md");

      writeFileSync(sourceFile, "# Test Content\n\n[Link](./other.md)");

      await moveCommand([sourceFile, destFile], { dryRun: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("📋 Changes that would be made:"),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("📊 Summary:"),
      );
    });

    it("should show files that would be created in dry run", async () => {
      const sourceFile = join(testDir, "source.md");
      const destFile = join(testDir, "dest.md");

      writeFileSync(sourceFile, "# Test Content");

      await moveCommand([sourceFile, destFile], { dryRun: true });

      // Look for either "would be created" or "would be deleted" sections
      const logCalls = mockConsoleLog.mock.calls.map(
        (call: unknown[]) => call[0],
      );
      const hasCreatedSection = logCalls.some(
        (log) =>
          typeof log === "string" &&
          log.includes("✅ Files that would be created:"),
      );
      const hasDeletedSection = logCalls.some(
        (log) =>
          typeof log === "string" &&
          log.includes("🗑️  Files that would be deleted:"),
      );

      expect(hasCreatedSection || hasDeletedSection).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle file operation errors gracefully", async () => {
      const sourceFile = join(testDir, "source.md");
      // Use a platform-appropriate invalid path
      const invalidDest =
        process.platform === "win32"
          ? "Z:\\invalid\\path\\that\\cannot\\be\\created.md"
          : "/invalid/path/that/cannot/be/created.md";

      writeFileSync(sourceFile, "# Test Content");

      try {
        await moveCommand([sourceFile, invalidDest], { dryRun: false });
        // If it doesn't throw, check that an error was logged
        expect(mockConsoleError).toHaveBeenCalled();
      } catch (error) {
        // If it throws, it should be the expected error
        expect(error).toEqual(
          expect.objectContaining({
            message: expect.stringContaining("Process exit called with code 1"),
          }),
        );
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      }
    }, 10000); // Increase timeout to 10 seconds

    it("should handle unexpected errors", async () => {
      // We'll use a non-existent glob pattern that should cause an error in expansion
      const badPattern = "/nonexistent/path/**/*.md";
      const destFile = join(testDir, "dest.md");

      await expect(moveCommand([badPattern, destFile], {})).rejects.toThrow(
        "Process exit called with code 1",
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        "❌ No files found matching the specified patterns",
      );
    });
  });

  describe("Success Cases", () => {
    it("should complete successfully for valid single file move", async () => {
      const sourceFile = join(testDir, "source.md");
      const destFile = join(testDir, "dest.md");

      writeFileSync(sourceFile, "# Test Content");

      await moveCommand([sourceFile, destFile], { dryRun: true });

      // Should not throw any errors
      expect(mockConsoleError).not.toHaveBeenCalledWith(
        expect.stringContaining("❌"),
      );
    });

    it("should handle batch moves to directory", async () => {
      const file1 = join(testDir, "file1.md");
      const file2 = join(testDir, "file2.md");
      const destDir = join(testDir, "dest/");

      writeFileSync(file1, "# File 1");
      writeFileSync(file2, "# File 2");
      mkdirSync(destDir, { recursive: true });

      await moveCommand([file1, file2, destDir], { dryRun: true });

      // Should not throw any errors
      expect(mockConsoleError).not.toHaveBeenCalledWith(
        expect.stringContaining("❌"),
      );
    });

    it("should move a linked image and update the markdown file that references it", async () => {
      // Reproduces https://github.com/ExaDev/markmv/issues/71
      const imageFile = join(testDir, "image.png");
      const renamedImageFile = join(testDir, "image2.png");
      const readmeFile = join(testDir, "README.md");

      writeFileSync(imageFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      writeFileSync(readmeFile, "![](image.png)\n");

      await moveCommand([imageFile, renamedImageFile], {});

      expect(mockConsoleError).not.toHaveBeenCalledWith(
        expect.stringContaining("❌"),
      );
      expect(existsSync(renamedImageFile)).toBe(true);
      expect(existsSync(imageFile)).toBe(false);

      const updatedReadme = readFileSync(readmeFile, "utf-8");
      expect(updatedReadme).toContain("![](./image2.png)");
    });
  });

  describe("Link Validation", () => {
    it("should validate link integrity in verbose mode on a real move", async () => {
      const sourceFile = join(testDir, "source.md");
      const destFile = join(testDir, "dest.md");
      const bystanderFile = join(testDir, "bystander.md");

      writeFileSync(sourceFile, "# Test Content\n\n[Link](./bystander.md)");
      writeFileSync(bystanderFile, "# Bystander\n\n[Back](./source.md)");

      await moveCommand([sourceFile, destFile], { verbose: true });

      // Non-dry-run verbose moves run post-operation link validation over the result
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Validating link integrity"),
      );
      expect(existsSync(destFile)).toBe(true);
      const bystanderContent = readFileSync(bystanderFile, "utf-8");
      expect(bystanderContent).toContain("./dest.md");
    });

    it("should display warnings when the operation reports them", async () => {
      const sourceFile = join(testDir, "source.md");
      const destFile = join(testDir, "dest.md");
      writeFileSync(sourceFile, "# Test Content");

      const { FileOperations } = await import("../core/file-operations.js");
      const originalMove = Object.getOwnPropertyDescriptor(
        FileOperations.prototype,
        "moveFile",
      )?.value as typeof FileOperations.prototype.moveFile;
      const moveSpy = vi
        .spyOn(FileOperations.prototype, "moveFile")
        .mockImplementation(function (
          this: InstanceType<typeof FileOperations>,
          ...args
        ) {
          const promise = originalMove.apply(this, args);
          return promise.then((result) => ({
            ...result,
            warnings: ["stubbed warning"],
          }));
        });

      try {
        await moveCommand([sourceFile, destFile], { dryRun: true });
      } finally {
        moveSpy.mockRestore();
      }

      const output = mockConsoleLog.mock.calls
        .map((call: unknown[]) => call[0])
        .join("\n");
      expect(output).toContain("⚠️  Warnings:");
      expect(output).toContain("stubbed warning");
    });
  });

  describe("Parse Failure Reporting", () => {
    it("should aggregate parse failures in the summary and exit non-zero", async () => {
      const sourceFile = join(testDir, "source.md");
      const destDir = join(testDir, "nested");
      const bystanderFile = join(testDir, "bystander.md");
      writeFileSync(sourceFile, "# Source\n");
      writeFileSync(bystanderFile, "# Bystander\n\n[link](./source.md)\n");

      const { LinkParser } = await import("../core/link-parser.js");
      const originalParse = Object.getOwnPropertyDescriptor(
        LinkParser.prototype,
        "parseFile",
      )?.value as typeof LinkParser.prototype.parseFile;
      const parseSpy = vi
        .spyOn(LinkParser.prototype, "parseFile")
        .mockImplementation(function (
          this: InstanceType<typeof LinkParser>,
          filePath: string,
        ) {
          if (filePath === bystanderFile) {
            return Promise.reject(new Error("parser exploded"));
          }
          return originalParse.call(this, filePath);
        });

      process.exitCode = 0;
      try {
        await moveCommand([sourceFile, destDir + "/"], {
          dryRun: true,
          verbose: true,
        });
      } finally {
        parseSpy.mockRestore();
      }

      expect(process.exitCode).toBe(1);

      const output = mockConsoleLog.mock.calls
        .map((args) => args.join(" "))
        .join("\n");
      expect(output).toContain("Parse Failures (1)");
      expect(output).toContain(bystanderFile);
      process.exitCode = 0;
    });
  });

  describe("Summary Reporting", () => {
    let nestedDir: string;
    let alphaFile: string;
    let keepFile: string;

    beforeEach(() => {
      nestedDir = join(testDir, "nested");
      alphaFile = join(testDir, "Alpha.md");
      keepFile = join(testDir, "Keep.md");
      writeFileSync(alphaFile, "# Alpha\n\n[Keep](./Keep.md)\n");
      writeFileSync(keepFile, "# Keep\n");
    });

    it("should attribute dry-run link updates to the files that carry them", async () => {
      await moveCommand([alphaFile, nestedDir + "/"], { dryRun: true });

      const output = mockConsoleLog.mock.calls
        .map((args) => args.join(" "))
        .join("\n");
      // The only link update lives inside the moved file itself; the summary must not claim updates happened "in 0 file(s)"
      expect(output).toContain("1 link(s) would be updated across 1 file(s)");
      expect(output).not.toContain("in 0 file(s)");
    });

    it("should list per-link rewrites in dry-run output by default", async () => {
      await moveCommand([alphaFile, nestedDir + "/"], { dryRun: true });

      const output = mockConsoleLog.mock.calls
        .map((args) => args.join(" "))
        .join("\n");
      expect(output).toContain("./Keep.md → ../Keep.md");
    });

    it("should report the update count on a real run even with no bystander changes", async () => {
      await moveCommand([alphaFile, nestedDir + "/"], {});

      const output = mockConsoleLog.mock.calls
        .map((args) => args.join(" "))
        .join("\n");
      expect(output).toContain("Move operation completed successfully!");
      expect(output).toContain("Updated 1 link(s) across 1 file(s)");
    });

    it("should say when no links needed updating", async () => {
      writeFileSync(alphaFile, "# Alpha\n\nNo links here.\n");
      await moveCommand([alphaFile, nestedDir + "/"], {});

      const output = mockConsoleLog.mock.calls
        .map((args) => args.join(" "))
        .join("\n");
      expect(output).toContain("No links needed updating");
    });
  });

  describe("Directory Sources", () => {
    it("should move a directory as a unit into a non-existent destination, rewriting links", async () => {
      const srcDir = join(testDir, "notes");
      const nestedDir = join(srcDir, "sub");
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(
        join(nestedDir, "Tailscale.md"),
        "# Tailscale\n\n[Other](../Other.md)\n",
      );
      writeFileSync(join(srcDir, "Other.md"), "# Other\n");
      const bystander = join(testDir, "Home.md");
      writeFileSync(bystander, "[Tailscale](./notes/sub/Tailscale.md)\n");

      const destDir = join(testDir, "resources", "networking");

      await moveCommand([srcDir, destDir], {});

      // The directory tree moves as a unit, preserving structure, destination auto-created
      expect(existsSync(join(destDir, "sub", "Tailscale.md"))).toBe(true);
      expect(existsSync(join(destDir, "Other.md"))).toBe(true);
      // The vacated source directory is removed once empty
      expect(existsSync(srcDir)).toBe(false);
      // Links inside the moved tree stay valid: the target moved along, so the relative hop is unchanged
      expect(
        readFileSync(join(destDir, "sub", "Tailscale.md"), "utf-8"),
      ).toContain("[Other](../Other.md)");
      // Bystander links are rewritten to the new location
      expect(readFileSync(bystander, "utf-8")).toContain(
        "[Tailscale](./resources/networking/sub/Tailscale.md)",
      );
    });

    it("should move a directory as a unit in dry-run without touching the tree", async () => {
      const srcDir = join(testDir, "notes");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "Note.md"), "# Note\n");
      const destDir = join(testDir, "archive", "old-notes");

      await moveCommand([srcDir, destDir], { dryRun: true });

      expect(existsSync(join(srcDir, "Note.md"))).toBe(true);
      expect(existsSync(destDir)).toBe(false);
      const output = mockConsoleLog.mock.calls
        .map((args) => args.join(" "))
        .join("\n");
      expect(output).toContain("Note.md");
    });

    it("should move non-markdown assets inside a directory too", async () => {
      const srcDir = join(testDir, "assets");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "diagram.png"), "fake png bytes");
      writeFileSync(join(srcDir, "doc.md"), "![Diagram](./diagram.png)\n");
      const destDir = join(testDir, "moved-assets");

      await moveCommand([srcDir, destDir], {});

      expect(existsSync(join(destDir, "diagram.png"))).toBe(true);
      expect(existsSync(join(destDir, "doc.md"))).toBe(true);
      expect(readFileSync(join(destDir, "doc.md"), "utf-8")).toContain(
        "![Diagram](./diagram.png)",
      );
    });

    it("should combine directory and file sources into one destination", async () => {
      const srcDir = join(testDir, "notes");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "InDir.md"), "# In dir\n");
      const looseFile = join(testDir, "Loose.md");
      writeFileSync(looseFile, "# Loose\n");
      const destDir = join(testDir, "combined");

      await moveCommand([srcDir, looseFile, destDir], {});

      expect(existsSync(join(destDir, "InDir.md"))).toBe(true);
      expect(existsSync(join(destDir, "Loose.md"))).toBe(true);
    });
  });

  describe("parsePairsInput", () => {
    it("should parse multiple pairs, preserving spaces inside paths", () => {
      const pairs = parsePairsInput(
        "a/one.md\ta/Alpha.md\nmy notes/two.md\tmy notes/Beta.md\n",
      );

      expect(pairs).toEqual([
        { source: "a/one.md", destination: "a/Alpha.md" },
        { source: "my notes/two.md", destination: "my notes/Beta.md" },
      ]);
    });

    it("should skip blank and whitespace-only lines", () => {
      const pairs = parsePairsInput("\n   \na.md\tb.md\n\t\n");

      expect(pairs).toEqual([{ source: "a.md", destination: "b.md" }]);
    });

    it("should tolerate CRLF line endings through trimming", () => {
      const pairs = parsePairsInput("a.md\tb.md\r\nc.md\td.md\r\n");

      expect(pairs).toEqual([
        { source: "a.md", destination: "b.md" },
        { source: "c.md", destination: "d.md" },
      ]);
    });

    it("should trim padding around both fields", () => {
      const pairs = parsePairsInput("  a.md \t  b.md  \n");

      expect(pairs).toEqual([{ source: "a.md", destination: "b.md" }]);
    });

    it("should throw with the 1-based line number for a line without a tab", () => {
      expect(() => parsePairsInput("a.md\tb.md\njust-one-field\n")).toThrow(
        "pairs file line 2 must contain a source and destination separated by a tab",
      );
    });

    it("should throw for a line whose destination field is missing", () => {
      // The trailing tab is whitespace, so trimming removes it and the line parses as tab-less
      expect(() => parsePairsInput("a.md\t\n")).toThrow(
        "pairs file line 1 must contain a source and destination separated by a tab",
      );
    });
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
      const ttyStdin = Object.assign(new PassThrough(), { isTTY: true });
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
