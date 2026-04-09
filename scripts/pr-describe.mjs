// shared-workflows/scripts/pr-describe.mjs
// Auto-generate PR description from Jira ticket + commits + diff
// Runs BEFORE mcp-agent.mjs, updates PR body via GitHub API
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const {
  ANTHROPIC_API_KEY,
  JIRA_BASE_URL, JIRA_EMAIL, JIRA_TOKEN,
  GH_TOKEN,
  PR_NUMBER, PR_TITLE, PR_AUTHOR, PR_URL, PR_BODY,
  REPO, BASE_REF, HEAD_REF,
  JIRA_TICKET,
} = process.env;

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;

// ── Skip if PR body already has content ───────────────────────
// If the developer already wrote a detailed description, don't overwrite
const hasExistingContent = PR_BODY
  && PR_BODY.trim().length > 100
  && PR_BODY.includes('## Summary');

if (hasExistingContent) {
  console.log('PR already has structured description, skipping auto-generate');
  process.exit(0);
}

// ── Gather context ────────────────────────────────────────────

// 1. Commits on this branch
let commits = '';
try {
  commits = execSync(
    `git log origin/${BASE_REF}..HEAD --format="- %s" --no-merges`,
    { encoding: 'utf8' }
  ).trim();
} catch {
  commits = '(unable to get commits)';
}

// 2. Diff stat (file summary, not full diff — saves tokens)
let diffStat = '';
try {
  diffStat = execSync(
    `git diff origin/${BASE_REF}...HEAD --stat`,
    { encoding: 'utf8' }
  ).trim();
} catch {
  diffStat = '(unable to get diff stat)';
}

// 3. Full diff (truncated for analysis)
let diff = '';
try {
  const rawDiff = readFileSync('/tmp/pr.diff', 'utf8');
  diff = rawDiff.length > 8000
    ? rawDiff.slice(0, 8000) + '\n[...truncated]'
    : rawDiff;
} catch {
  diff = '(unable to read diff)';
}

console.log(`PR #${PR_NUMBER}: ${PR_TITLE}`);
console.log(`Jira: ${JIRA_TICKET || 'not found'}`);
console.log(`Commits:\n${commits}`);
console.log(`Files changed:\n${diffStat}`);

// ── MCP Servers ───────────────────────────────────────────────
const mcpServers = [
  {
    type: 'url',
    url: 'https://mcp.atlassian.com/v1/sse',
    name: 'atlassian',
    authorization_token: `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64')}`,
  },
  {
    type: 'url',
    url: 'https://api.githubcopilot.com/mcp/',
    name: 'github',
    authorization_token: GH_TOKEN,
  },
];

// ── Prompt ─────────────────────────────────────────────────────
const prompt = `Generate a PR description for ${REPO} PR #${PR_NUMBER}.

CONTEXT:
- PR title: ${PR_TITLE}
- Author: ${PR_AUTHOR}
- Branch: ${HEAD_REF} → ${BASE_REF}
- Jira ticket: ${JIRA_TICKET || 'None'}

COMMITS:
${commits}

FILES CHANGED:
${diffStat}

DIFF:
\`\`\`diff
${diff}
\`\`\`

STEPS:
1. ${JIRA_TICKET
  ? `Use atlassian MCP to get ${JIRA_TICKET} from ${JIRA_BASE_URL}. Extract: Summary, Description, Acceptance Criteria, Priority. If MCP fails, use only commits and diff.`
  : 'No Jira ticket. Generate description from commits and diff only.'}

2. Analyze commits and diff to understand what changed:
   - What was added/modified/deleted
   - Which modules/components were affected
   - Any notable patterns (new API, DB changes, config changes, new dependencies)

3. Use github MCP to update the PR body of ${REPO} PR #${PR_NUMBER}. Set the body to this exact format (in Traditional Chinese):

## 關聯
${JIRA_TICKET ? `[${JIRA_TICKET}](${JIRA_BASE_URL}/browse/${JIRA_TICKET})` : 'N/A'}

## Summary
[2-5 bullet points summarizing what this PR does, derived from commits + diff + Jira description]

## 注意事項
[deployment notes, breaking changes, new env vars, DB migrations — or "無" if none]

## Test plan
[derive from Jira AC if available, otherwise suggest based on what changed]
- [ ] [test item 1]
- [ ] [test item 2]

## Checklist
- [x] PR title 包含 Jira key
- [ ] 通過本地測試
- [ ] 無敏感資訊（API keys、密碼）
- [ ] 相關文件已同步更新

IMPORTANT:
- Write Summary in Traditional Chinese
- Be concise, each bullet max 1-2 sentences
- Test plan items should be specific and actionable based on the actual changes
- If Jira AC exists, map each AC to a test plan item
- Do NOT include the diff or commits in the PR description
`;

// ── Call Claude API ────────────────────────────────────────────
console.log('Generating PR description...');

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
    process.exit(0); // Don't block on failure
  }

  const data = await response.json();
  const result = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  if (data.usage) {
    console.log(`Token usage: input=${data.usage.input_tokens}, output=${data.usage.output_tokens}`);
    const cost = (data.usage.input_tokens * 3 / 1_000_000) + (data.usage.output_tokens * 15 / 1_000_000);
    console.log(`Estimated cost: $${cost.toFixed(4)}`);
  }

  console.log('PR description generated');
  console.log(result);

} catch (error) {
  console.error(`Error: ${error.message}`);
  // Don't block pipeline on failure
  process.exit(0);
}
