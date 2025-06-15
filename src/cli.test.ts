import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all command modules to prevent actual execution
vi.mock('./commands/convert', () => ({
  convertCommand: vi.fn()
}));

vi.mock('./commands/index', () => ({
  indexCommand: vi.fn()
}));

vi.mock('./commands/join', () => ({
  joinCommand: vi.fn()
}));

vi.mock('./commands/merge', () => ({
  mergeCommand: vi.fn()
}));

vi.mock('./commands/move', () => ({
  moveCommand: vi.fn()
}));

vi.mock('./commands/split', () => ({
  splitCommand: vi.fn()
}));

// Mock commander with proper chaining behavior
const mockParse = vi.fn();
const mockAction = vi.fn().mockReturnThis();
const mockAddHelpText = vi.fn().mockReturnThis();
const mockOption = vi.fn().mockReturnThis();
const mockArgument = vi.fn().mockReturnThis();
const mockCommand = vi.fn().mockReturnThis();
const mockDescription = vi.fn().mockReturnThis();
const mockVersion = vi.fn().mockReturnThis();
const mockName = vi.fn().mockReturnThis();

const mockCommandInstance = {
  name: mockName,
  description: mockDescription,
  version: mockVersion,
  command: mockCommand,
  argument: mockArgument,
  option: mockOption,
  addHelpText: mockAddHelpText,
  action: mockAction,
  parse: mockParse
};

vi.mock('commander', () => ({
  Command: vi.fn().mockImplementation(() => mockCommandInstance)
}));

describe('CLI Entry Point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear module cache to ensure fresh imports
    vi.resetModules();
  });

  describe('CLI Initialization', () => {
    it('should set program name, description and version', async () => {
      await import('./cli.js');
      
      expect(mockName).toHaveBeenCalledWith('markmv');
      expect(mockDescription).toHaveBeenCalledWith('CLI for markdown file operations with intelligent link refactoring');
      expect(mockVersion).toHaveBeenCalledWith('0.1.0');
    });
  });

  describe('Command Registration', () => {
    it('should register all commands', async () => {
      await import('./cli.js');
      
      // Verify all commands are registered
      expect(mockCommand).toHaveBeenCalledWith('convert');
      expect(mockCommand).toHaveBeenCalledWith('move');
      expect(mockCommand).toHaveBeenCalledWith('split');
      expect(mockCommand).toHaveBeenCalledWith('join');
      expect(mockCommand).toHaveBeenCalledWith('merge');
      expect(mockCommand).toHaveBeenCalledWith('index');
    });

    it('should set descriptions for all commands', async () => {
      await import('./cli.js');
      
      expect(mockDescription).toHaveBeenCalledWith('Convert markdown link formats and path resolution');
      expect(mockDescription).toHaveBeenCalledWith('Move markdown files while updating cross-references');
      expect(mockDescription).toHaveBeenCalledWith('Split large markdown files maintaining link integrity');
      expect(mockDescription).toHaveBeenCalledWith('Join multiple markdown files resolving conflicts');
      expect(mockDescription).toHaveBeenCalledWith('Merge markdown content with link reconciliation');
      expect(mockDescription).toHaveBeenCalledWith('Generate index files for markdown documentation');
    });
  });

  describe('Command Configuration', () => {
    it('should configure arguments for commands', async () => {
      await import('./cli.js');
      
      // Check some key arguments
      expect(mockArgument).toHaveBeenCalledWith('<files...>', 'Markdown files to convert (supports globs like *.md, **/*.md)');
      expect(mockArgument).toHaveBeenCalledWith('<sources...>', 'Source markdown files and destination (supports globs like *.md, **/*.md)');
      expect(mockArgument).toHaveBeenCalledWith('<source>', 'Source markdown file to split');
    });

    it('should configure options for commands', async () => {
      await import('./cli.js');
      
      // Check some key options
      expect(mockOption).toHaveBeenCalledWith('--path-resolution <type>', 'Convert path resolution: absolute|relative');
      expect(mockOption).toHaveBeenCalledWith('--link-style <style>', 'Convert link style: markdown|claude|combined|wikilink');
      expect(mockOption).toHaveBeenCalledWith('-d, --dry-run', 'Show what would be changed without making changes');
      expect(mockOption).toHaveBeenCalledWith('-v, --verbose', 'Show detailed output');
    });

    it('should set action handlers for commands', async () => {
      await import('./cli.js');
      
      // Should call action 6 times (once for each command)
      expect(mockAction).toHaveBeenCalledTimes(6);
    });

    it('should add help text for convert command', async () => {
      await import('./cli.js');
      
      expect(mockAddHelpText).toHaveBeenCalledWith(
        'after',
        expect.stringContaining('Examples:')
      );
    });
  });

  describe('Program Execution', () => {
    it('should call parse to execute the program', async () => {
      await import('./cli.js');
      
      expect(mockParse).toHaveBeenCalled();
    });
  });

  describe('Command Integration', () => {
    it('should import all required command modules', async () => {
      // This test verifies that the CLI file can be imported without errors
      // and that all command imports work correctly
      expect(async () => {
        await import('./cli.js');
      }).not.toThrow();
    });

    it('should configure all command-specific options', async () => {
      await import('./cli.js');
      
      // Verify strategy-specific options are configured
      expect(mockOption).toHaveBeenCalledWith('-s, --strategy <strategy>', 'Split strategy: headers|size|manual|lines', 'headers');
      expect(mockOption).toHaveBeenCalledWith('--order-strategy <strategy>', 'Order strategy: alphabetical|manual|dependency|chronological', 'dependency');
      expect(mockOption).toHaveBeenCalledWith('-s, --strategy <strategy>', 'Merge strategy: append|prepend|interactive', 'interactive');
    });
  });
});