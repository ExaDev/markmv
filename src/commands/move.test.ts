import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});
