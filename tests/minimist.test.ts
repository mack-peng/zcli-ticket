import { describe, it } from 'node:test';
import assert from 'node:assert';
import { minimist } from '../src/cli/minimist';

describe('minimist', () => {
  it('parses positional arguments', () => {
    const result = minimist(['cmd', 'arg1', 'arg2']);
    assert.deepStrictEqual(result._, ['cmd', 'arg1', 'arg2']);
  });

  it('parses --key=value', () => {
    const result = minimist(['--name=foo', '--count=42']);
    assert.strictEqual(result.name, 'foo');
    assert.strictEqual(result.count, '42');
  });

  it('parses --no-flag as false', () => {
    const result = minimist(['--no-verbose'], { boolean: ['verbose'] });
    assert.strictEqual(result.verbose, false);
  });

  it('parses --flag as true for boolean options', () => {
    const result = minimist(['--verbose'], { boolean: ['verbose'] });
    assert.strictEqual(result.verbose, true);
  });

  it('parses --flag value for string options', () => {
    const result = minimist(['--name', 'hello']);
    assert.strictEqual(result.name, 'hello');
  });

  it('parses --flag=true|false correctly for boolean options', () => {
    const result = minimist(['--verbose', 'true'], { boolean: ['verbose'] });
    assert.strictEqual(result.verbose, true);
  });

  it('parses -s value as short flag', () => {
    const result = minimist(['-e', 'test@example.com']);
    assert.strictEqual(result.e, 'test@example.com');
  });

  it('collects repeated flags into an array', () => {
    const result = minimist(['--tag', 'a', '--tag', 'b']);
    assert.deepStrictEqual(result.tag, ['a', 'b']);
  });

  it('handles -- separator', () => {
    const result = minimist(['cmd', '--flag', '--', '--not-a-flag']);
    assert.strictEqual(result.flag, true);
    assert.deepStrictEqual(result._, ['cmd', '--not-a-flag']);
  });

  it('handles empty arguments', () => {
    const result = minimist([]);
    assert.deepStrictEqual(result._, []);
  });

  it('throws on --boolean-key=value', () => {
    assert.throws(
      () => minimist(['--verbose=something'], { boolean: ['verbose'] }),
      /boolean option/
    );
  });
});
