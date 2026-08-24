type ReleaseLevel = "major" | "minor" | "patch" | false;

interface CommitType {
  readonly type: string;
  readonly release: ReleaseLevel;
  readonly section: string;
}

/**
 * Single source of truth for the conventional-commit types this project uses. commitlint's allowed type-enum (commitlint.config.ts imports this) and both the commit-analyzer's releaseRules and the release-notes generator's per-type sections below derive from it, so a type can't trigger a release without also being accepted by commit-msg validation, or the reverse.
 *
 * Defined here rather than in a sibling module: semantic-release loads this file via cosmiconfig, which transpiles only this one file, so a separate .ts module would not resolve from it. commitlint's jiti loader has no such limit, so it imports commitTypes from here.
 */
export const commitTypes: readonly CommitType[] = [
  { type: "feat", release: "minor", section: "Features" },
  { type: "fix", release: "patch", section: "Bug Fixes" },
  { type: "docs", release: "patch", section: "Documentation" },
  { type: "style", release: "patch", section: "Styles" },
  { type: "refactor", release: "patch", section: "Code Refactoring" },
  { type: "perf", release: "patch", section: "Performance Improvements" },
  { type: "test", release: "patch", section: "Tests" },
  { type: "build", release: "patch", section: "Build System" },
  { type: "ci", release: "patch", section: "Continuous Integration" },
  { type: "chore", release: "patch", section: "Chores" },
  { type: "revert", release: "patch", section: "Reverts" },
];

const config = {
  branches: ["main"],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules: [
          ...commitTypes.map((t) => ({ type: t.type, release: t.release })),
          { breaking: true, release: "major" },
        ],
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
        presetConfig: {
          types: commitTypes.map((t) => ({ type: t.type, section: t.section })),
        },
      },
    ],
    "@semantic-release/changelog",
    [
      "@semantic-release/npm",
      {
        tarballDir: "dist",
        pkgRoot: "./",
        provenance: true,
        addChannel: false,
      },
    ],
    [
      "@semantic-release/github",
      {
        assets: [
          {
            path: "dist/*.tgz",
            label: "NPM Distribution Package",
            name: "markmv-${nextRelease.version}.tgz",
          },
          {
            path: "CHANGELOG.md",
            label: "Release Changelog",
          },
          {
            path: "README.md",
            label: "Project Documentation",
          },
          {
            path: "coverage/coverage-summary.json",
            label: "Test Coverage Summary",
          },
          {
            path: "coverage/lcov.info",
            label: "Coverage Report (LCOV)",
          },
          {
            path: "sbom.spdx.json",
            label: "Software Bill of Materials (SBOM)",
          },
        ],
        successComment:
          "🎉 This ${issue.pull_request ? 'PR is included' : 'issue has been resolved'} in version ${nextRelease.version} 🎉\n\nThe release is available on:\n- **[GitHub Releases](https://github.com/ExaDev/markmv/releases/tag/v${nextRelease.version})** - includes coverage reports and SBOM\n- **[npm package (@latest dist-tag)](https://www.npmjs.com/package/markmv)** - published via OIDC trusted publishing with provenance\n\n## Installation\n```bash\nnpm install -g markmv@${nextRelease.version}\n```\n\n## Security & Supply Chain\n✅ **OIDC Trusted Publishing**: published from CI with no long-lived npm token\n✅ **SBOM**: Software Bill of Materials included in release\n✅ **NPM Provenance**: Published with npm provenance attestations\n\n## Test Coverage\nThis release includes comprehensive test coverage reports. View coverage details in the release assets.\n\nYour **[semantic-release](https://github.com/semantic-release/semantic-release)** bot 📦🚀",
        failComment:
          "❌ This release failed. Check the [build logs](${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}) for details.",
        failTitle: "🚨 Release failed for ${nextRelease.version}",
        addReleases: "bottom",
        draftRelease: false,
        prerelease: false,
        releasedLabels: ["released"],
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md", "package.json", "README.md"],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
  ],
};

export default config;
