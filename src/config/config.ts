import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { MinimistArgs } from '../cli/minimist';

export interface ProfileConfig {
  subdomain: string;
  email: string;
  token?: string;
  password?: string;
  oauthToken?: string;
  oauthTokenExpiresAt?: number;
  oauthScopeGranted?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthScope?: string;
  'oauth-token'?: string;
  'oauth-client-id'?: string;
  'oauth-client-secret'?: string;
  'oauth-scope'?: string;
}

interface RcFile {
  active: string;
  profiles: Record<string, ProfileConfig>;
}

export interface Config {
  profile?: string;
  subdomain: string;
  email: string;
  mode: 'api-token' | 'basic' | 'oauth';
  token?: string;
  password?: string;
  oauthToken?: string;
  oauthTokenExpiresAt?: number;
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthScope?: string;
  output: 'text' | 'json';
  raw: boolean;
  verbose?: boolean;
}

export const rcFilePath = path.join(os.homedir(), '.zendeskrc');

const KEY_ALIASES: Record<string, string> = {
  'oauth-token': 'oauthToken',
  'oauth-client-id': 'oauthClientId',
  'oauth-client-secret': 'oauthClientSecret',
  'oauth-scope': 'oauthScope',
};

const LEGACY_KEYS = Object.keys(KEY_ALIASES);
const SENSITIVE_KEYS = new Set(['token', 'password', 'oauthToken', 'oauthClientSecret']);

let cachedRc: { path: string; rc: RcFile; mtime: number; checked: number } | null = null;

function rcPath(): string {
  return process.env.ZENDESK_RC_PATH || rcFilePath;
}

function readRcFile(): RcFile {
  try {
    const target = rcPath();
    const stat = fs.statSync(target);
    if (cachedRc && cachedRc.path === target && cachedRc.mtime === stat.mtimeMs)
      return cachedRc.rc;
    const content = fs.readFileSync(target, 'utf-8');
    const rc = JSON.parse(content);
    cachedRc = { path: target, rc, mtime: stat.mtimeMs, checked: Date.now() };
    return rc;
  } catch {
    return { active: 'default', profiles: {} };
  }
}

function writeRcFile(rc: RcFile): void {
  const target = rcPath();
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rc, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, target);
  cachedRc = null;
}

function legacyKeyFor(key: string): string | undefined {
  return LEGACY_KEYS.find((legacy) => KEY_ALIASES[legacy] === key);
}

function readProfileValue(
  profile: ProfileConfig,
  key: 'oauthToken' | 'oauthClientId' | 'oauthClientSecret' | 'oauthScope'
): string | undefined {
  const record = profile as unknown as Record<string, unknown>;
  const legacy = legacyKeyFor(key);
  const value = record[key] ?? (legacy ? record[legacy] : undefined);
  return typeof value === 'string' && value.length ? value : undefined;
}

function migrateLegacyKeys(profile: ProfileConfig): void {
  const record = profile as unknown as Record<string, unknown>;
  for (const legacy of LEGACY_KEYS) {
    const canonical = KEY_ALIASES[legacy];
    const value = record[legacy];
    if (value !== undefined && record[canonical] === undefined)
      record[canonical] = value;
    delete record[legacy];
  }
}

function normalizeKey(key: string): string {
  return KEY_ALIASES[key] ?? key;
}

export function maskSecret(value?: string): string {
  if (!value)
    return '(not set)';
  return value.length > 6 ? value.slice(0, 6) + '...' : '****';
}

export function formatLocalTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function resolveProfileName(args: MinimistArgs): string {
  const fromArgs = (args.p as string) || (args.profile as string);
  const fromEnv = process.env.ZENDESK_PROFILE;
  if (fromArgs)
    return fromArgs;
  if (fromEnv)
    return fromEnv;
  return readRcFile().active;
}

function resolveProfile(args: MinimistArgs): ProfileConfig {
  const name = resolveProfileName(args);
  const rc = readRcFile();
  const profile = rc.profiles[name];
  if (!profile)
    throw new Error(`Profile '${name}' not found. Run: zcli-ticket config-new ${name}`);
  return profile;
}

export function loadConfig(args: MinimistArgs): Config {
  const profileName = resolveProfileName(args);
  const profile = resolveProfile(args);

  const subdomain = (args.s as string) || (args.subdomain as string) || profile.subdomain;
  const email = (args.e as string) || (args.email as string) || profile.email;
  const token = (args.token as string) || profile.token;
  const password = (args.password as string) || profile.password;
  const oauthToken = (args['oauth-token'] as string) || readProfileValue(profile, 'oauthToken');
  const oauthClientId = (args['oauth-client-id'] as string) || readProfileValue(profile, 'oauthClientId');
  const oauthClientSecret = (args['oauth-client-secret'] as string) || readProfileValue(profile, 'oauthClientSecret');
  const oauthScope = (args['oauth-scope'] as string) || readProfileValue(profile, 'oauthScope');

  const mode: 'api-token' | 'basic' | 'oauth' =
    oauthToken || (oauthClientId && oauthClientSecret)
      ? 'oauth'
      : token
        ? 'api-token'
        : password
          ? 'basic'
          : 'api-token';

  if (!subdomain || !email)
    throw new Error(
      'Missing required config. Use --subdomain and --email flags, ' +
      'or run: zcli-ticket config-set <key> <value>'
    );

  return {
    profile: profileName,
    subdomain,
    email,
    mode,
    token,
    password,
    oauthToken,
    oauthTokenExpiresAt: profile.oauthTokenExpiresAt,
    oauthClientId,
    oauthClientSecret,
    oauthScope,
    output: args.json ? 'json' : 'text',
    raw: !!args.raw,
    verbose: !!args.verbose,
  };
}

export interface OauthClientConfig {
  profile: string;
  subdomain: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
}

export function loadOauthClientConfig(args: MinimistArgs): OauthClientConfig {
  const profileName = resolveProfileName(args);
  const profile = resolveProfile(args);
  const subdomain = (args.s as string) || (args.subdomain as string) || profile.subdomain;
  if (!subdomain)
    throw new Error('Missing subdomain. Run: zcli-ticket config-set subdomain <subdomain>');

  return {
    profile: profileName,
    subdomain,
    clientId: (args['oauth-client-id'] as string) || readProfileValue(profile, 'oauthClientId'),
    clientSecret: (args['oauth-client-secret'] as string) || readProfileValue(profile, 'oauthClientSecret'),
    scope: (args['oauth-scope'] as string) || readProfileValue(profile, 'oauthScope'),
  };
}

export function configFromProfile(profile: ProfileConfig): Config {
  const oauthToken = readProfileValue(profile, 'oauthToken');
  const oauthClientId = readProfileValue(profile, 'oauthClientId');
  const oauthClientSecret = readProfileValue(profile, 'oauthClientSecret');

  return {
    subdomain: profile.subdomain || '',
    email: profile.email || '',
    mode:
      oauthToken || (oauthClientId && oauthClientSecret)
        ? 'oauth'
        : profile.token
          ? 'api-token'
          : profile.password
            ? 'basic'
            : 'api-token',
    token: profile.token,
    password: profile.password,
    oauthToken,
    oauthTokenExpiresAt: profile.oauthTokenExpiresAt,
    oauthClientId,
    oauthClientSecret,
    oauthScope: readProfileValue(profile, 'oauthScope'),
    output: 'text',
    raw: false,
    verbose: false,
  };
}

export function maskConfig(config: Config): Record<string, string> {
  const expiresAt = config.oauthTokenExpiresAt;
  const remaining = expiresAt ? expiresAt - Math.floor(Date.now() / 1000) : undefined;

  return {
    subdomain: config.subdomain,
    email: config.email,
    mode: config.mode,
    token: config.token ? config.token.slice(0, 4) + '***' + config.token.slice(-2) : '(not set)',
    password: config.password ? '****' : '(not set)',
    oauthToken: maskSecret(config.oauthToken),
    oauthClientId: config.oauthClientId || '(not set)',
    oauthClientSecret: maskSecret(config.oauthClientSecret),
    oauthScope: config.oauthScope || '(not set)',
    oauthTokenExpiresAt: expiresAt ? formatLocalTime(expiresAt) : '(not set)',
    oauthTokenExpiresIn: remaining !== undefined ? `${remaining}s` : '(not set)',
    output: config.output,
  };
}

export function writeRcConfig(key: string, value: string, profileName?: string): Record<string, string> {
  const rc = readRcFile();
  const name = profileName || rc.active;
  if (!rc.profiles[name])
    rc.profiles[name] = { subdomain: '', email: '' };
  const p = rc.profiles[name];
  const canonicalKey = normalizeKey(key);
  (p as unknown as Record<string, string>)[canonicalKey] = value;
  migrateLegacyKeys(p);
  writeRcFile(rc);
  return { profile: name, [canonicalKey]: SENSITIVE_KEYS.has(canonicalKey) ? '****' : value };
}

export interface OauthTokenData {
  accessToken: string;
  expiresAt?: number;
  scopeGranted?: string;
}

export function saveOauthToken(profileName: string | undefined, data: OauthTokenData): void {
  const rc = readRcFile();
  const name = profileName || rc.active;
  if (!rc.profiles[name])
    rc.profiles[name] = { subdomain: '', email: '' };
  const p = rc.profiles[name];
  p.oauthToken = data.accessToken;
  if (data.expiresAt !== undefined)
    p.oauthTokenExpiresAt = data.expiresAt;
  else
    delete p.oauthTokenExpiresAt;
  if (data.scopeGranted)
    p.oauthScopeGranted = data.scopeGranted;
  migrateLegacyKeys(p);
  writeRcFile(rc);
}

export function getRcConfig(): { active: string; profiles: Record<string, ProfileConfig> } {
  const rc = readRcFile();
  return { active: rc.active, profiles: rc.profiles };
}

export function setActiveProfile(name: string): void {
  const rc = readRcFile();
  if (!rc.profiles[name])
    throw new Error(`Profile '${name}' not found`);
  rc.active = name;
  writeRcFile(rc);
}

export function createProfile(name: string): void {
  const rc = readRcFile();
  if (rc.profiles[name])
    throw new Error(`Profile '${name}' already exists`);
  rc.profiles[name] = { subdomain: '', email: '' };
  writeRcFile(rc);
}
