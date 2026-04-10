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
const DIFF_LIMIT = 500000;

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

// ── Prompt (no MCP — Claude only generates review text) ───────
const prompt = `You are a code reviewer for ${REPO}. Review PR #${PR_NUMBER}.

RULES:
- Only review files in the diff. Do NOT suggest changes to files not in the diff.
- Only flag issues you can see in the code. Do NOT assume missing files or configs in other repos.
- [MUST FIX]: only for code logic bugs, unhandled errors, security vulnerabilities, or missing AC implementation.
- [SUGGESTION]: naming, readability, PR description format, missing tests, style issues.
- PR description formatting issues (unchecked items, missing fields) are SUGGESTION, never MUST FIX.
- If the diff is TRUNCATED: you are seeing incomplete code. Do NOT flag syntax errors, missing closing braces, or incomplete logic as MUST FIX if the issue could be caused by truncation. Only flag issues where you can see BOTH the problematic code AND enough surrounding context to be certain it's a real bug. When uncertain, downgrade to [SUGGESTION] with a note that verification is needed due to truncated diff.

JIRA TICKET:
${jiraAC}

STEPS:
1. Check the Jira ticket info above. If AC/requirements are listed, check each item against the diff: ✅ covered or ❌ not covered. Uncovered AC = [MUST FIX]. If no AC defined, write "No AC defined in ticket".
2. Review the diff using these rules:
${skills}
3. Output your review in EXACTLY this markdown format (nothing else):

## AI Code Review
**Jira**: ${JIRA_TICKET || 'N/A'} | **CI**: ${TEST_PASSED === 'success' ? 'PASSED' : 'FAILED'} | **Coverage**: ${COVERAGE || 'N/A'}% | **Skills**: ${skillNames.join(', ')}
### AC Coverage
[AC items with status, or "No Jira ticket" / "No AC defined" / "Jira AC unavailable"]
### Must Fix
[items with file:line, or "None"]
### Suggestions
[items, or "None"]
### Score
X / 5 — [one line reason]
---
_Automated review by sefc-pr-review-agent_

PR: ${PR_TITLE} by ${PR_AUTHOR} (${HEAD_REF} → ${BASE_REF})
${diffTruncated ? `⚠️ LARGE PR: ${diffTotalLines} lines (${diffTotalChars} chars). Only first ${DIFF_LIMIT} chars included. Use file stat below for full scope.` : ''}

PR Description:
${PR_BODY || '(empty)'}

${diffTruncated ? `File Stat (complete list of changed files):\n\`\`\`\n${diffStat}\n\`\`\`\n` : ''}
Diff${diffTruncated ? ' (truncated)' : ''}:
\`\`\`diff
${diff}
\`\`\`
`;

// ── Call Claude API (pure Messages API, no MCP) ───────────────
console.log('Agent starting');
console.log(`PR #${PR_NUMBER}: ${PR_TITLE}`);
console.log(`Jira: ${JIRA_TICKET || 'not found'}`);
console.log(`Model: ${MODEL}`);
console.log(`Skills: ${skillNames.join(', ')}`);

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

  console.log('\nClaude review generated');

  // ── Post review via GitHub REST API ───────────────────────
  console.log('Posting review to GitHub...');
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
    console.error(`GitHub API Error (${reviewRes.status}): ${errText}`);
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
