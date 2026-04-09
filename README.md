# sefc-pr-review-agent

MCP Agent 驅動的 PR Review 自動化 + PR Description 自動生成，供 quishop org 下所有 repo 共用。

## 功能

| 功能 | 說明 |
|------|------|
| **AI Code Review** | Claude Sonnet 讀取 diff + Jira AC，產生結構化 review comment |
| **PR Description 自動填寫** | 從 Jira ticket + commits + diff 自動生成 PR description |
| **Slack 通知** | review 完成後發送結構化訊息到 Slack channel |
| **動態 Skill 載入** | 根據 changed files 自動載入對應的 review 規則（Python/React/Django/...）|

## 運作流程

```
開發者開 PR（body 可以空白）
    │
    ├── Step 1: pr-describe.mjs
    │   Jira ticket + commits + diff → 自動產生 PR description
    │
    ├── Step 2: mcp-agent.mjs
    │   skill-loader 偵測技術棧 → 載入對應 skills
    │   Claude Sonnet + Atlassian MCP（Jira AC）+ GitHub MCP → review comment
    │
    └── Step 3: slack-notify.mjs
        發送 review 結果到 Slack channel（評分、MUST FIX 數量、成本）
```

## 快速開始

### 1. 設定 Org-level Secrets & Variables

到 GitHub org Settings > Secrets and variables > Actions：

**Secrets：**

| 名稱 | 說明 |
|------|------|
| `ANTHROPIC_API_KEY` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| `JIRA_TOKEN` | [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `SLACK_WEBHOOK_URL` | [api.slack.com/apps](https://api.slack.com/apps) → Incoming Webhooks |

**Variables：**

| 名稱 | 範例 |
|------|------|
| `JIRA_BASE_URL` | `https://quishop.atlassian.net` |
| `JIRA_EMAIL` | `you@company.com` |

### 2. 在目標 repo 加入 workflow

建立 `.github/workflows/pr-review.yml`：

```yaml
name: PR Review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  pull-requests: write
  contents: read

concurrency:
  group: pr-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  mcp-agent-review:
    name: MCP Agent Review
    runs-on: ubuntu-latest
    if: ${{ !github.event.pull_request.draft }}
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/checkout@v4
        with:
          repository: quishop/sefc-pr-review-agent
          path: .review-agent
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Get PR diff
        run: |
          git fetch origin ${{ github.base_ref }}
          git diff origin/${{ github.base_ref }}...HEAD > /tmp/pr.diff

      - name: Extract Jira ticket
        id: jira
        run: |
          TICKET=$(echo "${{ github.head_ref }}" | grep -oE '[A-Z]+-[0-9]+' | head -1 || echo "")
          if [ -z "$TICKET" ]; then
            TICKET=$(echo "${{ github.event.pull_request.title }}" | grep -oE '[A-Z]+-[0-9]+' | head -1 || echo "")
          fi
          echo "key=$TICKET" >> $GITHUB_OUTPUT

      - name: Auto-fill PR description
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          JIRA_BASE_URL: ${{ vars.JIRA_BASE_URL }}
          JIRA_EMAIL: ${{ vars.JIRA_EMAIL }}
          JIRA_TOKEN: ${{ secrets.JIRA_TOKEN }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          PR_TITLE: ${{ github.event.pull_request.title }}
          PR_AUTHOR: ${{ github.event.pull_request.user.login }}
          PR_URL: ${{ github.event.pull_request.html_url }}
          PR_BODY: ${{ github.event.pull_request.body }}
          REPO: ${{ github.repository }}
          BASE_REF: ${{ github.base_ref }}
          HEAD_REF: ${{ github.head_ref }}
          JIRA_TICKET: ${{ steps.jira.outputs.key }}
        run: node .review-agent/scripts/pr-describe.mjs

      - name: Run MCP Agent
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          JIRA_BASE_URL: ${{ vars.JIRA_BASE_URL }}
          JIRA_EMAIL: ${{ vars.JIRA_EMAIL }}
          JIRA_TOKEN: ${{ secrets.JIRA_TOKEN }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          PR_TITLE: ${{ github.event.pull_request.title }}
          PR_AUTHOR: ${{ github.event.pull_request.user.login }}
          PR_URL: ${{ github.event.pull_request.html_url }}
          PR_BODY: ${{ github.event.pull_request.body }}
          REPO: ${{ github.repository }}
          BASE_REF: ${{ github.base_ref }}
          HEAD_REF: ${{ github.head_ref }}
          JIRA_TICKET: ${{ steps.jira.outputs.key }}
          TEST_PASSED: 'unknown'
          COVERAGE: 'N/A'
        run: node .review-agent/scripts/mcp-agent.mjs

      - name: Notify Slack
        if: always()
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
        run: node .review-agent/scripts/slack-notify.mjs
```

### 3. 開 PR 測試

Branch 命名規則：`feat/{JIRA-KEY}` 或 `fix/{JIRA-KEY}`（例如 `feat/SFA-997`）。
也支援從 PR title 或 body 抽取 Jira ticket。

## Skills

動態載入：必載 3 個 + 根據 changed files 條件載入 8 個。

| Skill | 觸發條件 | 行數 | 重點 |
|-------|---------|------|------|
| `review.md` | 必載 | 49 | PR 結構驗證、AC 覆蓋、評分 1-5 |
| `naming.md` | 必載 | 43 | Python snake_case / JS camelCase、禁止命名對照表 |
| `security.md` | 必載 | 75 | hardcoded secret 偵測、injection、SSRF、認證檢查 |
| `python.md` | `.py` | 93 | type hints、bare except、asyncio、常見 bug pattern |
| `django.md` | `models` `views` `serializers` `urls` `settings` `middleware` | 221 | Model 規範、QuerySet N+1、StandardResponse、DRF serializer、BaseRepository |
| `react.md` | `.js` `.jsx` `.ts` `.tsx` | 120 | useEffect 規則、Error Boundary、MUI theme、API key 暴露 |
| `typescript.md` | `.ts` `.tsx` | 74 | 禁止 any、型別標注、async/await、React hooks |
| `nextjs.md` | `app/` `pages/` `middleware` `layout` `next.config` | 236 | Server/Client Component、Route Handler、next/image、env 洩漏 |
| `migration.md` | `migration` `schema` | 61 | Django migration reverse_code、危險操作對照表 |
| `api.md` | `views` `serializers` `urls.py` | 79 | StandardResponse 格式、DRF serializer 強制、認證 |
| `infra.md` | `.tf` `k8s` `Dockerfile` `.github/workflows/` | 34 | Terraform tags、latest tag 禁止、最小權限 |

### Skill 規則來源

所有 skill 規則都從 quishop 的三個 repo 中提取真實 pattern：

| Repo | 技術棧 | 提取的規則 |
|------|--------|----------|
| fluffy-agent-core | Python + Strands + LangGraph | Worker/Skill pattern、TypedDict、asyncio timeout、exception hierarchy |
| fluffy-core | Django + DRF | StandardResponse、select_related、TextChoices、BaseRepository、APIKeyAuth |
| dashboard | React (CRA) + MUI | 雙重 useEffect 反模式、hardcoded API key、Error Boundary、theme color |

## 專案結構

```
sefc-pr-review-agent/
├── .github/workflows/
│   └── pr-review.yml         ← Reusable workflow（備用）
├── scripts/
│   ├── mcp-agent.mjs         ← AI Code Review（Claude Sonnet + MCP）
│   ├── pr-describe.mjs       ← PR Description 自動生成
│   ├── skill-loader.mjs      ← 動態 skill 載入
│   └── slack-notify.mjs      ← Slack Block Kit 通知
├── skills/                    ← 11 個 review skill 定義
│   ├── review.md             ← 必載：PR 結構 + 評分
│   ├── naming.md             ← 必載：命名規範
│   ├── security.md           ← 必載：安全規則
│   ├── python.md             ← 條件：Python 通用
│   ├── django.md             ← 條件：Django 框架
│   ├── react.md              ← 條件：React / JavaScript
│   ├── typescript.md         ← 條件：TypeScript 通用
│   ├── nextjs.md             ← 條件：Next.js 框架
│   ├── migration.md          ← 條件：DB migration
│   ├── api.md                ← 條件：API endpoints
│   └── infra.md              ← 條件：Infrastructure
├── .env.example
└── CLAUDE.md                  ← AI 開發指引
```

## 成本

| 項目 | 數值 |
|------|------|
| 模型 | Claude Sonnet（claude-sonnet-4-20250514） |
| PR Description 生成 | ~$0.05-0.15 |
| Code Review | ~$0.06-0.25 |
| 每次 PR 總計 | ~$0.10-0.40 |
| 每日 10 個 PR | ~$1.00-4.00 |

## 自訂 Skills

**新增 skill：**
1. 在 `skills/` 建立 `.md` 檔案
2. 在 `scripts/skill-loader.mjs` 的 `conditional` array 加入觸發條件
3. Push to main，所有 repo 下次 PR 自動生效

**修改規則：** 直接編輯 `skills/*.md`，push 即生效。

## 適用 repo

| Repo | 技術棧 | 自動載入的 Skills |
|------|--------|-----------------|
| fluffy-agent-core | Python | review, naming, security, python |
| fluffy-core | Django + DRF | review, naming, security, python, django, migration, api |
| dashboard (Next.js 遷移後) | Next.js + TS | review, naming, security, react, typescript, nextjs |
| dashboard (現況 CRA) | React + JS | review, naming, security, react |

## Branch 命名規則

```
feat/SFA-997              ← 新功能
fix/SFA-1024              ← Bug 修復
feat/SFA-997-add-worker   ← 帶描述
Feat/SFA-997              ← 大小寫都支援
```

Jira ticket 從 branch name → PR title → PR body 依序嘗試抽取。

## 相關資源

- Jira：[SFA-997](https://quishop.atlassian.net/browse/SFA-997)
- Anthropic MCP：[docs.anthropic.com](https://docs.anthropic.com/en/docs/agents-and-tools/mcp)
- Slack Incoming Webhooks：[api.slack.com](https://api.slack.com/messaging/webhooks)
