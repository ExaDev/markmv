import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { snapshotFiles } from "./audit-autofix.ts";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), "audit-autofix-"));
  directories.push(directory);
  const path = join(directory, "pnpm-workspace.yaml");
  writeFileSync(path, contents);

  return path;
}

describe("snapshotFiles", () => {
  it("restores the state captured at snapshot time, not an earlier one", () => {
    const path = fixture("overrides: {}\n");
    writeFileSync(path, "overrides:\n  fast-uri: 3.1.5\n");
    const restore = snapshotFiles([path]);

    writeFileSync(path, "overrides: {}\n# pruned\n");
    restore();

    expect(readFileSync(path, "utf8")).toBe("overrides:\n  fast-uri: 3.1.5\n");
  });
});
