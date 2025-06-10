# Automatic Versioning with Conventional Commits

This project uses [semantic-release](https://semantic-release.gitbook.io/) with [conventional commits](https://www.conventionalcommits.org/) to automatically manage versioning and releases.

## How It Works

1. **Commit Messages**: All commits must follow the conventional commit format
2. **Analysis**: semantic-release analyzes commit messages to determine version bumps
3. **Versioning**: Follows semantic versioning (MAJOR.MINOR.PATCH)
4. **Changelog**: Automatically generates CHANGELOG.md
5. **Release**: Creates GitHub releases (when repository is configured)

## Version Bump Rules

| Commit Type | Version Bump | Example |
|-------------|--------------|---------|
| `feat` | Minor (0.1.0 → 0.2.0) | `feat(cli): add batch operations` |
| `fix` | Patch (0.1.0 → 0.1.1) | `fix(core): resolve link parsing issue` |
| `BREAKING CHANGE` | Major (0.1.0 → 1.0.0) | `feat!: change API interface` |
| Other types | Patch | `docs: update README` |

## Configuration Files

### `.releaserc.json`
- Main semantic-release configuration
- Defines plugins and rules for version analysis
- Configures changelog generation

### `.commitlintrc.json`  
- Validates commit message format
- Enforces conventional commit standards

### GitHub Actions (`.github/workflows/`)
- `ci.yml`: Continuous integration for all branches
- `release.yml`: Automated releases on main branch

## Usage

### Making Commits

#### Manual (follow conventional format):
```bash
git add .
git commit -m "feat(cli): add support for glob patterns"
```

#### Using Commitizen (recommended):
```bash
npm run commit
```

This will prompt you to build a proper conventional commit.

### Release Process

Releases happen automatically when commits are pushed to the main branch:

1. CI runs tests, linting, and builds
2. If tests pass, semantic-release analyzes commits
3. If version bump is needed:
   - Updates package.json version
   - Generates/updates CHANGELOG.md
   - Creates git tag
   - Creates GitHub release (if configured)
   - Publishes to npm (if configured)

### Manual Release (Local Testing)

```bash
# Dry run (see what would happen)
npm run release:dry

# Actual release (requires proper git setup)
npm run release
```

## Development Workflow

1. Create feature branch from main
2. Make changes with conventional commits
3. Push branch and create PR
4. Merge PR to main
5. Automatic release triggers (if changes warrant it)

## Commit Types Reference

- **feat**: New feature
- **fix**: Bug fix  
- **docs**: Documentation changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code restructuring without functionality changes
- **perf**: Performance improvements
- **test**: Test additions or modifications
- **build**: Build system changes
- **ci**: CI configuration changes
- **chore**: Maintenance tasks
- **revert**: Reverting previous commits

## Breaking Changes

To indicate breaking changes, either:

1. Add `!` after type: `feat(api)!: change response format`
2. Add footer: 
   ```
   feat(api): change response format
   
   BREAKING CHANGE: API now returns JSON instead of XML
   ```

## Examples

```bash
# New feature (minor bump)
feat(cli): add support for configuration files

# Bug fix (patch bump)
fix(parser): handle edge case with nested links

# Breaking change (major bump)
feat(api)!: redesign CLI argument structure

BREAKING CHANGE: Command arguments have been restructured.
Use --input instead of --source for input files.

# Documentation (patch bump)
docs(readme): add installation instructions

# Chore (patch bump)
chore(deps): update typescript to v5.0
```

This automated versioning ensures consistent releases and clear communication of changes to users.