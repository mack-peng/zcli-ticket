import { describe, it } from 'node:test';
import assert from 'node:assert';
import { queryParamsFor } from '../src/cli/program';
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
    const params = queryParamsFor(commands['ticket-show'], 'GET', { _: ['ticket-show', '1'] }, ticketShowEntry, { id: 1 });
    assert.deepStrictEqual(params, {});
  });

  it('maps declared query flags to snake_case for GET commands without transformRequest', () => {
    const params = queryParamsFor(
      commands['view-execute'],
      'GET',
      { _: ['view-execute', '1'], 'sort-by': 'updated_at', 'per-page': '25' },
      viewExecuteEntry,
      { id: 1, 'sort-by': 'updated_at', 'per-page': 25 }
    );
    assert.deepStrictEqual(params, { sort_by: 'updated_at', per_page: '25' });
  });

  it('keeps transformRequest output for commands that declare one', () => {
    const params = queryParamsFor(
      commands['ticket-list'],
      'GET',
      { _: ['ticket-list'], status: 'open', 'per-page': '25' },
      ticketListEntry,
      { per_page: 25, status: 'open' }
    );
    assert.strictEqual(params.status, 'open');
    assert.strictEqual(params.per_page, 25);
  });

  it('does not leak positional args for list commands', () => {
    const entry: HelpEntry = { help: '', flags: {}, args: ['ticket-id'] };
    const params = queryParamsFor(commands['comment-list'], 'GET', { _: ['comment-list', '1'] }, entry, { 'ticket-id': 1 });
    assert.deepStrictEqual(params, {});
  });

  it('sends no query params for body methods', () => {
    const entry: HelpEntry = { help: '', flags: { 'assignee-id': 'string', 'private-comment': 'string' }, args: ['id'] };
    const params = queryParamsFor(
      commands['ticket-update'],
      'PUT',
      { _: ['ticket-update', '1'], 'assignee-id': '1', 'private-comment': 'note' },
      entry,
      { ticket: { assignee_id: 1, comment: { body: 'note', public: false } } }
    );
    assert.deepStrictEqual(params, {});
  });

  it('keeps query flags for DELETE', () => {
    const entry: HelpEntry = { help: '', flags: { ids: 'string' }, args: [] };
    const params = queryParamsFor(commands['ticket-show'], 'DELETE', { _: ['x'], ids: '1,2' }, entry, {});
    assert.deepStrictEqual(params, { ids: '1,2' });
  });
});
