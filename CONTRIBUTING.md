# Contributing to markmv

Thank you for your interest in contributing to markmv! This document provides guidelines for contributing to the project.

## Conventional Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages. This enables automatic semantic versioning and changelog generation.

### Commit Message Format

Each commit message should have the following format:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **build**: Changes that affect the build system or external dependencies
- **ci**: Changes to CI configuration files and scripts
- **chore**: Other changes that don't modify src or test files
- **revert**: Reverts a previous commit

### Scopes

Common scopes for this project include:
- **cli**: Command-line interface changes
- **core**: Core functionality changes
- **utils**: Utility function changes
- **types**: Type definition changes
- **tests**: Test-related changes
- **deps**: Dependency updates

### Examples

```bash
feat(cli): add support for batch file operations
fix(core): resolve issue with link resolution in nested directories
docs(readme): update installation instructions
test(utils): add comprehensive tests for path utilities
chore(deps): update typescript to latest version
```

### Breaking Changes

For breaking changes, add `BREAKING CHANGE:` in the footer or add `!` after the type/scope:

```bash
feat(api)!: change default output format to JSON
```

or

```bash
feat(api): change default output format to JSON

BREAKING CHANGE: The default output format has changed from plain text to JSON.
```

## Using Commitizen

To make writing conventional commits easier, you can use commitizen:

```bash
npm run commit
```

This will prompt you through creating a proper conventional commit message.

## Development Workflow

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Write tests for your changes
5. Ensure all tests pass: `npm test`
6. Ensure linting passes: `npm run lint`
7. Ensure type checking passes: `npm run typecheck`
8. Commit your changes using conventional commits
9. Push to your fork and submit a pull request

## Testing

- Run tests: `npm test`
- Run tests with coverage: `npm run test:coverage`
- Run tests in watch mode: `npm run test:watch`

## Code Style

This project uses [Biome](https://biomejs.dev/) for linting and formatting:

- Check code style: `npm run check`
- Format code: `npm run format`
- Lint code: `npm run lint`

## Release Process

Releases are automated using semantic-release based on conventional commits:

- **feat**: triggers a minor version bump
- **fix**: triggers a patch version bump
- **BREAKING CHANGE**: triggers a major version bump

The release process runs automatically on the main branch and:
1. Analyzes commit messages since the last release
2. Determines the next version number
3. Generates a changelog
4. Creates a GitHub release
5. Publishes to npm (if configured)

## Questions?

If you have questions about contributing, please open an issue for discussion.