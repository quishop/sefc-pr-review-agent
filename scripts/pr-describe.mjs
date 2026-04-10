// shared-workflows/scripts/pr-describe.mjs
// Auto-generate PR description from Jira ticket + commits + diff
// Claude generates text, Node.js posts via GitHub REST API
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
const hasExistingContent = PR_BODY
  && PR_BODY.trim().length > 100
  && PR_BODY.includes('## Summary');

if (hasExistingContent) {
  console.log('PR already has structured description, skipping auto-generate');
  process.exit(0);
}

// ── Gather context ────────────────────────────────────────────
let commits = '';
try {
  commits = execSync(
    `git log origin/${BASE_REF}..HEAD --format="- %s" --no-merges`,
    { encoding: 'utf8' }
  ).trim();
} catch {
  commits = '(unable to get commits)';
}

let diffStat = '';
try {
  diffStat = execSync(
    `git diff origin/${BASE_REF}...HEAD --stat`,
    { encoding: 'utf8' }
  ).trim();
} catch {
  diffStat = '(unable to get diff stat)';
}

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

// ── Jira via REST API ─────────────────────────────────────────
let jiraInfo = '';
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
      const data = await jiraRes.json();
      jiraInfo = `Summary: ${data.fields?.summary || ''}\nDescription: ${data.fields?.description || '(empty)'}`;
      console.log(`Jira fetched: ${JIRA_TICKET}`);
    } else {
      console.warn(`Jira API returned ${jiraRes.status}`);
    }
  } catch (e) {
    console.warn(`Jira fetch error: ${e.message}`);
  }
}

// ── Prompt (no MCP — Claude only generates description text) ──
const prompt = `Generate a PR description for ${REPO} PR #${PR_NUMBER}.
Output ONLY the markdown body, nothing else.

CONTEXT:
- PR title: ${PR_TITLE}
- Author: ${PR_AUTHOR}
- Branch: ${HEAD_REF} → ${BASE_REF}
- Jira ticket: ${JIRA_TICKET || 'None'}
${jiraInfo ? `\nJIRA TICKET DETAILS:\n${jiraInfo}\n` : ''}
COMMITS:
${commits}

FILES CHANGED:
${diffStat}

DIFF:
\`\`\`diff
${diff}
\`\`\`

Output this exact format (in Traditional Chinese):

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

RULES:
- Write Summary in Traditional Chinese
- Be concise, each bullet max 1-2 sentences
- Test plan items should be specific and actionable
- Do NOT include the diff or commits in the output
`;

// ── Call Claude API (pure Messages API, no MCP) ───────────────
console.log('Generating PR description...');

try {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`API Error (${response.status}):`, errorText);
    process.exit(0);
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

  // ── Update PR body via GitHub REST API ──────────────────────
  console.log('Updating PR description...');
  const updateRes = await fetch(
    `https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GH_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: result }),
    }
  );

  if (updateRes.ok) {
    console.log('PR description updated');
  } else {
    const errText = await updateRes.text();
    console.error(`GitHub API Error (${updateRes.status}): ${errText}`);
  }

} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(0);
}
