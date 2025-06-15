/**
 * Example usage of markmv REST API
 * 
 * Demonstrates how to use the markmv REST API server for language-agnostic access.
 * Shows HTTP requests to various endpoints with different operation types.
 */

/**
 * Example API client for markmv REST API
 */
class MarkMvApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Make HTTP request to API
   */
  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'POST',
    data?: any
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data && method === 'POST') {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(`API Error: ${result.error || result.message || 'Unknown error'}`);
      }
      
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Check API health
   */
  async health(): Promise<any> {
    return this.makeRequest('/health', 'GET');
  }

  /**
   * Move a single file
   */
  async moveFile(source: string, destination: string, options: any = {}): Promise<any> {
    return this.makeRequest('/api/move', 'POST', {
      source,
      destination,
      options,
    });
  }

  /**
   * Move multiple files
   */
  async moveFiles(moves: Array<{ source: string; destination: string }>, options: any = {}): Promise<any> {
    return this.makeRequest('/api/move-batch', 'POST', {
      moves,
      options,
    });
  }

  /**
   * Convert link formats
   */
  async convertLinks(pattern: string, options: any = {}): Promise<any> {
    return this.makeRequest('/api/convert', 'POST', {
      pattern,
      options,
    });
  }

  /**
   * Split a file
   */
  async splitFile(filePath: string, options: any): Promise<any> {
    return this.makeRequest('/api/split', 'POST', {
      filePath,
      options,
    });
  }

  /**
   * Join multiple files
   */
  async joinFiles(filePaths: string[], options: any): Promise<any> {
    return this.makeRequest('/api/join', 'POST', {
      filePaths,
      options,
    });
  }

  /**
   * Merge files
   */
  async mergeFiles(filePaths: string[], targetPath: string, options: any): Promise<any> {
    return this.makeRequest('/api/merge', 'POST', {
      filePaths,
      targetPath,
      options,
    });
  }

  /**
   * Validate operation result
   */
  async validateOperation(result: any): Promise<any> {
    return this.makeRequest('/api/validate', 'POST', {
      result,
    });
  }
}

/**
 * Example: Check API health
 */
async function healthCheckExample() {
  console.log('🔍 Checking API health...');
  
  const client = new MarkMvApiClient();
  
  try {
    const result = await client.health();
    console.log('✅ API Health:', result.data);
  } catch (error) {
    console.error('❌ Health check failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Example: Move a file via REST API
 */
async function moveFileExample() {
  console.log('🔧 Moving file via REST API...');
  
  const client = new MarkMvApiClient();
  
  try {
    const result = await client.moveFile(
      'docs/old-guide.md',
      'docs/new-guide.md',
      {
        dryRun: true,
        verbose: true,
        createDirectories: true,
      }
    );

    console.log('✅ Move operation result:');
    console.log(`  Success: ${result.success}`);
    console.log(`  Modified files: ${result.data.modifiedFiles.length}`);
    console.log(`  Created files: ${result.data.createdFiles.length}`);
    console.log(`  Errors: ${result.data.errors.length}`);
  } catch (error) {
    console.error('❌ Move failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Example: Convert link formats via REST API
 */
async function convertLinksExample() {
  console.log('🔄 Converting link formats via REST API...');
  
  const client = new MarkMvApiClient();
  
  try {
    const result = await client.convertLinks(
      'docs/**/*.md',
      {
        linkStyle: 'wikilink',
        pathResolution: 'relative',
        recursive: true,
        dryRun: true,
        verbose: true,
      }
    );

    console.log('✅ Convert operation result:');
    console.log(`  Success: ${result.success}`);
    console.log(`  Modified files: ${result.data.modifiedFiles.length}`);
    console.log(`  Changes made: ${result.data.changes.length}`);
  } catch (error) {
    console.error('❌ Convert failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Example: Split a file via REST API
 */
async function splitFileExample() {
  console.log('✂️ Splitting file via REST API...');
  
  const client = new MarkMvApiClient();
  
  try {
    const result = await client.splitFile(
      'docs/large-document.md',
      {
        strategy: 'headers',
        outputDir: 'docs/split-output',
        headerLevel: 2,
        dryRun: true,
        verbose: true,
      }
    );

    console.log('✅ Split operation result:');
    console.log(`  Success: ${result.success}`);
    console.log(`  Created files: ${result.data.createdFiles.length}`);
    console.log(`  Changes: ${result.data.changes.length}`);
  } catch (error) {
    console.error('❌ Split failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Example: Batch move files via REST API
 */
async function batchMoveExample() {
  console.log('📦 Batch moving files via REST API...');
  
  const client = new MarkMvApiClient();
  
  try {
    const moves = [
      { source: 'docs/file1.md', destination: 'docs/renamed/file1.md' },
      { source: 'docs/file2.md', destination: 'docs/renamed/file2.md' },
      { source: 'docs/file3.md', destination: 'docs/renamed/file3.md' },
    ];

    const result = await client.moveFiles(moves, {
      dryRun: true,
      verbose: true,
      createDirectories: true,
    });

    console.log('✅ Batch move operation result:');
    console.log(`  Success: ${result.success}`);
    console.log(`  Total modified files: ${result.data.modifiedFiles.length}`);
    console.log(`  Total created files: ${result.data.createdFiles.length}`);
    console.log(`  Total changes: ${result.data.changes.length}`);
  } catch (error) {
    console.error('❌ Batch move failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Example: Join files via REST API
 */
async function joinFilesExample() {
  console.log('🔗 Joining files via REST API...');
  
  const client = new MarkMvApiClient();
  
  try {
    const filePaths = [
      'docs/intro.md',
      'docs/getting-started.md',
      'docs/advanced.md',
      'docs/conclusion.md',
    ];

    const result = await client.joinFiles(filePaths, {
      output: 'docs/complete-guide.md',
      orderStrategy: 'manual',
      dryRun: true,
      verbose: true,
    });

    console.log('✅ Join operation result:');
    console.log(`  Success: ${result.success}`);
    console.log(`  Output file: ${result.data.createdFiles[0] || 'N/A'}`);
    console.log(`  Changes: ${result.data.changes.length}`);
  } catch (error) {
    console.error('❌ Join failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Example usage with curl commands (for non-TypeScript users)
 */
function showCurlExamples() {
  console.log('🌐 Equivalent curl commands for API usage:\n');
  
  console.log('# Health check');
  console.log('curl http://localhost:3000/health\n');
  
  console.log('# Move a file');
  console.log(`curl -X POST http://localhost:3000/api/move \\
  -H "Content-Type: application/json" \\
  -d '{
    "source": "docs/old.md",
    "destination": "docs/new.md",
    "options": {"dryRun": true, "verbose": true}
  }'\n`);
  
  console.log('# Convert links');
  console.log(`curl -X POST http://localhost:3000/api/convert \\
  -H "Content-Type: application/json" \\
  -d '{
    "pattern": "docs/**/*.md",
    "options": {"linkStyle": "wikilink", "dryRun": true}
  }'\n`);
  
  console.log('# Split file');
  console.log(`curl -X POST http://localhost:3000/api/split \\
  -H "Content-Type: application/json" \\
  -d '{
    "filePath": "docs/large.md",
    "options": {"strategy": "headers", "outputDir": "docs/split", "dryRun": true}
  }'\n`);
}

/**
 * Run all examples
 */
async function runExamples() {
  console.log('🚀 Starting markmv REST API examples...\n');

  try {
    await healthCheckExample();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await moveFileExample();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await convertLinksExample();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await splitFileExample();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await batchMoveExample();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await joinFilesExample();
    console.log('\n' + '='.repeat(50) + '\n');
    
    showCurlExamples();
    
    console.log('✅ All examples completed!');
    console.log('\n💡 Note: Start the API server with "npm run api-server" to test these examples');
  } catch (error) {
    console.error('❌ Example failed:', error);
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}

// Also support tsx execution
if (process.argv[1] && process.argv[1].endsWith('api-usage.ts')) {
  runExamples().catch(console.error);
}