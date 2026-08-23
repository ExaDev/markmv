import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // Entry points are already derived from package.json's bin/main/exports fields; declaring them again here only produces knip's own "redundant entry pattern" warning.
  project: ['src/**/*.ts'],
  ignoreDependencies: [
    // Referenced only in typedoc.markdown.json's `plugin` array; knip's typedoc plugin only auto-discovers the canonically-named typedoc.json, not alternate config files.
    'typedoc-plugin-markdown',
    // Resolved by semantic-release from the "conventionalcommits" preset string inside .releaserc.json's commit-analyzer/release-notes-generator plugin options, not from the top-level plugins array knip's semantic-release plugin inspects.
    'conventional-changelog-conventionalcommits',
  ],
};

export default config;
