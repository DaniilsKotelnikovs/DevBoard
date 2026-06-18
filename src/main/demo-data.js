'use strict';

const NOW = Date.now();
const ago = (minutes) => new Date(NOW - minutes * 60 * 1000).toISOString();

const GITLAB_MRS = {
  reviewPending: [
    {
      id: 1001, iid: 312, title: 'Add rate-limit headers to public API',
      web_url: 'https://example.com', draft: false, has_conflicts: false,
      merge_status: 'can_be_merged', upvotes: 1,
      references: { short: '!312' }, updated_at: ago(45),
    },
    {
      id: 1002, iid: 308, title: 'Replace bcrypt with argon2id in auth service',
      web_url: 'https://example.com', draft: false, has_conflicts: false,
      merge_status: 'can_be_merged', upvotes: 0,
      references: { short: '!308' }, updated_at: ago(190),
    },
    {
      id: 1003, iid: 301, title: 'Migrate session store to Redis Cluster',
      web_url: 'https://example.com', draft: false, has_conflicts: true,
      merge_status: 'cannot_be_merged', upvotes: 0,
      references: { short: '!301' }, updated_at: ago(1440),
    },
  ],
  reviewApproved: [
    {
      id: 1004, iid: 315, title: 'Bump Node.js to 22.x in CI matrix',
      web_url: 'https://example.com', draft: false, has_conflicts: false,
      merge_status: 'can_be_merged', upvotes: 2,
      references: { short: '!315' }, updated_at: ago(20),
    },
  ],
  reviewChangesRequested: [],
  assigned: [
    {
      id: 1005, iid: 319, title: 'Draft: Background job queue with BullMQ',
      web_url: 'https://example.com', draft: true, has_conflicts: false,
      merge_status: 'can_be_merged', upvotes: 0,
      references: { short: '!319' }, updated_at: ago(30),
    },
    {
      id: 1006, iid: 295, title: 'Cleanup: remove legacy feature flags from config',
      web_url: 'https://example.com', draft: false, has_conflicts: false,
      merge_status: 'can_be_merged', upvotes: 0,
      references: { short: '!295' }, updated_at: ago(2880),
    },
  ],
};

function jiraIssue(key, summary, statusName, updatedMinutesAgo) {
  return {
    id: key,
    key,
    fields: {
      summary,
      status:   { name: statusName },
      assignee: { displayName: 'Alex Kim' },
      updated:  ago(updatedMinutesAgo),
    },
  };
}

const JIRA_SPRINT = [
  jiraIssue('CORE-412', 'Implement JWT refresh token rotation',   'In Progress', 10),
  jiraIssue('CORE-401', 'Write OpenAPI spec for /auth endpoints', 'In Review',   90),
  jiraIssue('INFRA-87', 'Set up staging environment on Fly.io',  'To Do',      300),
  jiraIssue('CORE-398', 'Add request tracing with OpenTelemetry', 'Done',       720),
  jiraIssue('DASH-56',  'Dark mode toggle in user settings',      'In Progress',  5),
];

const JIRA_BACKLOG = [
  jiraIssue('CORE-388', 'Evaluate PostHog vs Mixpanel for analytics', 'To Do', 4320),
  jiraIssue('INFRA-74', 'Document disaster recovery runbook',          'To Do', 8640),
  jiraIssue('DASH-49',  'Keyboard navigation for data tables',         'To Do', 2880),
];

module.exports = { GITLAB_MRS, JIRA_SPRINT, JIRA_BACKLOG };
