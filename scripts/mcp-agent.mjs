// shared-workflows/scripts/mcp-agent.mjs
// MCP Agent PR Review — comment-only mode (Week 1)
// Uses Anthropic Messages API with server-side MCP for Jira AC + GitHub review
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
const MAX_TOKENS = 4096;
const DIFF_LIMIT = 12000;       // chars — truncate, never skip

// ── Diff ───────────────────────────────────────────────────────
let diff = '';
let diffStat = '';
let diffTruncated = false;
let diffTotalLines = 0;
let diffTotalChars = 0;

// Get diff stat (always available, small size)
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

  // Always truncate to DIFF_LIMIT — never skip entirely
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

// ── CI Summary ─────────────────────────────────────────────────
const ciSummary = [
  `Test status: ${TEST_PASSED === 'success' ? 'PASSED' : 'FAILED'}`,
  `Coverage: ${COVERAGE || 'N/A'}%`,
].join('\n');

// ── MCP Servers (Atlassian + GitHub only, no Slack for Week 1) ─
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
// Optimized: concise instructions, clear boundaries, structured output
const prompt = `You are a code reviewer for ${REPO}. Review PR #${PR_NUMBER} and post a review comment.

RULES:
- Only review files in the diff. Do NOT suggest changes to files not in the diff.
- Only flag issues you can see in the code. Do NOT assume missing files or configs in other repos.
- [MUST FIX]: only for code logic bugs, unhandled errors, security vulnerabilities, or missing AC implementation.
- [SUGGESTION]: naming, readability, PR description format, missing tests, style issues.
- PR description formatting issues (unchecked items, missing fields) are SUGGESTION, never MUST FIX.

STEPS:
1. ${JIRA_TICKET
  ? `Use atlassian MCP to get ${JIRA_TICKET} from ${JIRA_BASE_URL}. Extract the Acceptance Criteria (AC). If AC exists, check each item against the diff: ✅ covered or ❌ not covered. Uncovered AC = [MUST FIX]. If no AC field in ticket, write "No AC defined in ticket". If MCP fails, write "Jira AC unavailable".`
  : 'No Jira ticket found. Skip AC check. Write "No Jira ticket" in AC section.'}
2. Review the diff using these rules:
${skills}
3. Use github MCP to create a pull request review on ${REPO} PR #${PR_NUMBER} with event "COMMENT" (not APPROVE/REQUEST_CHANGES). Format:

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

// ── Call Claude API ────────────────────────────────────────────
console.log(`MCP Agent starting`);
console.log(`PR #${PR_NUMBER}: ${PR_TITLE}`);
console.log(`Jira: ${JIRA_TICKET || 'not found'}`);
console.log(`Model: ${MODEL}`);
console.log(`Skills: ${skillNames.join(', ')}`);
console.log(`MCP servers: ${mcpServers.map(s => s.name).join(', ')}`);

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

  // Extract text content from response
  const result = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  // Log token usage for cost tracking
  if (data.usage) {
    console.log(`\nToken usage: input=${data.usage.input_tokens}, output=${data.usage.output_tokens}`);
    const estimatedCost = (data.usage.input_tokens * 3 / 1_000_000) + (data.usage.output_tokens * 15 / 1_000_000);
    console.log(`Estimated cost: $${estimatedCost.toFixed(4)}`);
  }

  console.log('\nAgent completed');
  console.log(result);

  // Extract score from result (pattern: "X / 5")
  const scoreMatch = result.match(/(\d)\s*\/\s*5/);
  const score = scoreMatch ? parseInt(scoreMatch[1]) : null;

  // Extract MUST FIX count
  const mustFixCount = (result.match(/\[MUST FIX\]/gi) || []).length;

  // Write summary to file for Slack notification step
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
  console.log('Review summary written to /tmp/review-summary.json');

  // Comment-only mode: always exit 0 (don't block merge)

} catch (error) {
  console.error(`Agent error: ${error.message}`);

  // Write error summary for Slack
  writeFileSync('/tmp/review-summary.json', JSON.stringify({
    score: null,
    error: error.message,
    prNumber: PR_NUMBER,
    prTitle: PR_TITLE,
    prAuthor: PR_AUTHOR,
    prUrl: PR_URL,
    repo: REPO,
  }));

  // Don't block merge on agent failure
  process.exit(0);
}
