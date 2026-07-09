import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as z from 'zod';
import { declareCommand, parseCommand } from '../src/cli/command';

const numberArg = z.preprocess((val, ctx) => {
  const n = Number(val);
  if (Number.isNaN(n)) {
    ctx.addIssue({ code: 'custom', message: `expected number` });
  }
  return n;
}, z.number());

describe('command', () => {
  describe('declareCommand', () => {
    it('returns the command schema unchanged', () => {
      const cmd = declareCommand({
        name: 'test',
        category: 'tickets',
        description: 'test command',
        api: { method: 'GET', path: '/test' },
      });
      assert.strictEqual(cmd.name, 'test');
      assert.strictEqual(cmd.api.method, 'GET');
    });
  });

  describe('parseCommand', () => {
    it('parses positional args', () => {
      const cmd = declareCommand({
        name: 'show',
        category: 'tickets',
        description: 'show item',
        args: z.object({ id: numberArg }),
        api: { method: 'GET', path: ({ id }) => `/items/${id}` },
      });

      const result = parseCommand(cmd, { _: ['show', '42'] });
      assert.strictEqual(result.id, 42);
    });

    it('parses optional args with default undefined', () => {
      const cmd = declareCommand({
        name: 'list',
        category: 'tickets',
        description: 'list items',
        options: z.object({
          status: z.enum(['open', 'closed']).optional(),
        }),
        api: { method: 'GET', path: '/items' },
      });

      const result = parseCommand(cmd, { _: ['list'] });
      assert.strictEqual(result.status, undefined);
    });

    it('parses provided options', () => {
      const cmd = declareCommand({
        name: 'list',
        category: 'tickets',
        description: 'list items',
        options: z.object({
          status: z.enum(['open', 'closed']).optional(),
          count: numberArg.optional(),
        }),
        api: { method: 'GET', path: '/items' },
      });

      const result = parseCommand(cmd, { _: ['list'], status: 'open', count: '25' });
      assert.strictEqual(result.status, 'open');
      assert.strictEqual(result.count, 25);
    });

    it('throws on too many positional args', () => {
      const cmd = declareCommand({
        name: 'show',
        category: 'tickets',
        description: 'show one',
        args: z.object({ id: numberArg }),
        api: { method: 'GET', path: ({ id }) => `/items/${id}` },
      });

      assert.throws(
        () => parseCommand(cmd, { _: ['show', '1', '2', '3'] }),
        /too many arguments/
      );
    });

    it('throws on invalid enum option', () => {
      const cmd = declareCommand({
        name: 'list',
        category: 'tickets',
        description: 'list',
        options: z.object({
          status: z.enum(['open', 'closed']).optional(),
        }),
        api: { method: 'GET', path: '/items' },
      });

      assert.throws(
        () => parseCommand(cmd, { _: ['list'], status: 'invalid' }),
        /option/
      );
    });

    it('throws on unknown option in strict mode', () => {
      const cmd = declareCommand({
        name: 'list',
        category: 'tickets',
        description: 'list',
        api: { method: 'GET', path: '/items' },
      });

      assert.throws(
        () => parseCommand(cmd, { _: ['list'], unknown: 'value' }),
        /unknown/
      );
    });

    it('combines args and options in result', () => {
      const cmd = declareCommand({
        name: 'update',
        category: 'tickets',
        description: 'update',
        args: z.object({ id: numberArg }),
        options: z.object({ name: z.string().optional() }),
        api: { method: 'PUT', path: ({ id }) => `/items/${id}` },
      });

      const result = parseCommand(cmd, { _: ['update', '99'], name: 'newname' });
      assert.strictEqual(result.id, 99);
      assert.strictEqual(result.name, 'newname');
    });
  });
});
