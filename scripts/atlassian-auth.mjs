// shared-workflows/scripts/atlassian-auth.mjs
// Atlassian OAuth token management with auto-refresh

const {
  JIRA_EMAIL, JIRA_TOKEN,
  ATLASSIAN_OAUTH_TOKEN, ATLASSIAN_REFRESH_TOKEN,
  ATLASSIAN_CLIENT_ID, ATLASSIAN_CLIENT_SECRET,
} = process.env;

export async function getAtlassianToken() {
  if (!ATLASSIAN_OAUTH_TOKEN && !ATLASSIAN_REFRESH_TOKEN) {
    // No OAuth setup, fallback to Basic Auth
    if (JIRA_EMAIL && JIRA_TOKEN) {
      console.log('Atlassian: using Basic Auth (no OAuth configured)');
      return `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64')}`;
    }
    console.warn('Atlassian: no credentials available');
    return '';
  }

  // Try refresh first (access_token expires in 1 hour)
  if (ATLASSIAN_REFRESH_TOKEN && ATLASSIAN_CLIENT_ID && ATLASSIAN_CLIENT_SECRET) {
    try {
      const res = await fetch('https://auth.atlassian.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: ATLASSIAN_CLIENT_ID,
          client_secret: ATLASSIAN_CLIENT_SECRET,
          refresh_token: ATLASSIAN_REFRESH_TOKEN,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        console.log('Atlassian: OAuth token refreshed successfully');
        return `Bearer ${data.access_token}`;
      }
      console.warn(`Atlassian: token refresh failed (${res.status}), trying existing token`);
    } catch (e) {
      console.warn(`Atlassian: token refresh error: ${e.message}`);
    }
  }

  // Use existing access token
  if (ATLASSIAN_OAUTH_TOKEN) {
    console.log('Atlassian: using existing OAuth token');
    return `Bearer ${ATLASSIAN_OAUTH_TOKEN}`;
  }

  // Final fallback
  if (JIRA_EMAIL && JIRA_TOKEN) {
    console.log('Atlassian: OAuth failed, falling back to Basic Auth');
    return `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64')}`;
  }

  return '';
}
