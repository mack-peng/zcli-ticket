import fs from 'fs';
import path from 'path';
import os from 'os';
import { minimist } from './minimist';
import { parseCommand } from './command';
import { commands } from './commands';
import { TextOutput, JsonOutput } from './output';
import { loadConfig, maskConfig, writeRcConfig, rcFilePath, getRcConfig, setActiveProfile, createProfile } from '../config/config';
import { createAuthProvider } from '../api/auth';
import { ZendeskClient } from '../api/client';
import { buildSkillMd, buildPitfallsMd } from '../installer/skill-template';
import type { Output } from './output';
import type { MinimistArgs } from './minimist';
import type { AnyCommandSchema, HelpData, HelpEntry } from './command';
import type { Config } from '../config/config';

const globalOptions = ['json', 'raw', 'help', 'h', 'version', 'v', 's', 'subdomain', 'e', 'email', 'token', 'password', 'oauth-token', 'p', 'profile'];
const booleanGlobalOptions = ['help', 'json', 'raw', 'version', 'v', 'h'];

export async function program() {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'));
  const help: HelpData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'help.json'), 'utf-8'));

  const rawArgs = parseArgs(help);
  if (rawArgs.s) { rawArgs.subdomain = rawArgs.s; delete rawArgs.s; }
  if (rawArgs.e) { rawArgs.email = rawArgs.e; delete rawArgs.e; }
  if (rawArgs.p) { rawArgs.profile = rawArgs.p; delete rawArgs.p; }

  const output: Output = rawArgs.json
    ? new JsonOutput()
    : new TextOutput(!!rawArgs.raw);

  const commandName = rawArgs._[0];
  const cmdEntry = commandName ? help.commands[commandName] : undefined;
  const command: AnyCommandSchema | undefined = commands[commandName];

  handleGlobalFlags(rawArgs, commandName, cmdEntry, help, output, pkg.version);

  if (!cmdEntry || !command)
    output.error(`Unknown command: ${commandName}`);

  validateFlags(rawArgs, cmdEntry);

  if (handleConfigCommands(commandName, command, rawArgs, output))
    return;

  if (handleSkillCommands(commandName, command, rawArgs, output))
    return;

  if (await handleThreadCommand(commandName, command, rawArgs, output))
    return;

  await executeApiCommand(command, cmdEntry, rawArgs, output);
}

function parseArgs(help: HelpData): MinimistArgs {
  return minimist(process.argv.slice(2), {
    boolean: [...help.booleanOptions, ...booleanGlobalOptions],
    string: ['_'],
  });
}

function handleGlobalFlags(
  args: MinimistArgs,
  commandName: string | undefined,
  cmdEntry: HelpEntry | undefined,
  help: HelpData,
  output: Output,
  version: string
): void {
  if (args.version || args.v) {
    output.version(version);
    process.exit(0);
  }

  if (args.help || args.h || !commandName) {
    output.help(cmdEntry ? cmdEntry.help : help.global);
    process.exit(0);
  }
}

function setupClient(args: MinimistArgs): { config: Config; client: ZendeskClient } {
  const config = loadConfig(args);
  const auth = createAuthProvider({
    mode: config.mode,
    email: config.email,
    token: config.token,
    password: config.password,
    oauthToken: config.oauthToken,
  });
  const client = new ZendeskClient(config.subdomain, auth);
  return { config, client };
}

function handleConfigCommands(
  commandName: string,
  command: AnyCommandSchema,
  args: MinimistArgs,
  output: Output
): boolean {
  const cmdArgs = splitArgs(args);

  try {
    const parsed = parseCommand(command, cmdArgs as Record<string, string> & { _: string[] });

    switch (commandName) {
      case 'config-show': {
        const profileName = args.profile as string || undefined;
        if (profileName) {
          const rc = getRcConfig();
          const profile = rc.profiles[profileName];
          if (!profile)
            output.error(`Profile '${profileName}' not found`);
          const masked = maskConfig({
            subdomain: profile.subdomain || '',
            email: profile.email || '',
            mode: profile.oauthToken ? 'oauth' : profile.token ? 'api-token' : 'basic',
            token: profile.token,
            password: profile.password,
            oauthToken: profile.oauthToken,
            output: 'text',
            raw: false,
          });
          console.log(output.format({ active: rc.active, profile: profileName, ...masked }));
          return true;
        }
        const { config } = setupClient(args);
        console.log(output.format(maskConfig(config)));
        return true;
      }
      case 'config-set': {
        const profileName = args.profile as string || undefined;
        const result = writeRcConfig(parsed.key, parsed.value, profileName);
        console.log(output.format(result));
        return true;
      }
      case 'config-path': {
        console.log(output.format(rcFilePath));
        return true;
      }
      case 'config-list': {
        const rc = getRcConfig();
        const profiles = Object.entries(rc.profiles).map(([name, p]) => ({
          name,
          active: name === rc.active,
          subdomain: p.subdomain || '(not set)',
          email: p.email || '(not set)',
        }));
        console.log(output.format(profiles));
        return true;
      }
      case 'config-use': {
        setActiveProfile(parsed.name);
        console.log(output.format({ active: parsed.name }));
        return true;
      }
      case 'config-new': {
        createProfile(parsed.name);
        console.log(output.format({ created: parsed.name }));
        return true;
      }
    }
  } catch (e) {
    output.error(e instanceof Error ? e.message : String(e));
  }

  return false;
}

// ─── Agent Skill installation ──────────────────────────────────────

const AGENT_SKILL_DIRS: Record<string, string> = {
  claude: '.claude/skills',
  opencode: '.agents/skills',
  codex: '.codex/skills',
  cursor: '.agents/skills',
  hermes: '.hermes/skills',
  gemini: '.gemini/skills',
};

const SKILL_NAME = 'zcli-ticket';

function skillDirsForTarget(target: string): string[] {
  if (target === 'all') {
    const seen = new Set<string>();
    return Object.values(AGENT_SKILL_DIRS).filter(d => {
      if (seen.has(d)) return false;
      seen.add(d);
      return true;
    });
  }
  if (target === 'auto') {
    // For auto: write to ~/.agents/skills (cross-agent standard)
    // and ~/.claude/skills (Claude doesn't read .agents/skills)
    return ['.agents/skills', '.claude/skills'];
  }
  const dir = AGENT_SKILL_DIRS[target];
  if (dir) return [dir];
  throw new Error(`Unknown agent target: ${target}. Known: ${Object.keys(AGENT_SKILL_DIRS).join(', ')}, auto, all`);
}

function writeSkill(dir: string, verbose = false): 'created' | 'updated' | 'unchanged' {
  const skillRoot = path.join(dir, SKILL_NAME);
  if (!fs.existsSync(skillRoot)) fs.mkdirSync(skillRoot, { recursive: true });

  const skillMdPath = path.join(skillRoot, 'SKILL.md');
  const refsDir = path.join(skillRoot, 'references');
  if (!fs.existsSync(refsDir)) fs.mkdirSync(refsDir, { recursive: true });
  const pitfallsPath = path.join(refsDir, 'pitfalls.md');

  const skillContent = buildSkillMd();
  const pitfallsContent = buildPitfallsMd();

  let existingSkill: string | null = null;
  let existingPitfalls: string | null = null;
  try { existingSkill = fs.readFileSync(skillMdPath, 'utf-8'); } catch { /* file missing */ }
  try { existingPitfalls = fs.readFileSync(pitfallsPath, 'utf-8'); } catch { /* file missing */ }

  if (existingSkill === skillContent && existingPitfalls === pitfallsContent) {
    if (verbose) console.log(`  unchanged: ${skillRoot}`);
    return 'unchanged';
  }

  fs.writeFileSync(skillMdPath, skillContent);
  fs.writeFileSync(pitfallsPath, pitfallsContent);

  const action = existingSkill ? 'updated' : 'created';
  if (verbose) console.log(`  ${action}: ${skillRoot}`);
  return action;
}

function removeSkill(dir: string, verbose = false): 'removed' | 'not-found' {
  const skillRoot = path.join(dir, SKILL_NAME);
  const skillMdPath = path.join(skillRoot, 'SKILL.md');

  if (!fs.existsSync(skillMdPath)) {
    if (verbose) console.log(`  not found: ${skillRoot}`);
    return 'not-found';
  }

  function rmRf(d: string) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) rmRf(full);
      else try { fs.unlinkSync(full); } catch { /* ignore */ }
    }
    try { fs.rmdirSync(d); } catch { /* ignore */ }
  }

  rmRf(skillRoot);
  if (verbose) console.log(`  removed: ${skillRoot}`);
  return 'removed';
}

function handleSkillCommands(
  commandName: string,
  command: AnyCommandSchema,
  args: MinimistArgs,
  output: Output
): boolean {
  if (commandName !== 'skill-install' && commandName !== 'skill-uninstall') return false;

  const target = (args.target as string) || 'auto';

  try {
    if (commandName === 'skill-install') {
      const baseDir = (args.path as string) || path.join(os.homedir());
      const dirs = skillDirsForTarget(target);
      const fullDirs = dirs.map(d => path.resolve(baseDir, d));

      for (const d of fullDirs) writeSkill(d, true);
      console.log(output.format({ installed: fullDirs }));
    } else {
      const baseDir = (args.path as string) || path.join(os.homedir());
      const dirs = skillDirsForTarget(target);
      const fullDirs = dirs.map(d => path.resolve(baseDir, d));

      for (const d of fullDirs) removeSkill(d, true);
      console.log(output.format({ removed: fullDirs }));
    }
  } catch (e) {
    output.error(e instanceof Error ? e.message : String(e));
  }

  return true;
}

async function handleThreadCommand(
  commandName: string,
  command: AnyCommandSchema,
  args: MinimistArgs,
  output: Output
): Promise<boolean> {
  if (commandName !== 'ticket-thread') return false;

  try {
    const { client } = setupClient(args);
    const cmdArgs = splitArgs(args);
    const parsed = parseCommand(command, cmdArgs as Record<string, string> & { _: string[] });

    const pathStr = `/api/v2/tickets/${parsed.id}`;
    const commentsPath = `/api/v2/tickets/${parsed.id}/comments`;

    const [ticketResp, comments] = await Promise.all([
      client.request('GET', pathStr),
      client.list('GET', commentsPath),
    ]);

    const ticket = ticketResp.ticket || ticketResp;
    ticket._comments = comments;

    console.log(output.format(ticket));
    return true;
  } catch (e) {
    output.error(e instanceof Error ? e.message : String(e));
  }
}

async function executeApiCommand(
  command: AnyCommandSchema,
  cmdEntry: HelpEntry,
  args: MinimistArgs,
  output: Output
) {
  try {
    const { client } = setupClient(args);
    const cmdArgs = splitArgs(args);
    let parsed = parseCommand(command, cmdArgs as Record<string, string> & { _: string[] });

    if (command.jsonFile && parsed.file) {
      const raw = JSON.parse(fs.readFileSync(parsed.file, 'utf-8'));
      parsed = raw;
    }

    let result: any;
    if (command.upload) {
      result = await client.upload(parsed.file, parsed.filename, args.token as boolean || false);
    } else {
      const pathStr = typeof command.api.path === 'function'
        ? (command.api.path as (...a: any[]) => string)(parsed)
        : command.api.path;
      result = await dispatchRequest(command, args, parsed, client, pathStr, cmdEntry);
    }

    const finalResult = (command.list && !command.upload) ? result : (command.transformResponse ? command.transformResponse(result) : result);
    console.log(output.format(finalResult));
  } catch (e) {
    output.error(e instanceof Error ? e.message : String(e));
  }
}

async function dispatchRequest(
  command: AnyCommandSchema,
  args: MinimistArgs,
  parsed: Record<string, any>,
  client: ZendeskClient,
  pathStr: string,
  cmdEntry: HelpEntry
): Promise<any> {
  const queryFlags = extractQueryFlags(args, cmdEntry);
  const transformed = command.transformRequest ? command.transformRequest(parsed) : parsed;

  if (command.list) {
    const queryParams = { ...queryFlags, ...filterQueryParams(transformed) };
    return client.list(command.api.method, pathStr, queryParams);
  }

  const method = command.api.method;
  const isBodyMethod = method !== 'GET' && method !== 'DELETE';
  const queryParams = isBodyMethod
    ? queryFlags
    : { ...queryFlags, ...filterQueryParams(transformed) };
  const apiOptions: Record<string, any> = { queryParams };
  if (isBodyMethod)
    apiOptions.body = transformed;
  return client.request(method, pathStr, apiOptions);
}

function splitArgs(args: MinimistArgs): MinimistArgs {
  const result: MinimistArgs = { _: args._ };
  for (const key of Object.keys(args)) {
    if (key === '_' || globalOptions.includes(key)) continue;
    result[key] = args[key];
  }
  return result;
}

function extractQueryFlags(args: MinimistArgs, cmdEntry: HelpEntry): Record<string, any> {
  const params: Record<string, any> = {};
  const cmdFlags = Object.keys(cmdEntry.flags || {});
  for (const key of Object.keys(args)) {
    if (key === '_' || globalOptions.includes(key)) continue;
    if (cmdFlags.includes(key))
      params[key] = args[key];
  }
  return params;
}

function filterQueryParams(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null && typeof value !== 'object')
      result[key] = value;
  }
  return result;
}

function validateFlags(args: MinimistArgs, cmdEntry: { flags: Record<string, 'boolean' | 'string'> }) {
  const unknownFlags: string[] = [];
  for (const key of Object.keys(args)) {
    if (key === '_') continue;
    if (globalOptions.includes(key)) continue;
    if (!(key in cmdEntry.flags))
      unknownFlags.push(key);
  }
  if (unknownFlags.length)
    throw new Error(`Unknown option${unknownFlags.length > 1 ? 's' : ''}: ${unknownFlags.map(f => `--${f}`).join(', ')}`);
}
