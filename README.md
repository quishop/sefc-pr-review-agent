# sefc-pr-review-agent

MCP Agent 驅動的 PR Review 自動化，供 quishop org 下所有 repo 共用。

## 運作方式

```
你的 repo（開 PR）
    │
    ├── .github/workflows/pr-review.yml   ← 10 行 caller workflow
    │
    └── 觸發 ─────────────────────────────┐
                                          ▼
                              sefc-pr-review-agent（本 repo）
                              ├── scripts/skill-loader.mjs  ← 偵測 changed files，載入對應 skills
                              ├── scripts/mcp-agent.mjs     ← Claude Sonnet + MCP，產生 review
                              └── skills/*.md               ← review 規則
                                          │
                                          ▼
                              PR Review Comment（出現在 PR review tab）
```

Claude 透過 MCP 連接 Jira（讀取驗收標準）和 GitHub（發表 review），對每個 PR 自動產生結構化的 code review。

## 快速開始

### 1. 在你的 repo 加入 caller workflow

建立 `.github/workflows/pr-review.yml`：

```yaml
name: PR Review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  pull-requests: write
  contents: read

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
          TICKET=$(echo "${{ github.head_ref }}" | grep -oP '[A-Z]+-\d+' | head -1 || echo "")
          echo "key=$TICKET" >> $GITHUB_OUTPUT
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
```

### 2. 設定 Org-level Secrets & Variables

到 GitHub org Settings > Secrets and variables > Actions 設定：

**Secrets：**
| 名稱 | 說明 |
|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API key（[console.anthropic.com](https://console.anthropic.com/settings/keys)） |
| `JIRA_TOKEN` | Atlassian API token（[id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens)） |

**Variables：**
| 名稱 | 說明 | 範例 |
|------|------|------|
| `JIRA_BASE_URL` | Jira Cloud 網址 | `https://quishop.atlassian.net` |
| `JIRA_EMAIL` | Atlassian 帳號 email | `you@company.com` |

### 3. 開 PR 測試

在已加入 caller workflow 的 repo 開一個 PR，GitHub Actions 會自動觸發 review。

## Skills

自動載入機制：必載 3 個 + 依據 changed files 條件載入。

| Skill | 載入條件 | 內容 |
|-------|---------|------|
| `review.md` | 必載 | PR 結構驗證、AC 覆蓋確認、評分 1-5 |
| `naming.md` | 必載 | camelCase / PascalCase / kebab-case 命名規範 |
| `security.md` | 必載 | hardcoded secrets、SQL injection、敏感目錄標記 |
| `typescript.md` | `.ts` / `.tsx` | 禁止 `any`、async/await、React props 規範 |
| `python.md` | `.py` | Type hints、bare except 禁止、import 排序 |
| `migration.md` | `migration` / `schema` | Rollback 必要、禁止裸 DROP、大表 NOT NULL |
| `api.md` | `routes` / `controllers` | RESTful 規範、request validation、認證 |
| `infra.md` | `.tf` / `k8s` / `helm` | Tags 必填、禁止 latest tag、最小權限 |

## 架構

```
sefc-pr-review-agent/
├── .github/workflows/
│   └── pr-review.yml       ← Reusable workflow（備用，目前用 inline caller）
├── scripts/
│   ├── mcp-agent.mjs       ← Agent 核心：Claude Sonnet + Atlassian/GitHub MCP
│   └── skill-loader.mjs    ← 動態 skill 載入：git diff → 偵測技術棧 → 載入 skills
├── skills/                  ← 8 個 review skill 定義
├── .env.example             ← 本地開發環境變數範本
└── README.md
```

### MCP 互動

使用 Anthropic Messages API 的 server-side MCP（`anthropic-beta: mcp-client-2025-04-04`）：
- **Atlassian MCP** — 從 Jira 讀取 ticket 的驗收標準（AC）
- **GitHub MCP** — 在 PR 上發表 review comment

不需要在 CI runner 上跑 MCP server process。

### Comment-only 模式

目前所有 review 都以 `COMMENT` 形式發表（不會 `APPROVE` 或 `REQUEST_CHANGES`）。
設定 `continue-on-error: true` 確保 review 失敗不會阻擋 merge。

## 成本

| 項目 | 數值 |
|------|------|
| 模型 | Claude Sonnet（claude-sonnet-4-20250514） |
| 每次 review | ~$0.06-0.25（依 diff 大小和 MCP calls） |
| 每日 10 個 PR | ~$0.60-2.50 |

## 適用 repo

| Repo | 技術棧 | 自動載入的 Skills |
|------|--------|-----------------|
| fluffy-agent-core | Python | review, naming, security, python |
| fluffy-core | Django | review, naming, security, migration, api |
| fluffy-core-internal-dashboard | Next.js | review, naming, security, typescript |

## 自訂 Skills

新增 skill：在 `skills/` 目錄建立 `.md` 檔案，然後在 `scripts/skill-loader.mjs` 的 `conditional` array 加入觸發條件。

修改規則：直接編輯對應的 `skills/*.md`，所有引用的 repo 下次 PR 觸發時自動生效。

## 相關資源

- Jira Ticket：[SFA-997](https://quishop.atlassian.net/browse/SFA-997)
- Anthropic MCP 文件：[docs.anthropic.com](https://docs.anthropic.com/en/docs/agents-and-tools/mcp)
