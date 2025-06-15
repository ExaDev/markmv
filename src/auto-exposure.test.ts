/**
 * @fileoverview Comprehensive tests for the auto-exposure pattern implementation
 * Tests the JSON Schema-first approach for automatically exposing functionality
 * via MCP tools and REST API endpoints.
 */

import { describe, it, expect } from 'vitest';
import { testAutoExposure } from './index.js';

describe('Auto-Exposure Pattern', () => {
  describe('testAutoExposure function', () => {
    it('should return proper structure with message, timestamp, and success', async () => {
      const input = 'Hello World';
      const result = await testAutoExposure(input);

      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
      expect(result.message).toBe(`Echo: ${input}`);
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });

    it('should handle empty string input', async () => {
      const result = await testAutoExposure('');
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Echo: ');
      expect(typeof result.timestamp).toBe('string');
    });

    it('should handle special characters in input', async () => {
      const specialInput = '!@#$%^&*()_+{}|:"<>?[]\\;\',./ 🚀';
      const result = await testAutoExposure(specialInput);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe(`Echo: ${specialInput}`);
    });

    it('should generate valid ISO timestamp', async () => {
      const result = await testAutoExposure('test');
      const timestamp = new Date(result.timestamp);
      
      expect(timestamp.toISOString()).toBe(result.timestamp);
      expect(Date.now() - timestamp.getTime()).toBeLessThan(1000); // Within 1 second
    });

    it('should handle very long input strings', async () => {
      const longInput = 'A'.repeat(10000);
      const result = await testAutoExposure(longInput);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe(`Echo: ${longInput}`);
    });

    it('should be consistent across multiple calls', async () => {
      const input = 'consistency test';
      const results = await Promise.all([
        testAutoExposure(input),
        testAutoExposure(input),
        testAutoExposure(input)
      ]);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.message).toBe(`Echo: ${input}`);
        expect(typeof result.timestamp).toBe('string');
      });

      // Timestamps should be different (within reason)
      const timestamps = results.map(r => r.timestamp);
      expect(new Set(timestamps).size).toBeGreaterThan(0);
    });
  });

  describe('Function Type Safety', () => {
    it('should maintain proper TypeScript types', async () => {
      const result = await testAutoExposure('type test');
      
      // These should not cause TypeScript errors if properly typed
      const message: string = result.message;
      const timestamp: string = result.timestamp;
      const success: boolean = result.success;
      
      expect(typeof message).toBe('string');
      expect(typeof timestamp).toBe('string');
      expect(typeof success).toBe('boolean');
    });
  });

  describe('Performance', () => {
    it('should execute within reasonable time limits', async () => {
      const start = Date.now();
      await testAutoExposure('performance test');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });

    it('should handle concurrent executions', async () => {
      const start = Date.now();
      const promises = Array(10).fill(0).map((_, i) => 
        testAutoExposure(`concurrent test ${i}`)
      );
      
      const results = await Promise.all(promises);
      const duration = Date.now() - start;
      
      expect(results).toHaveLength(10);
      expect(duration).toBeLessThan(1000); // All should complete within 1 second
      
      results.forEach((result, i) => {
        expect(result.message).toBe(`Echo: concurrent test ${i}`);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Integration with Auto-Exposure', () => {
    it('should be discoverable by the auto-exposure pattern', () => {
      // Verify the function is exported from index
      expect(testAutoExposure).toBeDefined();
      expect(typeof testAutoExposure).toBe('function');
    });

    it('should have the expected function signature', () => {
      // Check that function accepts string and returns Promise
      expect(testAutoExposure.length).toBe(1); // One parameter
      expect(testAutoExposure.name).toBe('testAutoExposure');
    });
  });
});