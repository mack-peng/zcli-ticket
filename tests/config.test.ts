import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { maskConfig, writeRcConfig, getRcConfig, loadConfig, formatLocalTime } from '../src/config/config';

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

    it('masks oauth secrets and shows expiry details', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const result = maskConfig({
        subdomain: 'x', email: 'a@b.c', mode: 'oauth',
        oauthToken: 'abcdef123456', oauthClientId: 'client-id', oauthClientSecret: 'secret-value',
        oauthTokenExpiresAt: expiresAt, output: 'text', raw: false,
      });
      assert.strictEqual(result.oauthToken, 'abcdef...');
      assert.strictEqual(result.oauthClientSecret, 'secret...');
      assert.strictEqual(result.oauthClientId, 'client-id');
      assert.strictEqual(result.oauthTokenExpiresAt, formatLocalTime(expiresAt));
      assert.match(result.oauthTokenExpiresIn, /^3\d\d\ds$/);
    });

    it('shows (not set) for oauth expiry when unknown', () => {
      const result = maskConfig({
        subdomain: 'x', email: 'a@b.c', mode: 'oauth',
        oauthToken: 'tok', output: 'text', raw: false,
      });
      assert.strictEqual(result.oauthTokenExpiresAt, '(not set)');
      assert.strictEqual(result.oauthTokenExpiresIn, '(not set)');
      assert.strictEqual(result.oauthClientSecret, '(not set)');
    });

    it('fully masks secrets shorter than the reveal prefix', () => {
      const result = maskConfig({
        subdomain: 'x', email: 'a@b.c', mode: 'oauth',
        oauthToken: 'abc', oauthClientSecret: 's3cret',
        output: 'text', raw: false,
      });
      assert.strictEqual(result.oauthToken, '****');
      assert.strictEqual(result.oauthClientSecret, '****');
    });
  });

  describe('rc file', () => {
    let rcDir: string;
    let rcPath: string;

    beforeEach(() => {
      rcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcli-config-'));
      rcPath = path.join(rcDir, '.zendeskrc');
      process.env.ZENDESK_RC_PATH = rcPath;
      delete process.env.ZENDESK_PROFILE;
    });

    afterEach(() => {
      delete process.env.ZENDESK_RC_PATH;
      delete process.env.ZENDESK_PROFILE;
      delete process.env.ZENDESK_SUBDOMAIN;
      delete process.env.ZENDESK_EMAIL;
      delete process.env.ZENDESK_TOKEN;
      delete process.env.ZENDESK_PASSWORD;
      delete process.env.ZENDESK_OAUTH_TOKEN;
      delete process.env.ZENDESK_OAUTH_CLIENT_ID;
      delete process.env.ZENDESK_OAUTH_CLIENT_SECRET;
      delete process.env.ZENDESK_OAUTH_SCOPE;
      fs.rmSync(rcDir, { recursive: true, force: true });
    });

    it('normalizes oauth-token to oauthToken', () => {
      writeRcConfig('oauth-token', 'tok_123');
      const rc = getRcConfig();
      assert.strictEqual(rc.profiles.default.oauthToken, 'tok_123');
      assert.ok(!('oauth-token' in rc.profiles.default));
    });

    it('masks sensitive values in the config-set result', () => {
      const result = writeRcConfig('oauth-client-secret', 'super-secret');
      assert.strictEqual(result.oauthClientSecret, '****');
      assert.ok(!JSON.stringify(result).includes('super-secret'));
    });

    it('reads legacy kebab keys and migrates them on the next write', () => {
      fs.writeFileSync(rcPath, JSON.stringify({
        active: 'default',
        profiles: { default: { subdomain: 'mycorp', email: 'a@b.c', 'oauth-token': 'legacy_tok', 'oauth-client-id': 'legacy_id' } },
      }) + '\n');

      const config = loadConfig({ _: [] } as any);
      assert.strictEqual(config.oauthToken, 'legacy_tok');
      assert.strictEqual(config.oauthClientId, 'legacy_id');
      assert.strictEqual(config.mode, 'oauth');

      writeRcConfig('email', 'new@corp.com');
      const raw = JSON.parse(fs.readFileSync(rcPath, 'utf-8'));
      assert.strictEqual(raw.profiles.default['oauth-token'], undefined);
      assert.strictEqual(raw.profiles.default['oauth-client-id'], undefined);
      assert.strictEqual(raw.profiles.default.oauthToken, 'legacy_tok');
      assert.strictEqual(raw.profiles.default.oauthClientId, 'legacy_id');
      assert.strictEqual(raw.profiles.default.email, 'new@corp.com');
    });

    it('writes the rc file with 0600 permissions', () => {
      writeRcConfig('token', 'x');
      assert.strictEqual(fs.statSync(rcPath).mode & 0o777, 0o600);
    });

    it('ignores credential environment variables', () => {
      fs.writeFileSync(rcPath, JSON.stringify({
        active: 'default',
        profiles: { default: { subdomain: 'rccorp', email: 'rc@corp.com', token: 'rctok' } },
      }) + '\n');
      process.env.ZENDESK_SUBDOMAIN = 'envcorp';
      process.env.ZENDESK_EMAIL = 'env@corp.com';
      process.env.ZENDESK_TOKEN = 'envtok';

      const config = loadConfig({ _: [] } as any);
      assert.strictEqual(config.subdomain, 'rccorp');
      assert.strictEqual(config.email, 'rc@corp.com');
      assert.strictEqual(config.token, 'rctok');
      assert.strictEqual(config.mode, 'api-token');
    });

    it('prefers CLI flags over profile values', () => {
      fs.writeFileSync(rcPath, JSON.stringify({
        active: 'default',
        profiles: { default: { subdomain: 'rccorp', email: 'rc@corp.com', token: 'rctok' } },
      }) + '\n');

      const config = loadConfig({ _: [], s: 'flagcorp', e: 'flag@corp.com' } as any);
      assert.strictEqual(config.subdomain, 'flagcorp');
      assert.strictEqual(config.email, 'flag@corp.com');
      assert.strictEqual(config.token, 'rctok');
    });

    it('selects the profile via ZENDESK_PROFILE', () => {
      fs.writeFileSync(rcPath, JSON.stringify({
        active: 'default',
        profiles: { default: { subdomain: 'a', email: 'a@corp.com' }, sxl: { subdomain: 'b', email: 'b@corp.com' } },
      }) + '\n');
      process.env.ZENDESK_PROFILE = 'sxl';

      const config = loadConfig({ _: [] } as any);
      assert.strictEqual(config.profile, 'sxl');
      assert.strictEqual(config.subdomain, 'b');
      assert.strictEqual(config.email, 'b@corp.com');
    });

    it('writes to a named profile without touching others', () => {
      fs.writeFileSync(rcPath, JSON.stringify({
        active: 'default',
        profiles: { default: { subdomain: 'a', email: 'a@corp.com' }, sxl: { subdomain: 'b', email: 'b@corp.com' } },
      }) + '\n');

      writeRcConfig('oauth-token', 'tok_sxl', 'sxl');
      const raw = JSON.parse(fs.readFileSync(rcPath, 'utf-8'));
      assert.strictEqual(raw.profiles.sxl.oauthToken, 'tok_sxl');
      assert.strictEqual(raw.profiles.default.oauthToken, undefined);
      assert.strictEqual(raw.active, 'default');
    });
  });
});
