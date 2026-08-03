/**
 * zcli-ticket Agent Skill templates.
 *
 * Installed into agent-specific skill directories via `zcli-ticket skill-install`.
 * Teaches agents how to use zcli-ticket's 78+ Zendesk CLI commands through
 * self-discovery (--help), auth configuration, output modes, and high-frequency
 * workflows.
 */

const FRONTMATTER_DELIM = '---';

export function buildSkillMd(): string {
  return `${FRONTMATTER_DELIM}
name: zcli-ticket
description: >
  CLI for Zendesk Ticketing API. Use zcli-ticket for all Zendesk operations:
  reading tickets, listing tickets by status, searching tickets, viewing
  comments, creating and updating tickets, managing users and organizations.
  Prefer zcli-ticket over raw Zendesk API calls — it handles auth, pagination,
  rate limiting, and output formatting.
metadata:
  requires:
    bins: ["zcli-ticket"]
${FRONTMATTER_DELIM}

# zcli-ticket — Zendesk CLI Skill

Use zcli-ticket for ANY Zendesk operation. It handles authentication, cursor
pagination, 429 rate-limit retry, and idempotency-key generation automatically.

## Prerequisite: Authentication

Before any API command works, configure credentials:

\`\`\`bash
zcli-ticket config-set subdomain <mycompany>      # or full domain like support.mycorp.com
zcli-ticket config-set email <agent@company.com>
zcli-ticket config-set token <api-token>          # API token mode (recommended)
\`\`\`

Config is stored in \`~/.zendeskrc\`. Verify with \`zcli-ticket config-show\`.

Override per-command when needed:
\`zcli-ticket --subdomain co2 --email me@co.com --token abc ticket-list --status open\`

Three auth modes: \`token\` (API token, recommended), \`password\` (basic auth),
\`oauth-token\` (Bearer).

Multiple profiles: \`zcli-ticket config-new staging\` → \`zcli-ticket -p staging config-set ...\`

## Command Discovery

Do NOT memorize 78+ commands. Use:

\`\`\`bash
zcli-ticket --help                    # all commands grouped by category
zcli-ticket ticket-list --help        # specific command: args, options, description
\`\`\`

Commands follow a flat naming convention: \`<resource>-<action>\` (e.g.
ticket-list, user-show, comment-create).

## Output Modes

Always pass \`--json\` when consuming output programmatically:

\`\`\`bash
zcli-ticket --json ticket-show 12345           # machine-readable JSON
zcli-ticket --json ticket-list --status open | jq '.[].id'  # pipe to jq
\`\`\`

Without \`--json\`, output is human-readable tables (arrays) or formatted JSON
(objects). \`--raw\` skips all formatting.

In \`--json\` mode, errors are structured: \`{ "isError": true, "error": "..." }\`.

## High-Frequency Workflows

### 1. Get ticket content (most common)

\`\`\`bash
zcli-ticket --json ticket-thread <id>   # PREFERRED: ticket + all comments in _comments field
zcli-ticket --json ticket-show <id>     # ticket only, no comments
zcli-ticket --json comment-list <id>    # comments only
\`\`\`

### 2. Find tickets

\`\`\`bash
zcli-ticket --json ticket-list --status open --sort-by updated_at --sort-order desc
zcli-ticket --json ticket-list-recent
zcli-ticket --json search "status:open priority:urgent"
zcli-ticket --json view-execute <view-id>
zcli-ticket --json incremental-tickets <unix-timestamp>
\`\`\`

### 3. Create or update a ticket

\`\`\`bash
zcli-ticket --json ticket-create "Subject" "Description" --priority urgent --tags tag1,tag2
zcli-ticket --json ticket-update <id> --comment "Reply text"
zcli-ticket --json ticket-update <id> --status solved --assignee-id <user-id>
zcli-ticket --json ticket-update <id> --private-comment "Internal note"
\`\`\`

### 4. Find a user

\`\`\`bash
zcli-ticket --json user-search --query "name"
zcli-ticket --json user-search --email "user@corp.com"
zcli-ticket --json user-show <id>
zcli-ticket --json user-me
\`\`\`

### 5. Manage organizations

\`\`\`bash
zcli-ticket --json org-list
zcli-ticket --json org-show <id>
zcli-ticket --json org-search --external-id "acme-001"
\`\`\`

### 6. Manage groups

\`\`\`bash
zcli-ticket --json group-list
zcli-ticket --json group-show <id>
zcli-ticket --json group-membership-list --group-id <id>
\`\`\`

### 7. Use Zendesk views

\`\`\`bash
zcli-ticket --json view-list
zcli-ticket --json view-execute <id>
zcli-ticket --json view-count <id>
\`\`\`

### 8. Handle attachments

\`\`\`bash
zcli-ticket --json attachment-upload ./screenshot.png
zcli-ticket --json attachment-upload ./report.pdf --filename "Q4-Report.pdf"
zcli-ticket --json attachment-show <id>
\`\`\`

## Other important commands

\`ticket-field-list\`, \`ticket-field-show\`,
\`ticket-form-list\`, \`ticket-form-show\`,
\`tag-list\`, \`macro-list\`, \`macro-show\`, \`macro-apply\`,
\`suspended-list\`, \`suspended-recover\`, \`suspended-delete\`,
\`incremental-tickets\`, \`incremental-users\`, \`incremental-orgs\`,
\`identity-list\`, \`group-membership-list\`, \`group-membership-create\`,
\`org-membership-list\`, \`org-membership-create\`

All support \`--json\` output. Use \`zcli-ticket <command> --help\` for exact
arguments and options.

## Anti-patterns

- Always use \`--json\` when consuming output programmatically.
- \`ticket-thread\` is the preferred way to get a ticket WITH comments in one call.
- \`ticket-list\` without filters may pull hundreds of tickets; prefer \`--status open\`.
- \`ticket-list\` with \`list: true\` auto-paginates via cursor — let it finish.
- \`ticket-create-many\` and \`ticket-update-many\` accept JSON files; use
  \`--json\` to verify results after bulk operations.
- 429 rate limits are handled automatically (Retry-After header).
- POST/PUT requests auto-generate Idempotency-Key headers to prevent duplicates.
- Config commands (config-set, config-show, etc.) are local — they don't need
  subdomain/auth to work.
`;

}

export function buildPitfallsMd(): string {
  return `# zcli-ticket Pitfalls & Boundaries

## Auth & Config

- Config file location: \`~/.zendeskrc\` (JSON). Use \`config-path\` to confirm.
- Three auth modes: \`api-token\` (recommended, \`{email}/token:{token}\` base64),
  \`basic\` (\`{email}:{password}\` base64), \`oauth\` (Bearer token).
- CLI flags override env vars override config file.
- Config commands (\`config-set\`, \`config-show\`, etc.) are local file
  operations — they never hit Zendesk API.
- \`config-show\` masks secrets: only shows first 4 and last 2 characters of
  tokens.

## Command Naming Convention

- Flat naming: \`<resource>-<action>\` (e.g. ticket-list, user-search, comment-create).
- All 78+ commands support \`--json\` for machine-readable output.
- Most list-type commands have \`list: true\` which enables automatic cursor
  pagination (traverses all pages, merges results).

## ticket-thread (special command)

- This is a composite command: it fetches the ticket AND all comments in parallel.
- The result is the ticket object with a \`_comments\` array injected.
- Unlike other commands, it makes 2 API calls internally (ticket + comments list).

## ticket-list vs search

- \`ticket-list\` — simple status/sort filters, auto-paginated via cursor.
- \`search\` — full Zendesk search syntax (\`status:open type:ticket tag:urgent\`),
  supports \`--sort-by\`, \`--sort-order\`.

## Bulk Operations

- \`ticket-show-many\`, \`user-show-many\` — comma-separated IDs in the argument.
- \`ticket-create-many\`, \`user-create-many\` — accept a JSON file via argument.
- \`ticket-update-many\`, \`user-update-many\`, \`ticket-delete-many\`,
  \`user-delete-many\` — accept comma-separated IDs.

## JSON Output Mode

- Pass \`--json\` BEFORE the command name: \`zcli-ticket --json ticket-list ...\`
- In JSON mode, errors are \`{ "isError": true, "error": "message" }\` and the
  process exits with code 1. Check for \`isError\` before parsing results.
- \`--raw\` is mutually exclusive with \`--json\` in intent — raw skips
  formatting for human consumption.

## Rate Limiting

- HTTP 429 responses are automatically retried after the delay specified in the
  \`Retry-After\` header. No manual handling needed.
- All HTTP requests have a 30-second \`AbortController\` timeout.

## Idempotency

- All POST/PUT requests carry an \`Idempotency-Key\` header (auto-generated
  UUID). This prevents duplicate ticket/user creation on retry.

## Domain Resolution

- \`mycorp\` → \`mycorp.zendesk.com\`
- \`mycorp.zendesk.de\` → used as-is
- \`support.mycorp.com\` → used as-is
- Full URLs with protocol (\`https://...\`) also supported.

## View Commands

- \`view-execute\` returns tickets in a view. It uses \`list: true\` for
  auto-pagination.
- \`view-count\` is lightweight — O(1) count, no ticket data.
- \`view-count-many\` accepts comma-separated IDs.

## suspended-* Commands

- \`suspended-list\` returns tickets suspended by Zendesk (spam filtering, etc.).
- \`suspended-recover\` recovers a ticket from suspended state.
- \`suspended-delete\` permanently deletes a suspended ticket.
`;
}
