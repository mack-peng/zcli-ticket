import { describe, it } from 'node:test';
import assert from 'node:assert';
import { maskConfig } from '../src/config/config';

describe('config', () => {
  describe('maskConfig', () => {
    it('shows subdomain and email directly', () => {
      const result = maskConfig({
        subdomain: 'mycorp',
        email: 'agent@corp.com',
        mode: 'api-token',
        token: 'secret123456',
        output: 'text',
        raw: false,
      });
      assert.strictEqual(result.subdomain, 'mycorp');
      assert.strictEqual(result.email, 'agent@corp.com');
    });

    it('masks token showing only first 4 and last 2 chars', () => {
      const result = maskConfig({
        subdomain: 'x', email: 'a@b.c', mode: 'api-token',
        token: 'abcdefghijkl', output: 'text', raw: false,
      });
      assert.ok(result.token.startsWith('abcd'));
      assert.ok(result.token.endsWith('kl'));
      assert.ok(result.token.includes('***'));
    });

    it('shows (not set) for missing token', () => {
      const result = maskConfig({
        subdomain: 'x', email: 'a@b.c', mode: 'basic',
        output: 'text', raw: false,
      });
      assert.strictEqual(result.token, '(not set)');
    });

    it('masks password as ****', () => {
      const result = maskConfig({
        subdomain: 'x', email: 'a@b.c', mode: 'basic',
        password: 'secret', output: 'text', raw: false,
      });
      assert.strictEqual(result.password, '****');
    });

    it('shows (not set) for missing oauth token', () => {
      const result = maskConfig({
        subdomain: 'x', email: 'a@b.c', mode: 'oauth',
        output: 'text', raw: false,
      });
      assert.strictEqual(result.oauthToken, '(not set)');
    });

    it('shows output mode', () => {
      const result = maskConfig({
        subdomain: 'x', email: 'a@b.c', mode: 'api-token',
        output: 'json', raw: true,
      });
      assert.strictEqual(result.output, 'json');
    });

    it('handles short token correctly', () => {
      const result = maskConfig({
        subdomain: 'x', email: 'a@b.c', mode: 'api-token',
        token: 'abc', output: 'text', raw: false,
      });
      assert.ok(result.token.includes('***'));
    });
  });
});
