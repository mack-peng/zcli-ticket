import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TextOutput, JsonOutput } from '../src/cli/output';

describe('output', () => {
  describe('TextOutput', () => {
    const out = new TextOutput();

    it('formats null as (empty)', () => {
      assert.strictEqual(out.format(null), '(empty)');
    });

    it('formats undefined as (empty)', () => {
      assert.strictEqual(out.format(undefined), '(empty)');
    });

    it('formats empty array', () => {
      assert.strictEqual(out.format([]), '(empty list)');
    });

    it('formats string directly', () => {
      assert.strictEqual(out.format('hello'), 'hello');
    });

    it('formats object as JSON', () => {
      const result = out.format({ a: 1, b: 2 });
      const parsed = JSON.parse(result);
      assert.deepStrictEqual(parsed, { a: 1, b: 2 });
    });

    it('formats array as table with headers and separators', () => {
      const result = out.format([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);
      const lines = result.split('\n');
      // Header row
      assert.ok(lines[0].includes('name'));
      assert.ok(lines[0].includes('age'));
      // Separator row with dashes
      assert.ok(lines[1].includes('---'));
      // Data rows
      assert.ok(lines[2].includes('Alice'));
      assert.ok(lines[3].includes('Bob'));
    });

    it('formats array of mixed key order', () => {
      const result = out.format([
        { b: 2, a: 1 },
        { a: 3, b: 4 },
      ]);
      assert.ok(result.includes('2'));
      assert.ok(result.includes('3'));
    });
  });

  describe('JsonOutput', () => {
    const out = new JsonOutput();

    it('formats data as JSON string', () => {
      const result = out.format({ key: 'value' });
      const parsed = JSON.parse(result);
      assert.deepStrictEqual(parsed, { key: 'value' });
    });

    it('formats arrays', () => {
      const result = out.format([1, 2, 3]);
      const parsed = JSON.parse(result);
      assert.deepStrictEqual(parsed, [1, 2, 3]);
    });

    it('serializes help as JSON object', () => {
      const originalLog = console.log;
      let output = '';
      console.log = (s: string) => { output += s; };
      out.help('usage text');
      console.log = originalLog;
      const parsed = JSON.parse(output);
      assert.deepStrictEqual(parsed, { help: 'usage text' });
    });
  });
});
