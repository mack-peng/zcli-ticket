# 需求：OAuth client_credentials 自动刷新

- 目标仓库：`zcli-ticket`（本 repo）
- 状态：需求已定，待实现
- 附带：修复 `config-set oauth-token` 的 key 不一致 bug（沿用同一需求批次）

## Problem

现状（v0.1.3）：

1. **OAuth 模式只发静态 token，没有刷新能力。** `src/api/auth.ts` 的 oauth 分支仅返回 `Authorization: Bearer ${config.oauthToken}`；全仓库无过期检查、无 401 处理、无 refresh 逻辑。
2. **client_credentials 的 token 必然过期，且无法“刷新”。** Zendesk 规定 `expires_in` ∈ [300, 172800] 秒（上限 2 天）；2026-04-30 之后创建的 client 默认 1800 秒。该流程**不返回 refresh_token**，过期后只能拿 `client_id + client_secret` 重新换取。
3. **过期后的使用体验：** 所有命令直接 401，用户需手动 `curl` 换 token 再手改 `~/.zendeskrc`。
4. **既有缺陷（本需求顺带修）：** `config-set oauth-token <v>` 中 `writeRcConfig` 原样写 key → 落成 `oauth-token`；而读取处只认 `oauthToken`（`src/config/config.ts:79`、`:114`，`src/cli/program.ts:117`、`:120`），命令静默无效、不报错。

实现依据（Zendesk API，以实测为准）：

| 项 | 值 |
|---|---|
| Token endpoint | `POST https://{subdomain}.zendesk.com/oauth/tokens`（`Content-Type: application/json`） |
| 请求体 | `{ "grant_type": "client_credentials", "client_id", "client_secret", "scope"?, "expires_in"? }` |
| 前置条件 | client 必须为 **confidential**（Admin Center → APIs → OAuth clients → Client kind；public 会 `unauthorized_client`） |
| scope | 省略则取 client 默认；若 client 配置了 allowed scopes，超出会 `400 invalid_scope` |
| 响应 | `{ access_token, token_type: "bearer", scope, expires_in }`，**无 refresh_token** |
| 典型错误 | `unauthorized_client`（public client / 未授权该 grant）、`invalid_client`（id/secret 不符） |

## Solution

为 profile 增加 OAuth client 凭据与 token 过期元数据；请求前惰性检查、过期即自动重换，401 时强制重换并重试一次。无 client 凭据时保持现有静态 token 行为，不破坏兼容。

### R0 — key 归一化（bug fix）

- 写入侧（`writeRcConfig`）：对已知配置键做归一化，kebab → camel。至少覆盖 `oauth-token → oauthToken`、`oauth-client-id → oauthClientId`、`oauth-client-secret → oauthClientSecret`、`oauth-scope → oauthScope`，其余键原样保留。
- 读取侧：兼容历史脏 key（`oauthToken ?? profile['oauth-token']`），并在下一次写入该 profile 时清理脏 key。
- 回归测试：`config-set oauth-token X` 后 `config-show` / 命令可用；`oauth-token` 脏 key 能继续被读取。

### R1 — 配置项（profile 级，优先级 CLI flags > rc profile）

| 配置键（rc） | kebab 别名 | CLI flag | 必填 | 说明 |
|---|---|---|---|---|
| `oauthClientId` | `oauth-client-id` | `--oauth-client-id` | 自动刷新时必填 | OAuth client 的 Identifier |
| `oauthClientSecret` | `oauth-client-secret` | `--oauth-client-secret` | 同上 | 仅用于换 token，不随请求发送 |
| `oauthScope` | `oauth-scope` | `--oauth-scope` | 否 | 空格分隔；设置时写入换 token 请求 |
| `oauthToken` | — | `--oauth-token` | 否 | 当前 access token（仍兼容纯静态用法） |
| `oauthTokenExpiresAt` | — | — | 否 | 写入侧维护：token 失效时刻（Unix 秒） |
| `oauthScopeGranted` | — | — | 否 | 写入侧维护：响应返回的实际 scope |
| `mode` | — | `--mode` | 否 | 显式指定鉴权模式（api-token / basic / oauth）；未设置时按凭据推断 |

> 决策（2026-09-21）：凭据类配置**不支持环境变量**，必须先配置（`config-set` 或 CLI flags）。
> `ZENDESK_PROFILE` 仅用于进程级选择 profile（临时使用某个 profile，等同 `-p`）。
> 显式 `mode` 用于消除「同时存在 api-token 与 OAuth 凭据」时的歧义（校验于写入与读取两处）。

- `mode` 判定不变：存在 `oauthToken` 或 client 凭据即 `oauth`。
- `config-show` 中 secret / token 一律掩码（前 6 位 + `...`），并额外展示 `expires_at`（本地时间）与剩余有效期。

### R2 — 新命令 `oauth-login`

显式换发并落盘，便于预刷新与排查（自动刷新是隐式的，排障需要一个显式入口）。

| 项 | 要求 |
|---|---|
| 输入 | 使用当前 profile（含 `-p`）的 client 凭据；`--scope` 覆盖 `oauthScope`；`--expires-in <秒>` 覆盖默认 |
| 默认 `expires_in` | `172800`（取上限，减少刷新频率）；小于 300 或大于 172800 报参数错误 |
| 行为 | 调 token endpoint，成功则原子写回 rc：`oauthToken` / `oauthTokenExpiresAt` / `oauthScopeGranted` |
| 输出 | `scope`、`expires_in`、有效期截止时间；token 掩码，**不打印完整 token/secret**；支持 `--json` |
| 失败 | 非 0 退出码 + 可行动错误信息（见 R5） |

### R3 — 自动刷新（核心）

触发条件（oauth 模式）：

| 时机 | 条件 | 动作 |
|---|---|---|
| 请求前（惰性检查） | `oauthToken` 缺失，或 `oauthTokenExpiresAt - now ≤ 60s` 安全窗 | 用 client 凭据换新 token 后发请求 |
| 响应 401 | 本次请求携带的是静态/未刷新的 token，且 client 凭据可用 | 强制换新一次，用新 token **重试一次**（仅一次，防循环） |

- 无 `oauthClientId`/`oauthClientSecret`：维持现状（直接用已有 `oauthToken`；失败原样报错），不得因此报出“需要凭据”的新错误。
- 无 `oauthTokenExpiresAt`（历史配置/纯静态 token）：视为未知过期，直接用；仅在 401 时尝试刷新。
- 多个 token 并存：每次刷新**不**假定旧 token 失效（client_credentials 生成的 token 相互独立，Zendesk 不互踢）。
- 写回 rc 失败（如磁盘只读）不阻断本次请求：本次用内存中的 token 完成请求，仅打印一次 warning。
- 并发（两个进程同时刷新）：允许 benign race（各自写回，后写胜出）；如需强一致，用文件锁，但非硬性要求。

### R4 — 错误与可观测性

| 场景 | 要求 |
|---|---|
| `invalid_client` | 提示检查 `oauthClientId`/`oauthClientSecret` 是否与 Admin Center 一致（secret 只在创建时展示一次，必要时重新生成） |
| `unauthorized_client` | 提示该 OAuth client 必须为 confidential（Admin Center → Client kind），public client 不支持 client_credentials |
| `invalid_scope` | 提示请求的 scope 超出 client 的 allowed scopes，并回显请求的 scope |
| 网络失败 | 保留原请求错误语义；自动刷新失败时错误信息须包含“刷新 token 失败”上下文 |
| 刷新成功 | 默认静默（避免污染 `--json` 输出）；可选 `--verbose` 时打一行 stderr 说明已刷新 |

### R5 — 安全

- 写入 `~/.zendeskrc` 时权限收紧为 `0600`（含 client secret 后必须）。
- 所有输出（text/`--json`/`--raw`/错误信息）不得出现完整 `client_secret` 或 access token。
- 不把 secret 拼进 URL；token endpoint 只走 POST body。

### R6 — 文档

同步更新 README、AGENTS.md、`installer/skill-template.ts`：

- 新增 `oauth-login` 命令与 R1 配置键说明；
- 说明自动刷新语义（惰性检查 + 401 重试一次、2 天上限、无 refresh_token）；
- 前置条件写明：client 必须 confidential。

### R7 — 测试

| 类型 | 用例 |
|---|---|
| 单元 | 过期判定边界：`expires_at - now` = 59/60/61 秒；无 `expires_at` 时的行为 |
| 单元 | 401 → 刷新 → 重试成功；401 重试后仍 401 → 原错误上抛且只刷新一次 |
| 单元 | 非 401（403/404/500）不触发刷新 |
| 单元 | 无 client 凭据时行为与 v0.1.3 一致（不新增报错） |
| 单元 | R0 回归：`config-set oauth-token` 生效；脏 key `oauth-token` 可读、写回时迁移 |
| 单元 | `config-show` 掩码 + 到期信息 |
| 集成（mock fetch） | 完整链路：旧 token 过期 → 自动换新 → 写回 rc → 请求头使用新 token |

## 非目标（Out of scope）

- authorization_code 流程与 refresh_token 刷新（另开需求）。
- 修改 Zendesk 侧 client 配置（`kind=confidential` 仍需在 Admin Center 或 API 手动设置）。
- 静默刷新之外的后台守护进程 / 定时器（token 只在被使用时刷新）。

## 验收标准

| ID | 场景 | 期望 |
|---|---|---|
| A1 | `config-set oauth-token X` 后 `config-show` | `mode: oauth`，token 掩码可见（R0 修复） |
| A2 | 配置 client id/secret 后执行 `oauth-login` | 成功写回 token + 到期时间，输出不含完整 secret/token，rc 权限 0600 |
| A3 | token 在 60s 内到期，执行任意 API 命令 | 自动换新并成功返回业务数据，无需人工干预 |
| A4 | 手工把 rc 中 token 改成无效值，执行 API 命令 | 401 → 自动重换 → 成功；全程仅刷新一次 |
| A5 | 仅配置 `oauthToken`（无 client 凭据），token 过期 | 行为与旧版一致（原样报错），不出现新错误类型 |
| A6 | 纯 static token 场景 | api-token / basic 模式零影响 |
| A7 | `--json` 输出 | 业务 JSON 干净，无刷新噪声（自动刷新静默） |

## Sign-off

- [ ] 需求确认（Mack）
- [ ] 实现完成 + `npm test` / `npm run typecheck` 通过
- [ ] README / AGENTS.md / skill 模板已更新
- [ ] 版本号与发布方式确认（是否发 0.1.4）
