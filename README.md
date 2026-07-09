# zendesk-cli

A command-line interface for the Zendesk Ticketing API. Built for both humans and AI agents.

## Installation

### For Humans

Copy and paste this prompt to your LLM agent (Claude Code, Cursor, Codex, etc.):

```text
Install and configure zendesk-cli by following the instructions here:
https://raw.githubusercontent.com/mack-peng/zendesk-cli/main/docs/guide/installation.md
```

### For LLM Agents

Fetch the installation guide and follow it:

```bash
curl -s https://raw.githubusercontent.com/mack-peng/zendesk-cli/main/docs/guide/installation.md
```

---

## Quick Start

### Install

```bash
npm install -g zendesk-cli

# Or run without installing:
# npx zendesk-cli ticket-list
```

### 1. Configure Authentication

Three auth modes. Most users use API tokens:

```bash
# API token (recommended)
zendesk-cli config-set subdomain mycompany
zendesk-cli config-set email agent@company.com
zendesk-cli config-set token abc123xyz

# Or basic auth
zendesk-cli config-set password mypassword

# Or OAuth
zendesk-cli config-set oauth-token eyJ...
```

> Config is stored at `~/.zendeskrc`. Override per-command with `-s`, `-e`, `--token`:
> `zendesk-cli ticket-list --subdomain mycompany --email me@corp.com --token abc`

### 2. Try It

```bash
zendesk-cli ticket-list --status open
zendesk-cli ticket-show 12345
zendesk-cli user-me
```

---

## Authentication

| Mode | Config | Description |
|------|--------|-------------|
| API Token | `token` | `{email}/token:{token}` base64 (recommended) |
| Basic Auth | `password` | `{email}:{password}` base64 |
| OAuth | `oauth-token` | `Bearer {token}` |

Config file (`~/.zendeskrc`) stores credentials. Use `config-show` to verify without exposing secrets.

---

## Configuration

```bash
# Set values
zendesk-cli config-set subdomain mycompany
zendesk-cli config-set email agent@company.com
zendesk-cli config-set token abc123xyz

# Show current config (secrets masked)
zendesk-cli config-show

# Show config file location
zendesk-cli config-path
```

Priority: CLI flags > Environment variables > Config file

```
-s, --subdomain   ZENDESK_SUBDOMAIN
-e, --email       ZENDESK_EMAIL
--token           ZENDESK_TOKEN
--password        ZENDESK_PASSWORD
--oauth-token     ZENDESK_OAUTH_TOKEN
```

---

## Output Modes

| Flag | Output | Use Case |
|------|--------|----------|
| (default) | Human-readable tables / formatted JSON | Terminal viewing |
| `--json` | Machine-readable JSON | Scripts, `jq` pipes, AI agent consumption |

```bash
zendesk-cli ticket-list --status open          # Table output
zendesk-cli --json ticket-list --status open   # JSON output
zendesk-cli --json ticket-list | jq '.[].id'   # Pipe to jq
```

---

## Commands

### Tickets

```bash
zendesk-cli ticket-list                                  # All tickets
zendesk-cli ticket-list --status open                    # Filter by status
zendesk-cli ticket-list --sort-by updated_at --sort-order desc
zendesk-cli ticket-list-recent                           # Recently updated
zendesk-cli ticket-show 12345                            # Single ticket
zendesk-cli ticket-show-many 1,2,3                       # Multiple tickets
zendesk-cli ticket-create "Subject" "Description"        # Create
zendesk-cli ticket-create "Subject" "Body" --priority urgent --tags urgent,printer
zendesk-cli ticket-update 12345 --status solved          # Update
zendesk-cli ticket-update 12345 --assignee-id 789        # Reassign
zendesk-cli ticket-update 12345 --comment "Fixed"        # Add comment
zendesk-cli ticket-update 12345 --private-comment "Note" # Internal note
zendesk-cli ticket-update-many 1,2,3 --status closed     # Bulk update
zendesk-cli ticket-delete 12345                          # Delete
zendesk-cli ticket-delete-many 1,2,3                     # Bulk delete
zendesk-cli ticket-merge 12345 --target-id 67890         # Merge
zendesk-cli ticket-related 12345                         # Related info
```

### Comments

```bash
zendesk-cli comment-list --ticket-id 12345
zendesk-cli comment-create --ticket-id 12345 "Have you tried restarting?"
zendesk-cli comment-create --ticket-id 12345 "Internal note" --private
zendesk-cli comment-update --ticket-id 12345 --comment-id 456 "Updated text"
zendesk-cli comment-redact --ticket-id 12345 --comment-id 456 "[REDACTED]"
```

### Users

```bash
zendesk-cli user-list                                    # All users
zendesk-cli user-list --role agent                       # Filter by role
zendesk-cli user-me                                      # Current user
zendesk-cli user-show 67890                              # Single user
zendesk-cli user-show me                                 # Alias for user-me
zendesk-cli user-show-many 1,2,3                         # Multiple users
zendesk-cli user-create "John Doe" "john@example.com"    # Create
zendesk-cli user-create "Agent" "agent@corp.com" --role agent --verified
zendesk-cli user-update 67890 --name "Jane"              # Update
zendesk-cli user-update 67890 --role admin               # Promote
zendesk-cli user-delete 67890                            # Delete
zendesk-cli user-search --query "jane"                   # Search by name
zendesk-cli user-search --email "jane@corp.com"          # Search by email
zendesk-cli user-search --external-id "ext123"           # Search by external ID
zendesk-cli identity-list --user-id 67890                # User identities
```

### Organizations

```bash
zendesk-cli org-list
zendesk-cli org-show 123
zendesk-cli org-create "Acme Corp" --external-id "acme-001" --tags "enterprise,partner"
zendesk-cli org-update 123 --name "Acme Inc"
zendesk-cli org-delete 123
zendesk-cli org-search --external-id "acme-001"
zendesk-cli org-membership-list --org-id 123
zendesk-cli org-membership-create --user-id 456 --org-id 123
zendesk-cli org-membership-delete 789
```

### Groups

```bash
zendesk-cli group-list
zendesk-cli group-show 42
zendesk-cli group-create "Support Team"
zendesk-cli group-update 42 --name "Support Tier 2"
zendesk-cli group-delete 42
zendesk-cli group-membership-list --group-id 42
zendesk-cli group-membership-create --user-id 100 --group-id 42
zendesk-cli group-membership-delete 200
```

### Search

```bash
zendesk-cli search "status:open"                         # Ticket search
zendesk-cli search "type:user jane"                      # User search
zendesk-cli search "type:organization acme"              # Org search
zendesk-cli search "status:open priority:urgent" --sort-by created_at --sort-order desc
```

### Views

```bash
zendesk-cli view-list
zendesk-cli view-show 123
zendesk-cli view-execute 123                             # Get tickets in view
zendesk-cli view-execute 123 --sort-by created_at
zendesk-cli view-count 123                               # Ticket count
zendesk-cli view-count-many 1,2,3                        # Multiple views
```

### Attachments

```bash
zendesk-cli attachment-show 123456
zendesk-cli attachment-upload ./screenshot.png
zendesk-cli attachment-upload ./report.pdf --filename "Q4-Report.pdf"
zendesk-cli attachment-delete 123456
```

### Ticket Fields & Forms

```bash
zendesk-cli ticket-field-list
zendesk-cli ticket-field-show 12345
zendesk-cli ticket-form-list
zendesk-cli ticket-form-show 123
```

### Tags & Macros

```bash
zendesk-cli tag-list
zendesk-cli macro-list
zendesk-cli macro-show 123
zendesk-cli macro-apply --ticket-id 12345 --macro-id 67
```

### Suspended Tickets

```bash
zendesk-cli suspended-list
zendesk-cli suspended-recover 12345
zendesk-cli suspended-delete 12345
```

### Incremental Exports

```bash
zendesk-cli incremental-tickets 1710000000               # Tickets since timestamp
zendesk-cli incremental-users 1710000000                 # Users since timestamp
zendesk-cli incremental-orgs 1710000000                  # Orgs since timestamp
```

---

## Global Options

```
--json              Output as JSON (default: human-readable)
--raw               Output raw result without formatting
--help [command]    Show help for a command or global
--version           Show version
```

---

## Development

```bash
npm install
npm run build       # Generate help.json + compile TypeScript
npm test            # Run 43 unit tests
npx tsc --noEmit    # Type check only
```

## License

MIT
