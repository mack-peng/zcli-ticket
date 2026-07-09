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

# Or OAuth
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
zcli-ticket ticket-thread 12345         # Ticket + all comments
```

---

## Authentication

| Mode | Config | Description |
|------|--------|-------------|
| API Token | `token` | `{email}/token:{token}` base64 (recommended) |
| Basic Auth | `password` | `{email}:{password}` base64 |
| OAuth | `oauth-token` | `Bearer {token}` |

Config file (`~/.zendeskrc`) stores credentials per profile. Use `config-show` to verify without exposing secrets.

---

## Configuration

```bash
# Set values
zcli-ticket config-set subdomain mycompany
zcli-ticket config-set email agent@company.com
zcli-ticket config-set token abc123xyz

# Show current config (secrets masked)
zcli-ticket config-show

# Show config file location
zcli-ticket config-path

# Profile management
zcli-ticket config-new myprofile                    # Create profile
zcli-ticket -p myprofile config-set subdomain co    # Set per profile
zcli-ticket config-use myprofile                    # Switch to it
zcli-ticket config-list                             # List all profiles
```

Priority: CLI flags > Environment variables > Config file

```
-s, --subdomain   ZENDESK_SUBDOMAIN
-e, --email       ZENDESK_EMAIL
--token           ZENDESK_TOKEN
--password        ZENDESK_PASSWORD
--oauth-token     ZENDESK_OAUTH_TOKEN
-p, --profile     ZENDESK_PROFILE
```

Subdomain auto-resolves: `mycorp` → `mycorp.zendesk.com`, full domains like `mycorp.zendesk.de` or `support.mycorp.com` work directly.

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
zcli-ticket ticket-thread 12345                          # Ticket + all comments
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
--json              Output as JSON (default: human-readable)
--raw               Output raw result without formatting
--help [command]    Show help for a command or global
--version           Show version
-p, --profile       Use named config profile
-s, --subdomain     Zendesk subdomain (or full domain)
-e, --email         Zendesk agent email
--token             API token
```

---

## Development

```bash
npm install
npm run build       # tsc + generate help.json → dist/
npm test            # Run 43 unit tests
npx tsc --noEmit    # Type check only
```

## License

MIT
