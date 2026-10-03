/** The part of semantic-release's notes generator that the release notes test calls; the package ships no declarations. */
declare module "@semantic-release/release-notes-generator" {
  export function generateNotes(
    pluginConfig: { preset: string },
    context: {
      cwd: string;
      options: { repositoryUrl: string };
      lastRelease: { gitTag: string };
      nextRelease: { gitTag: string; version: string };
      commits: readonly {
        hash: string;
        message: string;
        committerDate: string;
      }[];
    },
  ): Promise<string>;
}
