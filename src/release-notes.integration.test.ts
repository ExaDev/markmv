import { describe, expect, it } from "vitest";
import { generateNotes } from "@semantic-release/release-notes-generator";

/**
 * Renders release notes through the same preset semantic-release is configured with. The preset
 * and the changelog writer that semantic-release's notes generator loads have to agree on a major
 * version, and a mismatch only otherwise shows up when a release runs.
 */
describe("release notes", () => {
  it("renders a release with the configured conventional commits preset", async () => {
    const notes = await generateNotes(
      { preset: "conventionalcommits" },
      {
        cwd: process.cwd(),
        options: { repositoryUrl: "https://github.com/ExaDev/markmv.git" },
        lastRelease: { gitTag: "v1.0.0" },
        nextRelease: { gitTag: "v1.1.0", version: "1.1.0" },
        commits: [
          {
            hash: "abc1234abc1234abc1234abc1234abc1234abc12",
            message: "feat(cli): start the servers with markmv api",
            committerDate: new Date().toISOString(),
          },
        ],
      },
    );

    expect(notes).toContain("start the servers with markmv api");
  });
});
