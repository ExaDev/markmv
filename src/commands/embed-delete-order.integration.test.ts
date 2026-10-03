import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type * as FsPromises from "node:fs/promises";
import { embedCommand } from "./embed.js";

const filesystemCalls = vi.hoisted(() => ({ order: [] as string[] }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();

  return {
    ...actual,
    readdir: (async (...args: Parameters<typeof actual.readdir>) => {
      filesystemCalls.order.push("scan");

      return actual.readdir(...args);
    }) as typeof actual.readdir,
    stat: (async (...args: Parameters<typeof actual.stat>) => {
      filesystemCalls.order.push("scan");

      return actual.stat(...args);
    }) as typeof actual.stat,
    unlink: (async (...args: Parameters<typeof actual.unlink>) => {
      filesystemCalls.order.push("unlink");

      return actual.unlink(...args);
    }) as typeof actual.unlink,
  };
});

/** Bytes of a minimal valid 1x1 PNG, so the images are real. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Enough images that every deletion task is still scanning when the first one finishes. */
const IMAGE_COUNT = 40;

describe("Embed command deletion order", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "markmv-embed-order-"));
    filesystemCalls.order.length = 0;
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("finishes scanning the tree for every image before it deletes any", async () => {
    const names = Array.from(
      { length: IMAGE_COUNT },
      (_, index) => `image-${String(index)}`,
    );
    await Promise.all(
      names.flatMap((name) => [
        writeFile(join(testDir, `${name}.md`), `![${name}](${name}.png)\n`),
        writeFile(join(testDir, `${name}.png`), PNG_BYTES),
      ]),
    );
    filesystemCalls.order.length = 0;

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await embedCommand([join(testDir, "*.md").replace(/\\/g, "/")], {});
    log.mockRestore();

    const firstUnlink = filesystemCalls.order.indexOf("unlink");
    const lastScan = filesystemCalls.order.lastIndexOf("scan");

    expect(firstUnlink).toBeGreaterThanOrEqual(0);
    expect(lastScan).toBeLessThan(firstUnlink);
  });
});
