import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createAuthProvider } from '../src/api/auth';

describe('auth', () => {
  describe('api-token mode', () => {
    it('generates Basic auth header with /token suffix', () => {
      const auth = createAuthProvider({
        mode: 'api-token',
        email: 'agent@example.com',
        token: 'abc123',
      });
      const headers = auth.getHeaders();
      assert.ok(headers.Authorization.startsWith('Basic '));
      const decoded = Buffer.from(headers.Authorization.slice(6), 'base64').toString();
      assert.strictEqual(decoded, 'agent@example.com/token:abc123');
    });

    it('throws if email is missing', () => {
      assert.throws(
        () => createAuthProvider({ mode: 'api-token', token: 'abc' }),
        /email/
      );
    });

    it('throws if token is missing', () => {
      assert.throws(
        () => createAuthProvider({ mode: 'api-token', email: 'x@y.com' }),
        /token/
      );
    });
  });

  describe('basic mode', () => {
    it('generates Basic auth header without /token', () => {
      const auth = createAuthProvider({
        mode: 'basic',
        email: 'agent@example.com',
        password: 'secret',
      });
      const headers = auth.getHeaders();
      const decoded = Buffer.from(headers.Authorization.slice(6), 'base64').toString();
      assert.strictEqual(decoded, 'agent@example.com:secret');
    });

    it('throws if password is missing', () => {
      assert.throws(
        () => createAuthProvider({ mode: 'basic', email: 'x@y.com' }),
        /password/
      );
    });
  });

  describe('oauth mode', () => {
    it('generates Bearer token header', () => {
      const auth = createAuthProvider({
        mode: 'oauth',
        oauthToken: 'tok_xyz',
      });
      const headers = auth.getHeaders();
      assert.strictEqual(headers.Authorization, 'Bearer tok_xyz');
    });

    it('throws if oauth token is missing', () => {
      assert.throws(
        () => createAuthProvider({ mode: 'oauth' }),
        /oauth/
      );
    });
  });
});
