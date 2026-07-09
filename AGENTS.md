# AGENTS.md

## Project

`zcli-ticket` — CLI for Zendesk Ticketing API. Entrypoint: `bin/zcli-ticket.js` → `require('../dist/index')`.  
Build: `npm run build` (= `tsc && tsx scripts/generate-help.ts` — compiles TS, then generates `help.json` directly into `dist/`).  
Test: `npm test` (= `tsx --test tests/*.test.ts` — Node.js built-in test runner, 43 tests).  
Dependencies: `zod`. Dev: `typescript`, `@types/node`, `tsx`.

## Architecture

```
src/
├── index.ts               # export { program } from './cli/program'
├── cli/
│   ├── program.ts          # Entry: minimist parse → dispatch → ZendeskClient call
│   ├── commands.ts         # 78 command definitions — all Zod schemas
│   ├── command.ts          # declareCommand(), parseCommand() (Zod validation)
│   ├── output.ts           # TextOutput / JsonOutput strategy pattern
│   └── minimist.ts         # Arguments parser (forked from playwright-cli)
├── api/
│   ├── client.ts           # ZendeskClient — fetch(), 429 retry, upload(), cursor pagination
│   └── auth.ts             # AuthProvider factory (API token / Basic / OAuth)
├── config/
│   ├── config.ts           # Config loader (CLI → env → ~/.zendeskrc profiles)
│   └── helpGenerator.ts    # Build-time: Zod schemas → dist/help.json
└── bin/
    └── zcli-ticket.js      # npm bin entry
```

## Key Patterns

- **Command definition**: `declareCommand({ name, category, description, args?, options?, api: { method, path }, transformRequest?, transformResponse?, list?, upload?, jsonFile? })` — purely declarative, no execution logic
- **Command → API pipeline**: `minimist` parse → `parseCommand()` Zod validate → (if `jsonFile`: read file) → `transformRequest()` map to API JSON → `ZendeskClient.request/list()` → `transformResponse()` extract → `Output.format()`
- **Output strategy**: `Output` interface → `TextOutput` (human-readable tables for arrays, JSON for objects, `--raw` skips formatting) / `JsonOutput` (machine-readable JSON)
- **Config priority**: CLI flags → env vars → `~/.zendeskrc` profiles. Switch with `-p <profile>`.
- **Auth modes**: `api-token` (default, `email/token:token` base64), `basic` (`email:password` base64), `oauth` (Bearer token)
- **3 command categories**: API commands (dispatched to `ZendeskClient`), local config commands (Zod-validated then dispatched locally), `ticket-thread` (multi-API composition)
- **Schema flags**:
  - `list: true` → automatic cursor pagination (traverse all pages, merge results)
  - `upload: true` → multipart file upload dispatch
  - `jsonFile: true` → read JSON file, inject parsed content before transformRequest
  - `hidden: true` → exclude from help output
  - `raw: true` → skip output formatting
- **transformRequest**: Flattens CLI args into nested Zendesk API JSON (e.g. `--tags "a,b"` → `{ tags: ["a", "b"] }`)
- **transformResponse**: Extracts inner data from API response (e.g. `data.ticket`, `data.results`). Note: skipped for `list: true` commands since `client.list()` already extracts the array.
- **Rate limiting**: HTTP 429 → read `Retry-After` header → sleep → retry (transparent)
- **Idempotency**: All POST/PUT requests carry `Idempotency-Key` header (auto-generated UUID) to prevent duplicate creation
- **Domain resolution**: `mycorp` → `mycorp.zendesk.com`; `mycorp.zendesk.de` or `support.mycorp.com` → full domain support
- **Fetch timeout**: All HTTP requests have 30s AbortController timeout
- **Error format**: `Error: <message>` → JSON mode: `{ isError: true, error: "<message>" }` → `process.exit(1)`

## Adding a Command

1. Add `declareCommand({...})` in `src/cli/commands.ts` following the existing pattern
2. Append to `commandsArray` at the bottom of the file
3. Run `npm run build` to regenerate `help.json` and recompile
4. Run `npm test` to verify

## What Makes This Different from Commander-Based CLIs

| | Commander (dify-cli) | Zod-Driven (zcli-ticket) |
|---|---|---|
| Command definition | `program.command().option().action()` | `declareCommand({ name, args, options, api, ... })` |
| Validation | Runtime, per-handler | Build-time types + runtime Zod strict() |
| Argument model | Tree: subcommand → subcommand → action | Flat: `<command> [args...] [--options...]` |
| Output | Fixed `JSON.stringify` | Strategy pattern (Text table / JSON / raw) |
| Help text | Manual strings | Generated from Zod `.describe()` at build time |
| CLI ↔ API mapping | Inline in action handler | Declared in schema via `api.path`, `transformRequest` |
| Testability | Requires mocking Commander | Pure functions: `parseCommand(schema, args)` → result |
