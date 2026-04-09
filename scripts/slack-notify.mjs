// shared-workflows/scripts/slack-notify.mjs
// Reads /tmp/review-summary.json and posts a formatted Slack notification
import { readFileSync } from 'fs';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
if (!SLACK_WEBHOOK_URL) {
  console.log('SLACK_WEBHOOK_URL not set, skipping notification');
  process.exit(0);
}

// Read review summary
let summary;
try {
  summary = JSON.parse(readFileSync('/tmp/review-summary.json', 'utf8'));
} catch {
  console.log('No review summary found, skipping notification');
  process.exit(0);
}

const { score, mustFixCount, prNumber, prTitle, prAuthor, prUrl, repo, estimatedCost, error } = summary;

// Build result line
let emoji, resultText;
if (error) {
  emoji = ':warning:';
  resultText = `Agent Error: ${error}`;
} else if (score >= 4) {
  emoji = ':large_green_circle:';
  resultText = `Score ${score}/5 — All clear`;
} else if (score !== null) {
  emoji = ':red_circle:';
  const parts = [];
  if (mustFixCount > 0) parts.push(`${mustFixCount} must fix`);
  // Count suggestions from the original result if available
  resultText = `Score ${score}/5` + (parts.length ? ` — ${parts.join(', ')}` : '');
} else {
  emoji = ':white_circle:';
  resultText = 'Review completed';
}

// Build Slack message
const message = {
  blocks: [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji === ':large_green_circle:' ? 'Passed' : emoji === ':red_circle:' ? 'Needs Fix' : 'Review'} — PR #${prNumber}`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*PR*\n<${prUrl}|#${prNumber} ${prTitle}>` },
        { type: 'mrkdwn', text: `*Author*\n${prAuthor}` },
        { type: 'mrkdwn', text: `*Result*\n${emoji} ${resultText}` },
        { type: 'mrkdwn', text: `*Cost*\n$${estimatedCost || 'N/A'}` },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View PR' },
          url: prUrl,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `${repo} • _Automated review by sefc-pr-review-agent_` },
      ],
    },
  ],
};

// Send
const response = await fetch(SLACK_WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(message),
});

if (response.ok) {
  console.log('Slack notification sent');
} else {
  console.error(`Slack notification failed: ${response.status} ${await response.text()}`);
}
