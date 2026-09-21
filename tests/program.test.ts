import { describe, it } from 'node:test';
import assert from 'node:assert';
import { queryParamsFrom } from '../src/cli/program';
import { commands } from '../src/cli/commands';
import type { HelpEntry } from '../src/cli/command';

const ticketShowEntry: HelpEntry = { help: '', flags: {}, args: ['id'] };
const viewExecuteEntry: HelpEntry = {
  help: '',
  flags: { 'sort-by': 'string', 'sort-order': 'string', 'per-page': 'string' },
  args: ['id'],
};
const ticketListEntry: HelpEntry = {
  help: '',
  flags: { 'sort-by': 'string', 'sort-order': 'string', status: 'string', 'per-page': 'string' },
  args: [],
};

describe('program query params', () => {
  it('does not leak positional args into query params', () => {
    const params = queryParamsFrom(commands['ticket-show'], { _: ['ticket-show', '1'] }, ticketShowEntry, { id: 1 });
    assert.deepStrictEqual(params, {});
  });

  it('maps declared query flags to snake_case for GET commands without transformRequest', () => {
    const params = queryParamsFrom(
      commands['view-execute'],
      { _: ['view-execute', '1'], 'sort-by': 'updated_at', 'per-page': '25' },
      viewExecuteEntry,
      { id: 1, 'sort-by': 'updated_at', 'per-page': 25 }
    );
    assert.deepStrictEqual(params, { sort_by: 'updated_at', per_page: '25' });
  });

  it('keeps transformRequest output for commands that declare one', () => {
    const params = queryParamsFrom(
      commands['ticket-list'],
      { _: ['ticket-list'], status: 'open', 'per-page': '25' },
      ticketListEntry,
      { per_page: 25, status: 'open' }
    );
    assert.strictEqual(params.status, 'open');
    assert.strictEqual(params.per_page, 25);
  });

  it('does not leak positional args for list commands', () => {
    const entry: HelpEntry = { help: '', flags: {}, args: ['ticket-id'] };
    const params = queryParamsFrom(commands['comment-list'], { _: ['comment-list', '1'] }, entry, { 'ticket-id': 1 });
    assert.deepStrictEqual(params, {});
  });
});
