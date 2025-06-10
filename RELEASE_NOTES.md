# Release Configuration Notes

## Semantic Release Configuration

The `.releaserc.json` file is configured to work with repository rules that require pull requests for changes to the main branch.

### What's Included:
- ✅ **GitHub Releases**: Automatic release creation with assets
- ✅ **NPM Publishing**: Automatic package publishing to npm
- ✅ **Changelog Generation**: Automatic CHANGELOG.md updates in releases
- ✅ **Coverage Reports**: Attached to releases as assets
- ✅ **Release Comments**: Automatic PR/issue comments on releases

### What's NOT Included:
- ❌ **Git Plugin**: Removed due to repository rules requiring PR workflow
  - No automatic commits back to repository
  - Changelog updates only appear in GitHub releases, not committed to repo
  - Package.json version stays static (not auto-bumped)

### Why Git Plugin is Disabled:
The repository has organization-level rules that require:
1. Changes must be made through pull requests
2. Required code owner review
3. Dismiss stale reviews on push

The `@semantic-release/git` plugin attempts to push commits directly to main, which violates these rules and causes release failures.

### Alternative Approach:
If you need changelog commits in the repository, you could:
1. Use a bot account with bypass permissions
2. Create a separate workflow that creates PRs with changelog updates
3. Manually accept that changelogs only exist in GitHub releases

### Current Behavior:
1. Semantic release creates GitHub releases with changelogs
2. NPM packages are published automatically  
3. Version numbers in package.json remain static
4. All release information is available in GitHub releases