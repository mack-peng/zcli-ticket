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
}

interface RcFile {
  active: string;
  profiles: Record<string, ProfileConfig>;
}

export interface Config {
  subdomain: string;
  email: string;
  mode: 'api-token' | 'basic' | 'oauth';
  token?: string;
  password?: string;
  oauthToken?: string;
  output: 'text' | 'json';
  raw: boolean;
}

export const rcFilePath = path.join(os.homedir(), '.zendeskrc');

function readRcFile(): RcFile {
  try {
    const content = fs.readFileSync(rcFilePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { active: 'default', profiles: {} };
  }
}

function writeRcFile(rc: RcFile): void {
  fs.writeFileSync(rcFilePath, JSON.stringify(rc, null, 2) + '\n');
}

function resolveProfileName(args: MinimistArgs): string {
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
  const profile = resolveProfile(args);

  const subdomain = (args.s as string) || (args.subdomain as string) || profile.subdomain;
  const email = (args.e as string) || (args.email as string) || profile.email;
  const token = (args.token as string) || profile.token;
  const password = (args.password as string) || profile.password;
  const oauthToken = (args['oauth-token'] as string) || profile.oauthToken;

  const mode: 'api-token' | 'basic' | 'oauth' = oauthToken
    ? 'oauth'
    : token
      ? 'api-token'
      : password
        ? 'basic'
        : 'api-token';

  if (!subdomain || !email)
    throw new Error(
      'Missing required config. Set ZENDESK_SUBDOMAIN and ZENDESK_EMAIL env vars, ' +
      'or use --subdomain and --email flags, or run: zcli-ticket config-set <key> <value>'
    );

  return {
    subdomain,
    email,
    mode,
    token,
    password,
    oauthToken,
    output: args.json ? 'json' : 'text',
    raw: !!args.raw,
  };
}

export function maskConfig(config: Config): Record<string, string> {
  return {
    subdomain: config.subdomain,
    email: config.email,
    mode: config.mode,
    token: config.token ? config.token.slice(0, 4) + '***' + config.token.slice(-2) : '(not set)',
    password: config.password ? '****' : '(not set)',
    oauthToken: config.oauthToken ? config.oauthToken.slice(0, 6) + '...' : '(not set)',
    output: config.output,
  };
}

export function writeRcConfig(key: string, value: string, profileName?: string): Record<string, string> {
  const rc = readRcFile();
  const name = profileName || rc.active;
  if (!rc.profiles[name])
    rc.profiles[name] = { subdomain: '', email: '' };
  const p = rc.profiles[name];
  (p as unknown as Record<string, string>)[key] = value;
  writeRcFile(rc);
  return { profile: name, [key]: key === 'token' || key === 'password' ? '****' : value };
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

export function listProfiles(): string[] {
  const rc = readRcFile();
  return Object.keys(rc.profiles);
}

export function resolveActiveProfileName(): string {
  return readRcFile().active;
}
