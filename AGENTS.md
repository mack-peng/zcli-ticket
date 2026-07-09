# AGENTS.md

## Project

`zendesk-cli` — CLI for Zendesk Ticketing API. Entrypoint: `bin/zendesk-cli.js` → `require('../dist/index')`.  
Build: `npm run build` (= `tsx scripts/generate-help.ts && tsc` — generates `help.json` from Zod schemas, then compiles).  
Test: `npm test` (= `tsx --test tests/*.test.ts` — Node.js built-in test runner, 43 tests).  
Dependencies: `zod`. Dev: `typescript`, `@types/node`, `tsx`.

## Architecture

```
src/
├── index.ts               # export { program } from './cli/program'
├── help.json              # Build artifact: generated from commands.ts Zod schemas
├── cli/
│   ├── program.ts          # Entry: minimist parse → dispatch → ZendeskClient call
│   ├── commands.ts         # 72 command definitions — all Zod schemas
│   ├── command.ts          # declareCommand(), parseCommand() (Zod validation)
│   ├── output.ts           # TextOutput / JsonOutput strategy pattern
│   └── minimist.ts         # Arguments parser (forked from playwright-cli)
├── api/
│   ├── client.ts           # ZendeskClient — fetch(), 429 retry, cursor pagination
│   └── auth.ts             # AuthProvider factory (API token / Basic / OAuth)
├── config/
│   ├── config.ts           # Config loader (CLI flags → env → ~/.zendeskrc)
│   └── helpGenerator.ts    # Build-time: Zod schemas → help.json
└── bin/
    └── zendesk-cli.js      # npm bin entry
```

## Key Patterns

- **Command definition**: `declareCommand({ name, category, description, args?, options?, api: { method, path }, transformRequest?, transformResponse?, list? })` — purely declarative, no execution logic
- **Command → API pipeline**: `minimist` parse → `parseCommand()` Zod validate → `transformRequest()` map to API JSON → `ZendeskClient.request/list()` → `transformResponse()` extract → `Output.format()`
- **Output strategy**: `Output` interface → `TextOutput` (human-readable tables for arrays, JSON for objects) / `JsonOutput` (machine-readable JSON) — selected by `--json` flag
- **Config priority**: CLI flags (`-s`, `-e`, `--token`) → env vars (`ZENDESK_SUBDOMAIN`, `ZENDESK_EMAIL`, `ZENDESK_TOKEN`) → `~/.zendeskrc`
- **Auth modes**: `api-token` (default, `email/token:token` base64), `basic` (`email:password` base64), `oauth` (Bearer token)
- **3 command categories**: API commands (dispatched to `ZendeskClient`), local config commands (`config-show`, `config-set`, `config-path`), global flags (`--help`, `--version`, `--json`)
- **List commands**: `list: true` → automatic cursor pagination (traverse all pages, merge results)
- **transformRequest**: Flattens CLI args into nested Zendesk API JSON (e.g. `--tags "a,b"` → `{ tags: ["a", "b"] }`)
- **transformResponse**: Extracts inner data from API response (e.g. `data.ticket`, `data.results`)
- **Rate limiting**: HTTP 429 → read `Retry-After` header → sleep → retry (transparent)
- **Error format**: `Error: <message>` → JSON mode: `{ isError: true, error: "<message>" }` → `process.exit(1)`

## Adding a Command

1. Add `declareCommand({...})` in `src/cli/commands.ts` following the existing pattern
2. Append to `commandsArray` at the bottom of the file
3. Run `npm run build` to regenerate `help.json` and recompile
4. Run `npm test` to verify

## What Makes This Different from Commander-Based CLIs

| | Commander (dify-cli) | Zod-Driven (zendesk-cli) |
|---|---|---|
| Command definition | `program.command().option().action()` | `declareCommand({ name, args, options, api, ... })` |
| Validation | Runtime, per-handler | Build-time types + runtime Zod strict() |
| Argument model | Tree: subcommand → subcommand → action | Flat: `<command> [args...] [--options...]` |
| Output | Fixed `JSON.stringify` | Strategy pattern (Text table / JSON) |
| Help text | Manual strings | Generated from Zod `.describe()` at build time |
| CLI ↔ API mapping | Inline in action handler | Declared in schema via `api.path`, `transformRequest` |
| Testability | Requires mocking Commander | Pure functions: `parseCommand(schema, args)` → result |
