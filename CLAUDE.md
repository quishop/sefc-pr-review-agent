# CLAUDE.md

## 語言偏好

**請使用繁體中文回覆所有問題和說明。**

## 專案概覽

sefc-pr-review-agent 是 quishop org 的共用 PR Review 自動化工具。透過 GitHub Actions + Claude MCP Agent，對所有 repo 的 PR 自動產生 code review 和 PR description。

## 架構

```
scripts/                    ← 核心腳本（Node.js ESM）
├── mcp-agent.mjs           ← AI Code Review 主邏輯
├── pr-describe.mjs         ← PR Description 自動生成
├── skill-loader.mjs        ← 動態 skill 載入器
└── slack-notify.mjs        ← Slack 通知

skills/                     ← Review 規則（Markdown）
├── review.md               ← 必載：PR 結構 + 評分標準
├── naming.md               ← 必載：命名規範
├── security.md             ← 必載：安全規則
├── python.md               ← 條件：Python + Django
├── react.md                ← 條件：React / JS
├── typescript.md           ← 條件：TypeScript / Next.js
├── migration.md            ← 條件：DB migration
├── api.md                  ← 條件：API endpoints
└── infra.md                ← 條件：Infrastructure

.github/workflows/
└── pr-review.yml           ← Reusable Workflow（備用，目前各 repo 用 inline caller）
```

## 開發指引

### 執行環境

- Node.js 20+（scripts 用 ESM，`import` 語法）
- 不需要 `npm install`，scripts 只用 Node.js 內建模組（`fs`, `child_process`, `path`）+ `fetch`（Node 18+ 內建）

### 本地測試

目前沒有本地測試框架。驗證方式是在 GitHub Actions 中跑 PR 觸發 workflow。

如果要本地測試 skill-loader：
```bash
BASE_REF=main node -e "import('./scripts/skill-loader.mjs').then(m => console.log(m.loadSkills()))"
```

### 修改 Skills

Skills 是 Markdown 檔案，定義 review 規則。每個 skill 的格式：

```markdown
# Skill: [名稱]

## 規則分類（[MUST FIX] / [SUGGESTION]）

- 規則描述
- 附帶 code example（bad vs good）

## 發現違規時

[分類] → [MUST FIX] 或 [SUGGESTION]
```

**MUST FIX vs SUGGESTION 的標準：**
- [MUST FIX]：程式碼邏輯錯誤、安全漏洞、AC 未覆蓋、未處理的 exception
- [SUGGESTION]：命名、可讀性、PR description 格式、效能建議

修改後 push to main 即生效，所有引用 repo 的下次 PR 自動套用。

### 修改 Scripts

| Script | 職責 | 輸入 | 輸出 |
|--------|------|------|------|
| `skill-loader.mjs` | 偵測 changed files → 載入對應 skills | `BASE_REF` env var | `{ content, names }` |
| `pr-describe.mjs` | Jira + commits + diff → PR description | env vars + `/tmp/pr.diff` | 透過 GitHub MCP 更新 PR body |
| `mcp-agent.mjs` | diff + skills + Jira AC → review comment | env vars + `/tmp/pr.diff` | 透過 GitHub MCP 發 review + `/tmp/review-summary.json` |
| `slack-notify.mjs` | 讀取 review summary → Slack 通知 | `SLACK_WEBHOOK_URL` + `/tmp/review-summary.json` | Slack message |

### 新增 Skill 的步驟

1. 在 `skills/` 建立 `{name}.md`
2. 在 `scripts/skill-loader.mjs` 的 `conditional` array 加入：
```javascript
{
  skill: '{name}.md',
  condition: changedFiles.some(f => /* 觸發條件 */),
},
```
3. Commit + push to main

### 新增 Repo 的步驟

1. 在目標 repo 建立 `.github/workflows/pr-review.yml`（見 README 的 caller workflow）
2. 確認 org-level secrets/variables 已設定
3. 開 PR 測試

## MCP 互動

使用 Anthropic Messages API 的 server-side MCP（`anthropic-beta: mcp-client-2025-04-04`）：

| MCP Server | 用途 |
|------------|------|
| Atlassian MCP (`mcp.atlassian.com`) | 讀取 Jira ticket 的 Summary、AC、Priority |
| GitHub MCP (`api.githubcopilot.com`) | 發表 PR review comment、更新 PR body |

Claude 在 API server side 直接連 MCP servers，不需在 GitHub Actions runner 上跑 MCP process。

## Skill 載入邏輯

```
changed files
    │
    ├── 必載：review.md, naming.md, security.md（每次都載入）
    │
    ├── .py          → python.md（含 Django 規範）
    ├── .js / .jsx   → react.md（含 MUI 規範）
    ├── .ts / .tsx    → typescript.md（含 Next.js 規範）
    ├── migration / schema → migration.md
    ├── views / serializers / urls.py → api.md
    └── .tf / k8s / Dockerfile / .github/workflows/ → infra.md
```

## 環境變數

### GitHub Actions 需要（org-level）

| 名稱 | 類型 | 說明 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Secret | Anthropic API key |
| `JIRA_TOKEN` | Secret | Atlassian API token |
| `SLACK_WEBHOOK_URL` | Secret | Slack Incoming Webhook URL |
| `JIRA_BASE_URL` | Variable | `https://quishop.atlassian.net` |
| `JIRA_EMAIL` | Variable | Atlassian 帳號 email |

### 本地開發（.env）

```bash
cp .env.example .env
# 填入真正的值
```

## 設計決策

### 為什麼用 server-side MCP 而不是 REST API？
驗證 MCP agent pattern 是 Sysfeather 產品路線圖的策略需求。未來可能將此模式用在其他 agent 產品中。

### 為什麼 Skills 是 Markdown 不是 JSON？
Markdown 可讀性高，非工程師也能修改 review 規則。同時也是 Claude 最擅長理解的格式。

### 為什麼用 inline caller 而不是 Reusable Workflow？
GitHub Enterprise 的 Actions policy 可能限制跨 repo workflow_call。Inline caller + checkout 共用 repo 的方式更穩定。未來如果 reusable workflow 可用，可以切換回去（`.github/workflows/pr-review.yml` 已備好）。

### 為什麼 Comment-only 模式？
Week 1 驗證期間，AI 不做 approve/reject 決定，只留 comment。避免 false positive 阻擋開發者。等 10+ PR 驗證品質穩定後再開啟 auto-approve。

### 為什麼 PR Description 自動填寫有跳過邏輯？
如果 PR body 已經有 `## Summary` 且超過 100 字，表示開發者已經寫了詳細 description，不應該被 AI 覆蓋。

## 待辦事項

- [ ] 解決 Jira MCP "API permission denied" 問題（token 權限不足）
- [ ] Token 成本優化（MCP tool schema 佔 ~60K input tokens）
- [ ] 加入 auto-approve 模式（評分 >= 4 自動 approve）
- [ ] 支援 Reusable Workflow（解決 GitHub Enterprise Actions policy）
- [ ] 加入 Jira webhook 自動建 branch（SFA-997 Phase 3）
- [ ] 加入 per-repo skill 覆寫機制（各 repo 可放額外 skill）

## 相關連結

- Jira：[SFA-997](https://quishop.atlassian.net/browse/SFA-997)
- 設計文件：`~/.gstack/projects/quishop-fluffy-agent-core/wadejhao-feat-automatic-QA-design-20260409-120945.md`
- fluffy-agent-core：quishop/fluffy-agent-core
- fluffy-core：quishop/fluffy-core
- dashboard：fluffy-core/frontend
