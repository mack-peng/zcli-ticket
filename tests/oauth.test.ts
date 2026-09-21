import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createAuthProvider } from '../src/api/auth';
import { ZendeskClient } from '../src/api/client';
import { exchangeClientCredentials } from '../src/api/oauth';
import { saveOauthToken } from '../src/config/config';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe('oauth', () => {
  let rcDir: string;

  beforeEach(() => {
    rcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcli-oauth-'));
    process.env.ZENDESK_RC_PATH = path.join(rcDir, '.zendeskrc');
    delete process.env.ZENDESK_PROFILE;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.ZENDESK_RC_PATH;
    fs.rmSync(rcDir, { recursive: true, force: true });
  });

  describe('exchangeClientCredentials', () => {
    it('POSTs client_credentials to the token endpoint', async () => {
      const calls: { url: string; body: any }[] = [];
      globalThis.fetch = (async (url: any, init: any) => {
        calls.push({ url: String(url), body: JSON.parse(init.body) });
        return jsonResponse({ access_token: 'tok_new', token_type: 'bearer', scope: 'read write', expires_in: 172800 });
      }) as any;

      const result = await exchangeClientCredentials({ subdomain: 'mycorp', clientId: 'id1', clientSecret: 'sec1' });

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].url, 'https://mycorp.zendesk.com/oauth/tokens');
      assert.deepStrictEqual(calls[0].body, {
        grant_type: 'client_credentials',
        client_id: 'id1',
        client_secret: 'sec1',
      });
      assert.strictEqual(result.accessToken, 'tok_new');
      assert.strictEqual(result.expiresIn, 172800);
      assert.strictEqual(result.scope, 'read write');
    });

    it('sends scope and expires_in when provided', async () => {
      let body: any;
      globalThis.fetch = (async (_url: any, init: any) => {
        body = JSON.parse(init.body);
        return jsonResponse({ access_token: 'tok', expires_in: 3600, scope: 'tickets:read' });
      }) as any;

      await exchangeClientCredentials({
        subdomain: 'mycorp.zendesk.de',
        clientId: 'id1',
        clientSecret: 'sec1',
        scope: 'tickets:read',
        expiresIn: 3600,
      });

      assert.strictEqual(body.scope, 'tickets:read');
      assert.strictEqual(body.expires_in, 3600);
    });

    it('maps invalid_client without leaking the secret', async () => {
      globalThis.fetch = (async () => jsonResponse({ error: 'invalid_client' }, 401)) as any;

      await assert.rejects(
        exchangeClientCredentials({ subdomain: 'mycorp', clientId: 'id1', clientSecret: 'topsecret' }),
        (e: Error) => {
          assert.match(e.message, /invalid_client/);
          assert.ok(!e.message.includes('topsecret'));
          return true;
        }
      );
    });

    it('maps unauthorized_client to the confidential-client hint', async () => {
      globalThis.fetch = (async () => jsonResponse({ error: 'unauthorized_client' }, 400)) as any;

      await assert.rejects(
        exchangeClientCredentials({ subdomain: 'mycorp', clientId: 'id1', clientSecret: 'sec1' }),
        /confidential/
      );
    });

    it('maps invalid_scope and echoes the requested scope', async () => {
      globalThis.fetch = (async () => jsonResponse({ error: 'invalid_scope' }, 400)) as any;

      await assert.rejects(
        exchangeClientCredentials({ subdomain: 'mycorp', clientId: 'id1', clientSecret: 'sec1', scope: 'admin:write' }),
        /admin:write/
      );
    });
  });

  describe('lazy refresh', () => {
    it('refreshes when the token expires within the 60s window', async () => {
      let tokenCalls = 0;
      globalThis.fetch = (async (url: any) => {
        if (String(url).includes('/oauth/tokens')) {
          tokenCalls++;
          return jsonResponse({ access_token: 'tok_new', expires_in: 3600, scope: 'read' });
        }
        return jsonResponse({ ok: true });
      }) as any;

      const auth = createAuthProvider({
        mode: 'oauth',
        subdomain: 'mycorp',
        oauthClientId: 'id1',
        oauthClientSecret: 'sec1',
        oauthToken: 'tok_old',
        oauthTokenExpiresAt: nowSeconds() + 60,
      });

      const headers = await auth.getHeaders();
      assert.strictEqual(tokenCalls, 1);
      assert.strictEqual(headers.Authorization, 'Bearer tok_new');
    });

    it('keeps the current token when more than 60s remain', async () => {
      let tokenCalls = 0;
      globalThis.fetch = (async () => {
        tokenCalls++;
        return jsonResponse({ access_token: 'tok_new', expires_in: 3600 });
      }) as any;

      const auth = createAuthProvider({
        mode: 'oauth',
        subdomain: 'mycorp',
        oauthClientId: 'id1',
        oauthClientSecret: 'sec1',
        oauthToken: 'tok_old',
        oauthTokenExpiresAt: nowSeconds() + 61,
      });

      const headers = await auth.getHeaders();
      assert.strictEqual(tokenCalls, 0);
      assert.strictEqual(headers.Authorization, 'Bearer tok_old');
    });

    it('treats an unknown expiry as static and only refreshes on demand', async () => {
      let tokenCalls = 0;
      globalThis.fetch = (async () => {
        tokenCalls++;
        return jsonResponse({ access_token: 'tok_new', expires_in: 3600 });
      }) as any;

      const auth = createAuthProvider({
        mode: 'oauth',
        subdomain: 'mycorp',
        oauthClientId: 'id1',
        oauthClientSecret: 'sec1',
        oauthToken: 'tok_old',
      });

      const headers = await auth.getHeaders();
      assert.strictEqual(tokenCalls, 0);
      assert.strictEqual(headers.Authorization, 'Bearer tok_old');
    });

    it('persists the refreshed token through the persist callback', async () => {
      globalThis.fetch = (async () => jsonResponse({ access_token: 'tok_new', expires_in: 3600, scope: 'read' })) as any;
      const persisted: any[] = [];

      const auth = createAuthProvider({
        mode: 'oauth',
        subdomain: 'mycorp',
        oauthClientId: 'id1',
        oauthClientSecret: 'sec1',
        oauthToken: 'tok_old',
        oauthTokenExpiresAt: nowSeconds() + 10,
        persist: (token) => persisted.push(token),
      });

      await auth.getHeaders();
      assert.strictEqual(persisted.length, 1);
      assert.strictEqual(persisted[0].accessToken, 'tok_new');
      assert.ok(persisted[0].expiresAt > nowSeconds());
      assert.strictEqual(persisted[0].scopeGranted, 'read');
    });

    it('does not refresh again when the token response omits expires_in', async () => {
      let tokenCalls = 0;
      globalThis.fetch = (async (url: any) => {
        if (String(url).includes('/oauth/tokens')) {
          tokenCalls++;
          return jsonResponse({ access_token: 'tok_new', scope: 'read' });
        }
        return jsonResponse({ ok: true });
      }) as any;

      const auth = createAuthProvider({
        mode: 'oauth',
        subdomain: 'mycorp',
        oauthClientId: 'id1',
        oauthClientSecret: 'sec1',
        oauthToken: 'tok_old',
        oauthTokenExpiresAt: nowSeconds() + 10,
      });

      const first = await auth.getHeaders();
      const second = await auth.getHeaders();
      assert.strictEqual(tokenCalls, 1);
      assert.strictEqual(first.Authorization, 'Bearer tok_new');
      assert.strictEqual(second.Authorization, 'Bearer tok_new');
    });

    it('does not expose refresh without client credentials', () => {
      const auth = createAuthProvider({ mode: 'oauth', oauthToken: 'tok' });
      assert.strictEqual(auth.refresh, undefined);
    });

    it('throws when neither a token nor client credentials are configured', () => {
      assert.throws(() => createAuthProvider({ mode: 'oauth' }), /oauth/i);
    });
  });

  describe('client 401 handling', () => {
    it('refreshes once and retries with the new token', async () => {
      let tokenCalls = 0;
      let apiCalls = 0;
      const apiAuthHeaders: (string | undefined)[] = [];
      globalThis.fetch = (async (url: any, init: any) => {
        if (String(url).includes('/oauth/tokens')) {
          tokenCalls++;
          return jsonResponse({ access_token: 'tok_fresh', expires_in: 3600, scope: 'read' });
        }
        apiCalls++;
        apiAuthHeaders.push(init?.headers?.Authorization);
        if (apiCalls === 1)
          return jsonResponse({ error: 'Unauthorized' }, 401);
        return jsonResponse({ ticket: { id: 7 } });
      }) as any;

      const auth = createAuthProvider({
        mode: 'oauth',
        subdomain: 'mycorp',
        oauthClientId: 'id1',
        oauthClientSecret: 'sec1',
        oauthToken: 'tok_stale',
        oauthTokenExpiresAt: nowSeconds() + 3600,
      });
      const client = new ZendeskClient('mycorp', auth);

      const result = await client.request('GET', '/api/v2/tickets/7');
      assert.deepStrictEqual(result, { ticket: { id: 7 } });
      assert.strictEqual(tokenCalls, 1);
      assert.deepStrictEqual(apiAuthHeaders, ['Bearer tok_stale', 'Bearer tok_fresh']);
    });

    it('refreshes only once when the retry also returns 401', async () => {
      let tokenCalls = 0;
      globalThis.fetch = (async (url: any) => {
        if (String(url).includes('/oauth/tokens')) {
          tokenCalls++;
          return jsonResponse({ access_token: 'tok_fresh', expires_in: 3600 });
        }
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }) as any;

      const auth = createAuthProvider({
        mode: 'oauth',
        subdomain: 'mycorp',
        oauthClientId: 'id1',
        oauthClientSecret: 'sec1',
        oauthToken: 'tok_stale',
        oauthTokenExpiresAt: nowSeconds() + 3600,
      });
      const client = new ZendeskClient('mycorp', auth);

      await assert.rejects(client.request('GET', '/api/v2/tickets/7'), /Unauthorized/);
      assert.strictEqual(tokenCalls, 1);
    });

    it('does not refresh on non-401 errors', async () => {
      let tokenCalls = 0;
      globalThis.fetch = (async (url: any) => {
        if (String(url).includes('/oauth/tokens')) {
          tokenCalls++;
          return jsonResponse({ access_token: 'tok_fresh', expires_in: 3600 });
        }
        return jsonResponse({ error: 'RecordNotFound' }, 404);
      }) as any;

      const auth = createAuthProvider({
        mode: 'oauth',
        subdomain: 'mycorp',
        oauthClientId: 'id1',
        oauthClientSecret: 'sec1',
        oauthToken: 'tok_stale',
        oauthTokenExpiresAt: nowSeconds() + 3600,
      });
      const client = new ZendeskClient('mycorp', auth);

      await assert.rejects(client.request('GET', '/api/v2/tickets/7'), /RecordNotFound/);
      assert.strictEqual(tokenCalls, 0);
    });

    it('keeps legacy behaviour without client credentials', async () => {
      let tokenCalls = 0;
      globalThis.fetch = (async (url: any) => {
        if (String(url).includes('/oauth/tokens')) {
          tokenCalls++;
          return jsonResponse({ access_token: 'tok_fresh' });
        }
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }) as any;

      const auth = createAuthProvider({ mode: 'oauth', oauthToken: 'tok_stale' });
      const client = new ZendeskClient('mycorp', auth);

      await assert.rejects(client.request('GET', '/api/v2/tickets/7'), /Unauthorized/);
      assert.strictEqual(tokenCalls, 0);
    });

    it('writes the refreshed token back to the rc file', async () => {
      globalThis.fetch = (async (url: any) => {
        if (String(url).includes('/oauth/tokens'))
          return jsonResponse({ access_token: 'tok_new', expires_in: 3600, scope: 'read' });
        return jsonResponse({ ticket: { id: 7 } });
      }) as any;

      const auth = createAuthProvider({
        mode: 'oauth',
        subdomain: 'mycorp',
        oauthClientId: 'id1',
        oauthClientSecret: 'sec1',
        oauthToken: 'tok_old',
        oauthTokenExpiresAt: nowSeconds() + 10,
        persist: (token) => saveOauthToken(undefined, token),
      });
      const client = new ZendeskClient('mycorp', auth);

      await client.request('GET', '/api/v2/tickets/7');

      const rcPath = process.env.ZENDESK_RC_PATH!;
      const rc = JSON.parse(fs.readFileSync(rcPath, 'utf-8'));
      assert.strictEqual(rc.profiles.default.oauthToken, 'tok_new');
      assert.ok(rc.profiles.default.oauthTokenExpiresAt > nowSeconds() + 3500);
      assert.strictEqual(rc.profiles.default.oauthScopeGranted, 'read');
      assert.strictEqual(fs.statSync(rcPath).mode & 0o777, 0o600);
    });
  });
});
