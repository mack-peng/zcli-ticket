# Installation Guide for LLM Agents

You are an AI agent (Claude Code, Codex, Cursor, etc.). This guide is written for you. Do not make the human read it.

## Quick Prompt (for humans to copy-paste)

If a human pasted this to you, follow the instructions below:

> Install and configure `zcli-ticket` using the guide at `docs/guide/installation.md`. First check `~/.zendeskrc` if it exists, then ask me for my Zendesk subdomain, email, and API token. If multiple Zendesk instances are needed, use profiles (`zcli-ticket config-new <name>`). Verify with `zcli-ticket user-me` or `zcli-ticket ticket-thread <id>`.

---

## What You're Installing

`zcli-ticket` is a CLI that lets you (the agent) work with Zendesk tickets, users, organizations, groups, views, and search — all from the command line. Tickets, users, search, macros, attachments — everything Zendesk agents do in the browser, you can do in the terminal.

Humans should not type these commands. You should.

---

## Step 1: Install the Package

```bash
npm install -g zcli-ticket
```

Or run without installing (slower but zero setup):

```bash
npx zcli-ticket ticket-list
npx zcli-ticket user-me
```

Verify:

```bash
which zcli-ticket && zcli-ticket --version
```

If `command not found`, your Node.js global bin isn't on `PATH`:

```bash
export PATH="$(npm root -g)/../bin:$PATH"
```

If you get a permission error on macOS/Linux:

```bash
sudo npm install -g zcli-ticket
```

---

## Step 2: Check Existing Config

Before asking for credentials, check what's already configured:

```bash
zcli-ticket config-show
```

- If subdomain and email are set, jump to Step 4 to verify.
- If missing, proceed to Step 3.

---

## Step 3: Get Credentials

You need three things from the human:

| Required | Description | Example |
|----------|-------------|---------|
| Subdomain | Their Zendesk instance | `mycompany` → `mycompany.zendesk.com` |
| Email | Agent email address | `agent@company.com` |
| API Token | Created in Zendesk Admin | `abc123xyz...` |

The human generates their API token at: Zendesk Admin → Apps and integrations → Zendesk API → Add API token.

Then configure:

```bash
zcli-ticket config-set subdomain mycompany
zcli-ticket config-set email agent@company.com
zcli-ticket config-set token abc123xyz
```

Config is stored at `~/.zendeskrc`. Multi-instance? Use profiles:

```bash
zcli-ticket config-new myprofile
zcli-ticket -p myprofile config-set subdomain mycompany
zcli-ticket -p myprofile config-set email agent@corp.com
zcli-ticket -p myprofile config-set token abc123
zcli-ticket config-list          # See all profiles
zcli-ticket config-use myprofile # Switch active
```

To override per command without switching profiles:

```bash
zcli-ticket -s mycompany -e agent@corp.com --token xyz ticket-list
zcli-ticket --subdomain otherco --email me@other.co --token abc ticket-show 12345
```

### Alternative Auth Modes

| Mode | Set this | Use case |
|------|----------|----------|
| Basic Auth | `config-set password <pwd>` | Legacy accounts without API tokens |
| OAuth | `config-set oauth-token <token>` | OAuth 2.0 integrations |

---

## Step 4: Verify

```bash
# Check configuration (secrets masked)
zcli-ticket config-show

# Verify connection
zcli-ticket user-me

# List recent tickets
zcli-ticket ticket-list --status open | head -20
```

JSON output = it works. `401` = bad credentials. `Error: Missing required config` = subdomain or email not set. `ENOTFOUND` = wrong subdomain.

---

## What You Can Do Now

### Ticket Management

```bash
zcli-ticket ticket-list                           # All tickets (auto-paginated)
zcli-ticket ticket-list --status open             # Filter by status
zcli-ticket ticket-list --status open --sort-by priority
zcli-ticket ticket-list-recent                    # Recently updated
zcli-ticket ticket-show 12345                     # View a ticket
zcli-ticket ticket-thread 12345                   # Ticket + all comments (one command)
zcli-ticket ticket-create "Subject" "Body"        # Create a ticket
zcli-ticket ticket-create "Urgent" "Details" --priority urgent --tags urgent
zcli-ticket ticket-update 12345 --status solved   # Update status
zcli-ticket ticket-update 12345 --assignee-id 789 # Reassign
zcli-ticket ticket-update 12345 --comment "Done"  # Public reply
zcli-ticket ticket-update 12345 --private-comment "Internal note"
zcli-ticket ticket-merge 12345 --target-id 67890  # Merge
zcli-ticket ticket-delete 12345                   # Delete
```

### Search

```bash
zcli-ticket search "status:open priority:urgent"
zcli-ticket search "type:user jane@corp.com"
zcli-ticket search "type:organization acme"
zcli-ticket search "created>2024-01-01 status:solved" --sort-by created_at
```

### Users & Organizations

```bash
zcli-ticket user-list
zcli-ticket user-list --role agent
zcli-ticket user-me                         # Who am I?
zcli-ticket user-show 67890
zcli-ticket user-search --email "jane@corp.com"
zcli-ticket org-list
zcli-ticket org-search --external-id "crm-123"
zcli-ticket org-membership-list --org-id 123
```

### Views & Macros

```bash
zcli-ticket view-list
zcli-ticket view-execute 123               # Tickets in a view
zcli-ticket view-count 123                 # How many tickets?
zcli-ticket macro-list                     # Available macros
zcli-ticket macro-apply --ticket-id 12345 --macro-id 67
```

### Bulk Operations

```bash
zcli-ticket ticket-update-many 1,2,3 --status solved
zcli-ticket ticket-delete-many 1,2,3
zcli-ticket user-show-many 100,200,300
```

### JSON & Raw Mode (for scripts/pipes)

```bash
zcli-ticket --json ticket-list --status open | jq '.[].id'
zcli-ticket --json ticket-show 12345 | jq '.status'
zcli-ticket --json user-me | jq '.email'
zcli-ticket --raw ticket-show 12345              # Raw data, no formatting
```

### Multi-Profile

```bash
zcli-ticket config-list                          # See all profiles
zcli-ticket -p myprofile ticket-list             # Use a specific profile
```

---

## Environment Variables (Skip Config Entirely)

```bash
export ZENDESK_SUBDOMAIN=mycompany
export ZENDESK_EMAIL=agent@company.com
export ZENDESK_TOKEN=abc123xyz
```

Then run any command without `-s`, `-e`, or `--token`.

**Priority** (highest to lowest):
1. CLI flags: `--subdomain`, `--email`, `--token`
2. Environment variables: `ZENDESK_SUBDOMAIN`, `ZENDESK_EMAIL`, `ZENDESK_TOKEN`
3. Config file: `~/.zendeskrc`

---

## Common Failures Agents Face

**"Missing required config"**
→ Subdomain or email not set. Run `config-set` or set env vars.

**401 / "Couldn't authenticate you"**
→ Bad API token. Check token in Zendesk Admin → API, or re-run `config-set token <value>`.

**"Error: HTTP 404"**
→ Ticket/user ID doesn't exist, or wrong subdomain.

**"Error: HTTP 429"**
→ Rate limited. The CLI auto-retries after the delay Zendesk specifies. If persistent, slow down.

**ENOTFOUND / fetch failed**
→ Wrong subdomain or network issue. The CLI resolves `mycorp` → `mycorp.zendesk.com`, or you can pass a full domain like `mycorp.zendesk.de`.

**Command not found**
→ Global install didn't register. Re-run `npm install -g zcli-ticket`.

**"error: unknown option"**
→ Typo in a flag name. Run `zcli-ticket <command> --help` to see valid options.

**JSON output is verbose**
→ Pipe through `jq`:

```bash
zcli-ticket --json ticket-list | jq '.[] | {id, subject, status}'
```

---

## The One-Liner

For agents that trust copy-paste:

```bash
npm install -g zcli-ticket && zcli-ticket config-set subdomain mycompany && zcli-ticket config-set email agent@company.com && zcli-ticket config-set token abc123 && zcli-ticket user-me
```

Replace `mycompany`, `agent@company.com`, and `abc123` with actual values. Humans can paste this and you handle the rest.

---

## Done

You now have programmatic control over Zendesk. Create tickets, search knowledge, manage users, apply macros — all from a terminal an agent can automate.

If something breaks: check the API token first. 90% of issues are bad credentials. The other 10% are wrong subdomains.
