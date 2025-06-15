# Cross-Platform Testing

This document describes the cross-platform testing setup for markmv, which ensures the tool works correctly across different operating systems and filesystem types.

## Overview

markmv is tested on three major platforms:
- **Linux (Ubuntu)** - Case-sensitive filesystem, symbolic link support
- **macOS** - Case-insensitive filesystem (default), symbolic link support  
- **Windows** - Case-insensitive filesystem, limited symbolic link support

## Testing Strategy

### 1. CI/CD Matrix Testing

The main CI pipeline (`.github/workflows/main.yml`) includes a matrix strategy that tests across:
- Operating Systems: Ubuntu, Windows, macOS
- Node.js versions: 20.x, 22.x
- Filesystem behaviors: Case-sensitive vs case-insensitive

### 2. Dedicated Cross-Platform Workflow

A separate workflow (`.github/workflows/cross-platform-tests.yml`) performs comprehensive cross-platform testing:
- Automatic filesystem capability detection
- Platform-specific test scenarios
- CLI testing with different path formats
- Symlink behavior validation

### 3. Local Testing Support

A local testing script (`scripts/test-cross-platform.js`) allows developers to simulate cross-platform testing on their local machine.

## Filesystem Differences Handled

### Case Sensitivity

**Linux (default)**: Case-sensitive
- `file.md` and `FILE.md` are different files
- Link updates must preserve case exactly

**macOS/Windows**: Case-insensitive
- `file.md` and `FILE.md` refer to the same file
- Link updates are case-insensitive

### Path Separators

**Windows**: Backslash (`\`)
- Native: `folder\subfolder\file.md`
- Mixed support: `folder/subfolder/file.md`

**Unix-like (Linux/macOS)**: Forward slash (`/`)
- Native: `folder/subfolder/file.md`
- Limited backslash support

### Symbolic Links

**Linux/macOS**: Full support
- File and directory symbolic links
- Link target resolution

**Windows**: Limited support
- Requires elevated permissions
- May not work in all environments

## Test Utilities

### Cross-Platform Test Helpers

The `src/utils/test-helpers.ts` module provides utilities for writing cross-platform tests:

```typescript
import { 
  getPlatformInfo, 
  conditionalTest, 
  getTestPaths,
  wouldFilenamesConflict 
} from './test-helpers.js';

// Get current platform information
const platformInfo = getPlatformInfo();
console.log(`Case sensitive: ${platformInfo.caseSensitive}`);

// Run tests conditionally based on platform capabilities
conditionalTest('symlink test', 'symlinks', () => {
  // This test only runs if symlinks are supported
});

// Test filename conflicts based on case sensitivity
const conflict = wouldFilenamesConflict('file.md', 'FILE.md');
// Returns true on case-insensitive filesystems
```

### Environment Variables

The testing system uses environment variables to communicate filesystem capabilities:

- `MARKMV_TEST_OS`: Current operating system
- `MARKMV_TEST_CASE_SENSITIVE`: Whether filesystem is case-sensitive
- `MARKMV_TEST_SUPPORTS_SYMLINKS`: Whether symbolic links are supported
- `MARKMV_TEST_FILESYSTEM_CASE_SENSITIVE`: Detected case sensitivity
- `MARKMV_TEST_SUPPORTS_SYMLINKS`: Detected symlink support

## Running Cross-Platform Tests

### In CI

Cross-platform tests run automatically on all pushes and pull requests:

1. **Main workflow**: Basic cross-platform compatibility
2. **Cross-platform workflow**: Comprehensive filesystem testing

### Locally

Run cross-platform tests on your local machine:

```bash
# Full cross-platform test suite
npm run test:cross-platform

# Create test data only
npm run test:cross-platform:data

# Test CLI only
npm run test:cross-platform:cli

# Run with specific environment
MARKMV_TEST_CASE_SENSITIVE=false npm run test:run
```

### Manual Testing

To manually test cross-platform behavior:

1. Create test markdown files with links
2. Test on different operating systems
3. Verify link updates work correctly
4. Check case sensitivity handling

## Best Practices

### For Developers

1. **Use test helpers**: Always use the cross-platform test utilities
2. **Conditional testing**: Skip tests that require unsupported features
3. **Path normalization**: Use the provided path utilities
4. **Environment awareness**: Check platform capabilities before testing

### For Test Writing

```typescript
import { conditionalTest, getPlatformInfo } from '../utils/test-helpers.js';

describe('My Feature', () => {
  const platformInfo = getPlatformInfo();
  
  // Standard test that runs on all platforms
  test('should work on all platforms', () => {
    // Test implementation
  });
  
  // Conditional test for case-sensitive filesystems
  conditionalTest('case sensitivity test', 'case-sensitivity', () => {
    // This only runs on case-sensitive filesystems
  });
  
  // Platform-specific test
  if (platformInfo.isWindows) {
    test('Windows-specific behavior', () => {
      // Windows-only test
    });
  }
});
```

## Troubleshooting

### Common Issues

1. **Test failures on Windows**
   - Check path separator usage
   - Verify symlink permissions
   - Ensure proper escaping

2. **Case sensitivity conflicts**
   - Use conditional tests
   - Check filename collision detection
   - Verify case-insensitive link updates

3. **CI failures**
   - Review filesystem detection logs
   - Check environment variable setup
   - Verify test data creation

### Debugging

Enable debug output in tests:

```bash
# Enable verbose test output
npm run test:run -- --reporter=verbose

# Run specific test file
npm run test:run -- src/utils/test-helpers.test.ts

# Check filesystem capabilities
node scripts/test-cross-platform.js --test-data-only
```

## Architecture

### Test Flow

1. **Platform Detection**: Automatically detect OS and filesystem capabilities
2. **Environment Setup**: Set environment variables for test configuration
3. **Test Execution**: Run tests with platform-aware assertions
4. **Result Reporting**: Generate platform-specific test reports

### Integration Points

- **Vitest Configuration**: Environment variable setup
- **CI Workflows**: Matrix strategy and capability detection
- **Test Utilities**: Cross-platform abstractions
- **CLI Testing**: Path format validation

## Future Enhancements

Potential improvements to cross-platform testing:

1. **Additional Platforms**: Test on more OS variants
2. **Filesystem Types**: Test different filesystem types (NTFS, ext4, APFS)
3. **Docker Testing**: Containerized cross-platform testing
4. **Performance Testing**: Platform-specific performance validation
5. **Unicode Support**: Extended character set testing

## Contributing

When adding new features:

1. Consider cross-platform implications
2. Add appropriate conditional tests
3. Update test utilities if needed
4. Document platform-specific behaviors
5. Test on multiple operating systems

For more information about the testing setup, see the workflow files in `.github/workflows/` and the test utilities in `src/utils/test-helpers.ts`.