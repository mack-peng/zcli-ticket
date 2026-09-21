# zcli-ticket

A command-line interface for the Zendesk Ticketing API. Built for both humans and AI agents.

## Installation

### For Humans

Copy and paste this prompt to your LLM agent (Claude Code, Cursor, Codex, etc.):

```text
Install and configure zcli-ticket by following the instructions here:
https://raw.githubusercontent.com/mack-peng/zcli-ticket/main/docs/guide/installation.md
```

### For LLM Agents

Fetch the installation guide and follow it:

```bash
curl -s https://raw.githubusercontent.com/mack-peng/zcli-ticket/main/docs/guide/installation.md
```

---

## Quick Start

### Install

```bash
npm install -g zcli-ticket

# Or run without installing:
# npx zcli-ticket ticket-list
```

### 1. Configure Authentication

Three auth modes. Most users use API tokens:

```bash
# API token (recommended)
zcli-ticket config-set subdomain mycompany
zcli-ticket config-set email agent@company.com
zcli-ticket config-set token abc123xyz

# Or basic auth
zcli-ticket config-set password mypassword

# Or OAuth with auto refresh (client_credentials)
zcli-ticket config-set oauth-client-id <client-id>
zcli-ticket config-set oauth-client-secret <client-secret>
zcli-ticket oauth-login                          # exchange now, store token + expiry

# Or a static OAuth token (no auto refresh)
zcli-ticket config-set oauth-token eyJ...

# Multi-profile support
zcli-ticket config-new staging
zcli-ticket -p staging config-set subdomain stagingco
zcli-ticket -p staging config-set email admin@staging.co
zcli-ticket -p staging config-set token xyz789
zcli-ticket config-use staging          # Switch active profile
zcli-ticket config-list                 # List all profiles
```

> Config is stored at `~/.zendeskrc`. Override per-command with `-s`, `-e`, `--token`:
> `zcli-ticket ticket-list --subdomain mycompany --email me@corp.com --token abc`

### 2. Try It

```bash
zcli-ticket ticket-list --status open
zcli-ticket ticket-show 12345
zcli-ticket user-me
zcli-ticket ticket-thread 12345         # Ticket + all comments → _comments field
```

---

## Authentication

| Mode | Config | Description |
|------|--------|-------------|
| API Token | `token` | `{email}/token:{token}` base64 (recommended) |
| Basic Auth | `password` | `{email}:{password}` base64 |
| OAuth | `oauth-token`, or `oauth-client-id` + `oauth-client-secret` | `Bearer {token}`; with client credentials the token is exchanged via `client_credentials` and refreshed automatically |

Config file (`~/.zendeskrc`) stores credentials per profile. Use `config-show` to verify without exposing secrets. If a profile has more than one credential type, pin the mode with `config-set mode` or `--mode`.

### OAuth auto refresh

OAuth is one mode with two credential flavours. With `oauth-client-id` /
`oauth-client-secret` configured, zcli-ticket exchanges them for an access token
(`POST /oauth/tokens`, grant type `client_credentials`) and keeps it fresh:

- Before each request, a token missing or expiring within 60s is refreshed automatically.
- On HTTP 401 it refreshes once and retries the request once.
- Refreshed tokens are written back to `~/.zendeskrc` (atomic write, file mode `0600`) together with `oauthTokenExpiresAt` and the granted scope.
- Both `oauth-login` and automatic refresh request the maximum TTL (`expires_in: 172800`, 2 days — Zendesk's ceiling); if the server issues a smaller lifetime it is persisted as-is.
- Without client credentials, a static `oauth-token` behaves exactly as before.
- If a profile carries several credential types, pin the mode explicitly with `config-set mode api-token|basic|oauth` (or `--mode`); otherwise OAuth wins whenever OAuth credentials exist.
- `zcli-ticket oauth-login` performs the exchange explicitly (`--scope`, `--expires-in` 300-172800, default 172800). `--verbose` logs each refresh to stderr.
- The OAuth client must be **confidential** (Zendesk Admin Center → APIs → OAuth clients → Client kind); public clients get `unauthorized_client`. `client_credentials` tokens never come with a `refresh_token`; expiry is handled by re-exchanging the client credentials.

---

## Configuration

```bash
# Set values
zcli-ticket config-set subdomain mycompany
zcli-ticket config-set email agent@company.com
zcli-ticket config-set token abc123xyz

# Force an auth mode when a profile has several credential types
zcli-ticket config-set mode api-token                # api-token | basic | oauth

# OAuth client credentials (enables auto refresh)
zcli-ticket config-set oauth-client-id <client-id>
zcli-ticket config-set oauth-client-secret <client-secret>
zcli-ticket config-set oauth-scope "tickets:read users:read"   # optional
zcli-ticket oauth-login                                        # exchange + store token/expiry

# Show current config (secrets masked, OAuth expiry shown)
zcli-ticket config-show

# Show config file location
zcli-ticket config-path

# Profile management
zcli-ticket config-new myprofile                    # Create profile
zcli-ticket -p myprofile config-set subdomain co    # Set per profile
zcli-ticket config-use myprofile                    # Switch to it
zcli-ticket config-list                             # List all profiles
```

Priority: CLI flags > Config file (`~/.zendeskrc`)

```
-s, --subdomain       Zendesk subdomain
-e, --email           Zendesk agent email
--token               API token
--password            password for basic auth
--oauth-token         static OAuth access token
--oauth-client-id     OAuth client id (enables auto refresh)
--oauth-client-secret OAuth client secret (enables auto refresh)
--oauth-scope         space-separated OAuth scopes
-p, --profile         named profile (or ZENDESK_PROFILE env, for selecting a profile temporarily)
--mode                force auth mode: api-token | basic | oauth
```

Credentials must be configured first (`config-set` or per-command flags); there are no credential environment variables.

Known config keys are normalized on write (`config-set oauth-token ...` is stored as `oauthToken`, and legacy kebab-case keys from older versions are migrated on the next write).

Subdomain auto-resolves: `mycorp` → `mycorp.zendesk.com`, full domains like `mycorp.zendesk.de` or `support.mycorp.com` work directly.

---

## Agent Skill

Teach AI coding agents how to use zcli-ticket effectively:

```bash
# Install skill for all detected agents
zcli-ticket skill-install

# Install for a specific agent
zcli-ticket skill-install --target opencode
zcli-ticket skill-install --target claude
zcli-ticket skill-install --target all

# Install to a custom path
zcli-ticket skill-install --path /path/to/project

# Remove installed skills
zcli-ticket skill-uninstall
```

The skill installs a `SKILL.md` + `references/pitfalls.md` into each agent's
skill directory (`~/.agents/skills/`, `~/.claude/skills/`, etc.). Agents use it
to discover commands, configure auth, and avoid common pitfalls.

---

## Output Modes

| Flag | Output | Use Case |
|------|--------|----------|
| (default) | Human-readable tables / formatted JSON | Terminal viewing |
| `--json` | Machine-readable JSON | Scripts, `jq` pipes, AI agent consumption |
| `--raw` | Raw data without formatting | Direct consumption by other tools |

```bash
zcli-ticket ticket-list --status open          # Table output
zcli-ticket --json ticket-list --status open   # JSON output
zcli-ticket --json ticket-list | jq '.[].id'   # Pipe to jq
zcli-ticket --raw ticket-show 12345            # Raw data
```

---

## Commands

### Tickets

```bash
zcli-ticket ticket-list                                  # All tickets
zcli-ticket ticket-list --status open                    # Filter by status
zcli-ticket ticket-list --sort-by updated_at --sort-order desc
zcli-ticket ticket-list-recent                           # Recently updated
zcli-ticket ticket-show 12345                            # Single ticket
zcli-ticket ticket-show-many 1,2,3                       # Multiple tickets
zcli-ticket ticket-thread 12345                          # Ticket + all comments → _comments field
zcli-ticket ticket-create "Subject" "Description"        # Create
zcli-ticket ticket-create "Subject" "Body" --priority urgent --tags urgent,printer
zcli-ticket ticket-create-many tickets.json              # Bulk create from JSON file
zcli-ticket ticket-update 12345 --status solved          # Update
zcli-ticket ticket-update 12345 --assignee-id 789        # Reassign
zcli-ticket ticket-update 12345 --comment "Fixed"        # Add comment
zcli-ticket ticket-update 12345 --private-comment "Note" # Internal note
zcli-ticket ticket-update-many 1,2,3 --status closed     # Bulk update
zcli-ticket ticket-delete 12345                          # Delete
zcli-ticket ticket-delete-many 1,2,3                     # Bulk delete
zcli-ticket ticket-merge 12345 --target-id 67890         # Merge
zcli-ticket ticket-related 12345                         # Related info
```

### Comments

```bash
zcli-ticket comment-list 26520363
zcli-ticket comment-create 26520363 "Have you tried restarting?"
zcli-ticket comment-create 26520363 "Internal note" --private
zcli-ticket comment-update --ticket-id 12345 --comment-id 456 "Updated text"
zcli-ticket comment-redact --ticket-id 12345 --comment-id 456 "[REDACTED]"
zcli-ticket comment-delete --ticket-id 12345 --comment-id 456
```

### Users

```bash
zcli-ticket user-list                                    # All users
zcli-ticket user-list --role agent                       # Filter by role
zcli-ticket user-me                                      # Current user
zcli-ticket user-show 67890                              # Single user
zcli-ticket user-show me                                 # Alias for user-me
zcli-ticket user-show-many 1,2,3                         # Multiple users
zcli-ticket user-create "John Doe" "john@example.com"    # Create
zcli-ticket user-create "Agent" "agent@corp.com" --role agent --verified
zcli-ticket user-create-many users.json                  # Bulk create from JSON file
zcli-ticket user-update 67890 --name "Jane"              # Update
zcli-ticket user-update 67890 --role admin               # Promote
zcli-ticket user-update-many 1,2,3 --role agent          # Bulk update
zcli-ticket user-delete 67890                            # Delete
zcli-ticket user-delete-many 1,2,3                       # Bulk delete
zcli-ticket user-merge --source-id 100 --target-id 200   # Merge users
zcli-ticket user-search --query "jane"                   # Search by name
zcli-ticket user-search --email "jane@corp.com"          # Search by email
zcli-ticket user-search --external-id "ext123"           # Search by external ID
zcli-ticket user-autocomplete "John"                     # Name autocomplete
zcli-ticket identity-list --user-id 67890                # User identities
```

### Organizations

```bash
zcli-ticket org-list
zcli-ticket org-show 123
zcli-ticket org-create "Acme Corp" --external-id "acme-001" --tags "enterprise,partner"
zcli-ticket org-update 123 --name "Acme Inc"
zcli-ticket org-delete 123
zcli-ticket org-search --external-id "acme-001"
zcli-ticket org-membership-list --org-id 123
zcli-ticket org-membership-create --user-id 456 --org-id 123
zcli-ticket org-membership-delete 789
```

### Groups

```bash
zcli-ticket group-list
zcli-ticket group-show 42
zcli-ticket group-create "Support Team"
zcli-ticket group-update 42 --name "Support Tier 2"
zcli-ticket group-delete 42
zcli-ticket group-membership-list --group-id 42
zcli-ticket group-membership-create --user-id 100 --group-id 42
zcli-ticket group-membership-delete 200
```

### Search

```bash
zcli-ticket search "status:open"                         # Ticket search
zcli-ticket search "type:user jane"                      # User search
zcli-ticket search "type:organization acme"              # Org search
zcli-ticket search "status:open priority:urgent" --sort-by created_at --sort-order desc
```

### Views

```bash
zcli-ticket view-list
zcli-ticket view-show 123
zcli-ticket view-execute 123                             # Get tickets in view
zcli-ticket view-execute 123 --sort-by created_at
zcli-ticket view-count 123                               # Ticket count
zcli-ticket view-count-many 1,2,3                        # Multiple views
```

### Attachments

```bash
zcli-ticket attachment-show 123456
zcli-ticket attachment-upload ./screenshot.png
zcli-ticket attachment-upload ./report.pdf --filename "Q4-Report.pdf"
zcli-ticket attachment-delete 123456
```

### Ticket Fields & Forms

```bash
zcli-ticket ticket-field-list
zcli-ticket ticket-field-show 12345
zcli-ticket ticket-form-list
zcli-ticket ticket-form-show 123
```

### Tags & Macros

```bash
zcli-ticket tag-list
zcli-ticket macro-list
zcli-ticket macro-show 123
zcli-ticket macro-apply --ticket-id 12345 --macro-id 67
```

### Suspended Tickets

```bash
zcli-ticket suspended-list
zcli-ticket suspended-recover 12345
zcli-ticket suspended-delete 12345
```

### Incremental Exports

```bash
zcli-ticket incremental-tickets 1710000000               # Tickets since timestamp
zcli-ticket incremental-users 1710000000                 # Users since timestamp
zcli-ticket incremental-orgs 1710000000                  # Orgs since timestamp
```

---

## Global Options

```
--json                    Output as JSON (default: human-readable)
--raw                     Output raw result without formatting
--verbose                 Log token refreshes to stderr
--help [command]          Show help for a command or global
--version                 Show version
-p, --profile             Use named config profile (or ZENDESK_PROFILE)
-s, --subdomain           Zendesk subdomain (or full domain)
-e, --email               Zendesk agent email
--token                   API token
--password                Password for basic auth
--oauth-token             Static OAuth access token
--oauth-client-id         OAuth client id (enables auto refresh)
--oauth-client-secret     OAuth client secret (enables auto refresh)
--oauth-scope             Space-separated OAuth scopes
--mode                    Force auth mode: api-token | basic | oauth
```

---

## Development

```bash
npm install
npm run build       # tsc + generate help.json → dist/
npm test            # Run 83 unit tests
npx tsc --noEmit    # Type check only
```

## License

MIT
