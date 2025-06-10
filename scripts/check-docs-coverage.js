#!/usr/bin/env node

/**
 * Documentation Coverage Checker
 * Analyzes TypeScript files for JSDoc comment coverage
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

class DocCoverageChecker {
  constructor() {
    this.stats = {
      totalFiles: 0,
      totalExports: 0,
      documentedExports: 0,
      totalClasses: 0,
      documentedClasses: 0,
      totalMethods: 0,
      documentedMethods: 0,
      totalProperties: 0,
      documentedProperties: 0,
      issues: []
    };
  }

  /**
   * Check if a line has JSDoc comment above it
   */
  hasJSDocComment(lines, lineIndex) {
    for (let i = lineIndex - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line === '') continue;
      if (line.startsWith('*/')) {
        // Found end of JSDoc, check if it's proper JSDoc
        for (let j = i - 1; j >= 0; j--) {
          const checkLine = lines[j].trim();
          if (checkLine.startsWith('/**')) return true;
          if (!checkLine.startsWith('*') && checkLine !== '') return false;
        }
      }
      return false;
    }
    return false;
  }

  /**
   * Analyze a TypeScript file for documentation coverage
   */
  analyzeFile(filePath) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const fileName = filePath.replace(process.cwd(), '');

      // Regex patterns for different TypeScript constructs
      const patterns = {
        exportFunction: /^export\s+(async\s+)?function\s+(\w+)/,
        exportClass: /^export\s+(abstract\s+)?class\s+(\w+)/,
        exportInterface: /^export\s+interface\s+(\w+)/,
        exportType: /^export\s+type\s+(\w+)/,
        exportConst: /^export\s+const\s+(\w+)/,
        exportEnum: /^export\s+enum\s+(\w+)/,
        publicMethod: /^\s+(async\s+)?(\w+)\s*\([^)]*\)\s*[:{\{]/,
        publicProperty: /^\s+(\w+)\s*[:=]/,
        classDeclaration: /^(export\s+)?(abstract\s+)?class\s+(\w+)/
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const hasDoc = this.hasJSDocComment(lines, i);

        // Check exports
        for (const [type, pattern] of Object.entries(patterns)) {
          const match = line.match(pattern);
          if (match) {
            const name = match[2] || match[1];
            
            if (type.startsWith('export')) {
              this.stats.totalExports++;
              if (hasDoc) {
                this.stats.documentedExports++;
              } else {
                this.stats.issues.push({
                  file: fileName,
                  line: i + 1,
                  type: 'missing-export-doc',
                  name,
                  construct: type
                });
              }
            }

            if (type === 'exportClass' || type === 'classDeclaration') {
              this.stats.totalClasses++;
              if (hasDoc) {
                this.stats.documentedClasses++;
              } else {
                this.stats.issues.push({
                  file: fileName,
                  line: i + 1,
                  type: 'missing-class-doc',
                  name,
                  construct: 'class'
                });
              }
            }

            if (type === 'publicMethod' && !line.includes('constructor')) {
              this.stats.totalMethods++;
              if (hasDoc) {
                this.stats.documentedMethods++;
              } else {
                this.stats.issues.push({
                  file: fileName,
                  line: i + 1,
                  type: 'missing-method-doc',
                  name,
                  construct: 'method'
                });
              }
            }

            if (type === 'publicProperty') {
              this.stats.totalProperties++;
              if (hasDoc) {
                this.stats.documentedProperties++;
              } else {
                this.stats.issues.push({
                  file: fileName,
                  line: i + 1,
                  type: 'missing-property-doc',
                  name,
                  construct: 'property'
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error analyzing ${filePath}:`, error.message);
    }
  }

  /**
   * Recursively find TypeScript files
   */
  findTSFiles(dir, files = []) {
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (!entry.includes('node_modules') && !entry.includes('.git') && 
            !entry.includes('dist') && !entry.includes('docs') &&
            !entry.includes('coverage')) {
          this.findTSFiles(fullPath, files);
        }
      } else if (extname(entry) === '.ts' && !entry.includes('.test.') && 
                 !entry.includes('.spec.') && entry !== 'cli.ts') {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * Generate coverage report
   */
  generateReport() {
    const exportCoverage = this.stats.totalExports > 0 ? 
      (this.stats.documentedExports / this.stats.totalExports * 100).toFixed(1) : 0;
    
    const classCoverage = this.stats.totalClasses > 0 ? 
      (this.stats.documentedClasses / this.stats.totalClasses * 100).toFixed(1) : 0;
    
    const methodCoverage = this.stats.totalMethods > 0 ? 
      (this.stats.documentedMethods / this.stats.totalMethods * 100).toFixed(1) : 0;
    
    const propertyCoverage = this.stats.totalProperties > 0 ? 
      (this.stats.documentedProperties / this.stats.totalProperties * 100).toFixed(1) : 0;

    const totalItems = this.stats.totalExports + this.stats.totalMethods + this.stats.totalProperties;
    const totalDocumented = this.stats.documentedExports + this.stats.documentedMethods + this.stats.documentedProperties;
    const overallCoverage = totalItems > 0 ? (totalDocumented / totalItems * 100).toFixed(1) : 0;

    console.log('\n📊 TypeDoc Documentation Coverage Report');
    console.log('=' .repeat(50));
    console.log(`📁 Files analyzed: ${this.stats.totalFiles}`);
    console.log(`📈 Overall coverage: ${overallCoverage}%`);
    console.log();
    console.log('📋 Detailed Coverage:');
    console.log(`   📤 Exports: ${this.stats.documentedExports}/${this.stats.totalExports} (${exportCoverage}%)`);
    console.log(`   🏗️  Classes: ${this.stats.documentedClasses}/${this.stats.totalClasses} (${classCoverage}%)`);
    console.log(`   ⚙️  Methods: ${this.stats.documentedMethods}/${this.stats.totalMethods} (${methodCoverage}%)`);
    console.log(`   🔧 Properties: ${this.stats.documentedProperties}/${this.stats.totalProperties} (${propertyCoverage}%)`);

    if (this.stats.issues.length > 0) {
      console.log('\n⚠️  Missing Documentation:');
      console.log('-'.repeat(50));
      
      // Group issues by file
      const issuesByFile = {};
      for (const issue of this.stats.issues) {
        if (!issuesByFile[issue.file]) {
          issuesByFile[issue.file] = [];
        }
        issuesByFile[issue.file].push(issue);
      }

      for (const [file, issues] of Object.entries(issuesByFile)) {
        console.log(`\n📄 ${file}:`);
        for (const issue of issues) {
          const icon = {
            'missing-export-doc': '📤',
            'missing-class-doc': '🏗️',
            'missing-method-doc': '⚙️',
            'missing-property-doc': '🔧'
          }[issue.type] || '❓';
          
          console.log(`   ${icon} Line ${issue.line}: ${issue.construct} '${issue.name}'`);
        }
      }
    } else {
      console.log('\n✅ All public APIs are documented!');
    }

    console.log('\n' + '='.repeat(50));
    
    return {
      overallCoverage: parseFloat(overallCoverage),
      totalIssues: this.stats.issues.length,
      stats: this.stats
    };
  }

  /**
   * Run the documentation coverage check
   */
  run() {
    console.log('🔍 Analyzing TypeScript files for documentation coverage...\n');
    
    const files = this.findTSFiles('./src');
    this.stats.totalFiles = files.length;
    
    for (const file of files) {
      this.analyzeFile(file);
    }
    
    return this.generateReport();
  }
}

// Run the checker
const checker = new DocCoverageChecker();
const result = checker.run();

// Exit with error code if coverage is below threshold
const threshold = 80; // 80% coverage threshold
if (result.overallCoverage < threshold) {
  console.log(`\n❌ Documentation coverage ${result.overallCoverage}% is below threshold ${threshold}%`);
  process.exit(1);
} else {
  console.log(`\n✅ Documentation coverage ${result.overallCoverage}% meets threshold ${threshold}%`);
}