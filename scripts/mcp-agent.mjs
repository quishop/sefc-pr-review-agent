// shared-workflows/scripts/mcp-agent.mjs
// AI PR Review — Claude generates review, Node.js posts via GitHub REST API
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { loadSkills } from './skill-loader.mjs';

// ── Environment Variables ──────────────────────────────────────
const {
  ANTHROPIC_API_KEY,
  JIRA_BASE_URL, JIRA_EMAIL, JIRA_TOKEN,
  GH_TOKEN,
  PR_NUMBER, PR_TITLE, PR_AUTHOR, PR_URL, PR_BODY, REPO,
  BASE_REF, HEAD_REF,
  JIRA_TICKET,
  TEST_PASSED, COVERAGE,
} = process.env;

// ── Config ─────────────────────────────────────────────────────
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 16384;
const DIFF_LIMIT = 350000;      // ~87K tokens, stays under 200K limit with MCP schema + prompt

// ── Diff ───────────────────────────────────────────────────────
let diff = '';
let diffStat = '';
let diffTruncated = false;
let diffTotalLines = 0;
let diffTotalChars = 0;

try {
  diffStat = execSync(
    `git diff origin/${BASE_REF}...HEAD --stat`,
    { encoding: 'utf8' }
  ).trim();
} catch {
  diffStat = '(unable to get diff stat)';
}

try {
  const rawDiff = readFileSync('/tmp/pr.diff', 'utf8');
  diffTotalLines = rawDiff.split('\n').length;
  diffTotalChars = rawDiff.length;

  if (rawDiff.length > DIFF_LIMIT) {
    diff = rawDiff.slice(0, DIFF_LIMIT) +
      `\n\n[PARTIAL REVIEW: diff truncated at ${DIFF_LIMIT} chars. Full diff has ${diffTotalLines} lines (${diffTotalChars} chars). Review based on truncated diff + file stat below.]`;
    diffTruncated = true;
    console.log(`Diff truncated: ${rawDiff.length} -> ${DIFF_LIMIT} chars (${diffTotalLines} total lines)`);
  } else {
    diff = rawDiff;
  }
} catch {
  diff = '(Unable to read diff)';
}

// ── Skills ─────────────────────────────────────────────────────
const { content: skills, names: skillNames } = loadSkills();

// ── Jira AC via REST API ──────────────────────────────────────
let jiraAC = '';
if (JIRA_TICKET && JIRA_BASE_URL && JIRA_EMAIL && JIRA_TOKEN) {
  try {
    const jiraRes = await fetch(
      `${JIRA_BASE_URL}/rest/api/2/issue/${JIRA_TICKET}?fields=summary,description`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64')}`,
          'Accept': 'application/json',
        },
      }
    );
    if (jiraRes.ok) {
      const jiraData = await jiraRes.json();
      const summary = jiraData.fields?.summary || '';
      const description = jiraData.fields?.description || '';
      jiraAC = `**Jira Summary**: ${summary}\n\n**Jira Description**:\n${description}`;
      console.log(`Jira AC fetched: ${JIRA_TICKET} (${summary})`);
    } else {
      console.warn(`Jira API returned ${jiraRes.status}`);
      jiraAC = 'Jira AC unavailable (API error)';
    }
  } catch (e) {
    console.warn(`Jira fetch error: ${e.message}`);
    jiraAC = 'Jira AC unavailable (fetch error)';
  }
} else {
  jiraAC = JIRA_TICKET ? 'Jira AC unavailable (missing credentials)' : 'No Jira ticket';
}

// ── Prompt ─────────────────────────────────────────────────────
const prompt = `你是 ${REPO} 的資深 code reviewer。請用繁體中文對 PR #${PR_NUMBER} 進行深度審查。

## 核心原則

**你審查的是 PR 的最終狀態（diff = dev branch vs PR branch HEAD），不是 commit 歷史。**
- 不要看 commit messages 來推測問題。commit 裡的 "fix" 表示問題已經被修了。
- 只看 diff 中最終的程式碼。如果某段程式碼在 diff 中是完整且正確的，即使早期 commit 有過問題，也不要報。
- 用 github MCP 的 get_file_contents 讀到的是 HEAD 的最新狀態，這才是你要審查的版本。

## 審查規則

分類標準：
- **[MUST FIX]** 🔴：程式碼邏輯錯誤、未處理的 exception、安全漏洞、AC 未實作、跨檔案 schema/interface 不一致、資料流斷裂
- **[SUGGESTION]** 🟡：命名、可讀性、PR description 格式、缺少測試、效能建議
- PR description 格式問題永遠是 SUGGESTION，不是 MUST FIX
- 如果 diff 被截斷，不要對截斷處的不完整程式碼判 MUST FIX，降級為 SUGGESTION 並標注需確認

## Jira Ticket
${jiraAC}

## 審查步驟（請嚴格依序執行）

### Step 1：Jira AC 覆蓋檢查
如果 Jira ticket 有 AC 或需求列表，逐條對照 diff：✅ covered / ❌ not covered。
未覆蓋的 AC = [MUST FIX]。沒有 AC 就寫「No AC defined in ticket」。

### Step 2：跨檔案一致性分析（最重要）
這是最關鍵的步驟。請用 github MCP 的 get_pull_request_files 取得完整檔案列表，
必要時用 get_file_contents 讀取關鍵檔案的完整內容。重點檢查：

- **State flow 一致性**：上游 skill/function 的 output key 名稱是否與下游的 input key 完全一致？
  例：A 輸出 \`image_facts\` 但 B 讀取 \`image_analysis\` → 資料斷裂 [MUST FIX]
- **Schema 一致性**：SKILL.md 定義的 output schema 是否與程式碼實際使用的結構一致？
  例：SKILL.md 寫 \`size_table_raw\` 但 code 用 \`size_table\` → 不一致 [MUST FIX]
- **Registry/Map 完整性**：新增的 skill/function 是否有在對應的 registry、field_map、config 中註冊？
  例：新增 skill 但 \`skill_field_map\` 沒加 → LLM 拿不到必要 context [MUST FIX]
- **版本相容性**：新舊版本的 interface 是否相容？有沒有 breaking change 沒有 migration？

### Step 3：程式碼品質審查
依照以下 skills 的規則審查 diff：
${skills}

### Step 4：產出 Review

直接輸出 review 內容（不要用 MCP 發表，系統會自動發送）。
Review body 必須使用以下格式（繁體中文）：

## AI Code Review
**Jira**: ${JIRA_TICKET || 'N/A'} | **CI**: ${TEST_PASSED === 'success' ? '通過' : '失敗'} | **覆蓋率**: ${COVERAGE || 'N/A'}% | **Skills**: ${skillNames.join(', ')}

### AC 覆蓋狀況
[逐條列出 AC 覆蓋狀態，或 "No AC defined in ticket"]

### 必須修正 (Must Fix)
[每個問題必須包含：]
[#### 編號. 問題標題 🔴 嚴重度（致命/高/中）]
[**File**: \`檔案路徑:行號\`]
[**Issue**: 問題描述（說明為什麼這是 bug，不只是描述現象）]
[**Fix**: 具體的修正建議（附 code snippet）]
[如果沒有 MUST FIX 問題，寫 "None"]

### 建議改善 (Suggestions)
[#### 編號. 問題標題 🟡 嚴重度（中/低）]
[**File**: \`檔案路徑:行號\`]
[**Issue**: 描述]
[**Suggestion**: 建議做法]

### 評分
X / 5 — [一句話說明]

評分標準：
- 5 分：無任何問題
- 4 分：只有 SUGGESTION
- 3 分：1-2 個 MUST FIX
- 2 分：3+ 個 MUST FIX
- 1 分：嚴重安全漏洞或架構問題

---
_Automated review by sefc-pr-review-agent_

## PR 資訊
- PR: ${PR_TITLE} by ${PR_AUTHOR} (${HEAD_REF} → ${BASE_REF})
${diffTruncated ? `- ⚠️ 大型 PR：${diffTotalLines} 行（${diffTotalChars} chars）。僅包含前 ${DIFF_LIMIT} chars。` : ''}

## PR Description
${PR_BODY || '(empty)'}

${diffTruncated ? `## 完整檔案列表\n\`\`\`\n${diffStat}\n\`\`\`\n` : ''}
## Diff${diffTruncated ? '（截斷）' : ''}
\`\`\`diff
${diff}
\`\`\`
`;

// ── MCP Server (GitHub only — for multi-turn reasoning) ───────
const mcpServers = [
  {
    type: 'url',
    url: 'https://api.githubcopilot.com/mcp/',
    name: 'github',
    authorization_token: GH_TOKEN,
  },
];

// ── Call Claude API (with GitHub MCP for deep analysis) ───────
console.log('Agent starting');
console.log(`PR #${PR_NUMBER}: ${PR_TITLE}`);
console.log(`Jira: ${JIRA_TICKET || 'not found'} (via REST)`);
console.log(`Model: ${MODEL}`);
console.log(`Skills: ${skillNames.join(', ')}`);
console.log('MCP: github (multi-turn reasoning)');

try {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'mcp-client-2025-04-04',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      mcp_servers: mcpServers,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`API Error (${response.status}):`, errorText);
    process.exit(1);
  }

  const data = await response.json();

  const result = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  // Log token usage
  if (data.usage) {
    console.log(`\nToken usage: input=${data.usage.input_tokens}, output=${data.usage.output_tokens}`);
    const estimatedCost = (data.usage.input_tokens * 3 / 1_000_000) + (data.usage.output_tokens * 15 / 1_000_000);
    console.log(`Estimated cost: $${estimatedCost.toFixed(4)}`);
  }

  console.log('\nClaude review completed');

  // ── Post review via GitHub REST API (always) ──────────────
  // MCP is used for analysis only, posting is always via REST to avoid duplicates
  if (result) {
    console.log('Posting review via GitHub REST API...');
    const reviewRes = await fetch(
      `https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}/reviews`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${GH_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body: result,
          event: 'COMMENT',
        }),
      }
    );
    if (reviewRes.ok) {
      console.log('Review posted to PR');
    } else {
      const errText = await reviewRes.text();
      console.error(`GitHub REST API Error (${reviewRes.status}): ${errText}`);
    }
  }

  // ── Extract metrics for Slack ─────────────────────────────
  const scoreMatch = result.match(/(\d)\s*\/\s*5/);
  const score = scoreMatch ? parseInt(scoreMatch[1]) : null;
  const mustFixCount = (result.match(/\[MUST FIX\]/gi) || []).length;

  const summary = JSON.stringify({
    score,
    mustFixCount,
    skillNames,
    jiraTicket: JIRA_TICKET || null,
    prNumber: PR_NUMBER,
    prTitle: PR_TITLE,
    prAuthor: PR_AUTHOR,
    prUrl: PR_URL,
    repo: REPO,
    tokenUsage: data.usage || null,
    estimatedCost: data.usage
      ? ((data.usage.input_tokens * 3 / 1_000_000) + (data.usage.output_tokens * 15 / 1_000_000)).toFixed(4)
      : null,
  });
  writeFileSync('/tmp/review-summary.json', summary);
  console.log('Review summary written');

} catch (error) {
  console.error(`Agent error: ${error.message}`);

  writeFileSync('/tmp/review-summary.json', JSON.stringify({
    score: null,
    error: error.message,
    prNumber: PR_NUMBER,
    prTitle: PR_TITLE,
    prAuthor: PR_AUTHOR,
    prUrl: PR_URL,
    repo: REPO,
  }));

  process.exit(0);
}
