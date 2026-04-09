// shared-workflows/scripts/mcp-agent.mjs
// MCP Agent PR Review — comment-only mode (Week 1)
// Uses Anthropic Messages API with server-side MCP for Jira AC + GitHub review
import { readFileSync, writeFileSync } from 'fs';
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
const DIFF_LIMIT = 12000;       // chars
const DIFF_SKIP_LIMIT = 50000;  // chars — skip review entirely

// ── Diff ───────────────────────────────────────────────────────
let diff = '';
let diffTruncated = false;
let diffTotalLines = 0;
try {
  const rawDiff = readFileSync('/tmp/pr.diff', 'utf8');
  diffTotalLines = rawDiff.split('\n').length;

  if (rawDiff.length > DIFF_SKIP_LIMIT) {
    console.log(`Diff too large (${rawDiff.length} chars, ${diffTotalLines} lines). Skipping review.`);
    // Post a comment explaining why we skipped
    console.log(`::warning::PR diff too large for automated review (${diffTotalLines} lines). Please request manual review.`);
    process.exit(0);
  }

  if (rawDiff.length > DIFF_LIMIT) {
    diff = rawDiff.slice(0, DIFF_LIMIT) +
      `\n\n[PARTIAL REVIEW: diff truncated at ${DIFF_LIMIT} chars. Full diff has ${diffTotalLines} lines. Focus review on the included portion.]`;
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
const prompt = `
You are an AI code reviewer for the ${REPO} repository.
Follow the review skills below to conduct a thorough PR review.

## Review Skills
${skills}

## PR Information
- PR #${PR_NUMBER}: ${PR_TITLE}
- Author: ${PR_AUTHOR}
- Branch: ${HEAD_REF} -> ${BASE_REF}
- URL: ${PR_URL}
- Jira Ticket: ${JIRA_TICKET || 'Not found'}
${diffTruncated ? '- WARNING: Diff was truncated. This is a partial review.' : ''}

## PR Description
${PR_BODY || '(empty)'}

## CI Results
${ciSummary}

## Code Diff
\`\`\`diff
${diff}
\`\`\`

---

## Instructions (execute in order):

### Step 1: PR Structure Validation
Follow the rules in review.md to validate the PR description.
Check for: Jira ticket link, change description (>20 chars), test plan, checklist.

### Step 2: Get Jira Acceptance Criteria
${JIRA_TICKET
  ? `Use atlassian MCP to query ${JIRA_TICKET} at ${JIRA_BASE_URL}. Get Summary, Acceptance Criteria, and Priority.
If the MCP call fails, note "Jira AC unavailable" and proceed with code-only review.`
  : 'No Jira ticket found in branch name. Skip AC check.'}

### Step 3: Code Review
Review the diff according to loaded skills. Output:
- AC coverage status (if Jira AC was retrieved)
- [MUST FIX] issues (with file name and line number)
- [SUGGESTION] improvements
- [SCOPE] changes outside the ticket scope

### Step 4: Post PR Review Comment
Use github MCP to create a pull request review on ${REPO} PR #${PR_NUMBER}.

IMPORTANT: Use event type "COMMENT" (not "APPROVE" or "REQUEST_CHANGES").
This is comment-only mode for validation.

Format the review body as:

## AI Code Review

**Jira**: ${JIRA_TICKET || 'N/A'}
**CI**: [status]
**Coverage**: [value]%
**Skills loaded**: ${skillNames.join(', ')}

### AC Coverage
[list each AC item with coverage status, or "No Jira AC available"]

### Must Fix
[MUST FIX items, or "None"]

### Suggestions
[SUGGESTION items, or "None"]

### Score
X / 5 — [explanation]

---
_Automated review by MCP Agent (comment-only mode)_
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
