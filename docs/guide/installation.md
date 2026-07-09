# Installation Guide for LLM Agents

You are an AI agent (Claude Code, Codex, Cursor, etc.). This guide is written for you. Do not make the human read it.

## Quick Prompt (for humans to copy-paste)

If a human pasted this to you, follow the instructions below:

> Install and configure `zendesk-cli` using the guide at `docs/guide/installation.md`. First check `~/.zendeskrc` if it exists, then ask me for my Zendesk subdomain, email, and API token. Verify with `zendesk-cli ticket-list --status open` or `zendesk-cli user-me`.

---

## What You're Installing

`zendesk-cli` is a CLI that lets you (the agent) work with Zendesk tickets, users, organizations, groups, views, and search — all from the command line. Tickets, users, search, macros, attachments — everything Zendesk agents do in the browser, you can do in the terminal.

Humans should not type these commands. You should.

---

## Step 1: Install the Package

```bash
npm install -g zendesk-cli
```

Or run without installing (slower but zero setup):

```bash
npx zendesk-cli ticket-list
npx zendesk-cli user-me
```

Verify:

```bash
which zendesk-cli && zendesk-cli --version
```

If `command not found`, your Node.js global bin isn't on `PATH`:

```bash
export PATH="$(npm root -g)/../bin:$PATH"
```

If you get a permission error on macOS/Linux:

```bash
sudo npm install -g zendesk-cli
```

---

## Step 2: Check Existing Config

Before asking for credentials, check what's already configured:

```bash
zendesk-cli config-show
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
zendesk-cli config-set subdomain mycompany
zendesk-cli config-set email agent@company.com
zendesk-cli config-set token abc123xyz
```

Config is stored at `~/.zendeskrc`. One Zendesk instance at a time. To switch without touching config, override per command:

```bash
zendesk-cli -s mycompany -e agent@corp.com --token xyz ticket-list
zendesk-cli --subdomain otherco --email me@other.co --token abc ticket-show 12345
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
zendesk-cli config-show

# Verify connection
zendesk-cli user-me

# List recent tickets
zendesk-cli ticket-list --status open | head -20
```

JSON output = it works. `401` = bad credentials. `Error: Missing required config` = subdomain or email not set. `ENOTFOUND` = wrong subdomain.

---

## What You Can Do Now

### Ticket Management

```bash
zendesk-cli ticket-list                           # All tickets (auto-paginated)
zendesk-cli ticket-list --status open             # Filter by status
zendesk-cli ticket-list --status open --sort-by priority
zendesk-cli ticket-list-recent                    # Recently updated
zendesk-cli ticket-show 12345                     # View a ticket
zendesk-cli ticket-create "Subject" "Body"        # Create a ticket
zendesk-cli ticket-create "Urgent" "Details" --priority urgent --tags urgent
zendesk-cli ticket-update 12345 --status solved   # Update status
zendesk-cli ticket-update 12345 --assignee-id 789 # Reassign
zendesk-cli ticket-update 12345 --comment "Done"  # Public reply
zendesk-cli ticket-update 12345 --private-comment "Internal note"
zendesk-cli ticket-merge 12345 --target-id 67890  # Merge
zendesk-cli ticket-delete 12345                   # Delete
```

### Search

```bash
zendesk-cli search "status:open priority:urgent"
zendesk-cli search "type:user jane@corp.com"
zendesk-cli search "type:organization acme"
zendesk-cli search "created>2024-01-01 status:solved" --sort-by created_at
```

### Users & Organizations

```bash
zendesk-cli user-list
zendesk-cli user-list --role agent
zendesk-cli user-me                         # Who am I?
zendesk-cli user-show 67890
zendesk-cli user-search --email "jane@corp.com"
zendesk-cli org-list
zendesk-cli org-search --external-id "crm-123"
zendesk-cli org-membership-list --org-id 123
```

### Views & Macros

```bash
zendesk-cli view-list
zendesk-cli view-execute 123               # Tickets in a view
zendesk-cli view-count 123                 # How many tickets?
zendesk-cli macro-list                     # Available macros
zendesk-cli macro-apply --ticket-id 12345 --macro-id 67
```

### Bulk Operations

```bash
zendesk-cli ticket-update-many 1,2,3 --status solved
zendesk-cli ticket-delete-many 1,2,3
zendesk-cli user-show-many 100,200,300
```

### JSON Mode (for scripts/pipes)

```bash
zendesk-cli --json ticket-list --status open | jq '.[].id'
zendesk-cli --json ticket-show 12345 | jq '.status'
zendesk-cli --json user-me | jq '.email'
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
→ Wrong subdomain. Check `config-show` and verify the subdomain resolves to `*.zendesk.com`.

**Command not found**
→ Global install didn't register. Re-run `npm install -g zendesk-cli`.

**"error: unknown option"**
→ Typo in a flag name. Run `zendesk-cli <command> --help` to see valid options.

**JSON output is verbose**
→ Pipe through `jq`:

```bash
zendesk-cli --json ticket-list | jq '.[] | {id, subject, status}'
```

---

## The One-Liner

For agents that trust copy-paste:

```bash
npm install -g zendesk-cli && zendesk-cli config-set subdomain mycompany && zendesk-cli config-set email agent@company.com && zendesk-cli config-set token abc123 && zendesk-cli user-me
```

Replace `mycompany`, `agent@company.com`, and `abc123` with actual values. Humans can paste this and you handle the rest.

---

## Done

You now have programmatic control over Zendesk. Create tickets, search knowledge, manage users, apply macros — all from a terminal an agent can automate.

If something breaks: check the API token first. 90% of issues are bad credentials. The other 10% are wrong subdomains.
