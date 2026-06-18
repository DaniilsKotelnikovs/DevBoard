'use strict';

const { net } = require('electron');

function apiError(type, extra = {}) {
  return Object.assign(new Error(`jira:${type}`), { type, ...extra });
}

function netGet(url, email, token) {
  return new Promise((resolve, reject) => {
    const creds = Buffer.from(`${email}:${token}`).toString('base64');
    const req = net.request({ url, method: 'GET' });
    req.setHeader('Authorization', `Basic ${creds}`);
    req.setHeader('Accept', 'application/json');

    let body = '';
    req.on('response', (res) => {
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          reject(apiError('auth', { statusCode: res.statusCode }));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(apiError('http', { statusCode: res.statusCode }));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(apiError('parse'));
        }
      });
    });
    req.on('error', (err) => reject(apiError('network', { message: err.message })));
    req.end();
  });
}

async function searchIssues(baseUrl, email, token, jql) {
  const base = baseUrl.replace(/\/$/, '');
  const encoded = encodeURIComponent(jql);
  const url = `${base}/rest/api/3/search/jql?jql=${encoded}&maxResults=50&fields=summary,status,assignee,priority,issuetype,updated`;
  const data = await netGet(url, email, token);
  return Array.isArray(data.issues) ? data.issues : [];
}

async function fetchActiveSprint(baseUrl, email, token, customJql = 'assignee = currentUser() AND sprint in openSprints() ORDER BY updated DESC') {
  return searchIssues(baseUrl, email, token, customJql);
}

async function fetchBacklog(baseUrl, email, token, customJql = 'assignee = currentUser() AND sprint is EMPTY AND status != Done ORDER BY priority DESC') {
  return searchIssues(baseUrl, email, token, customJql);
}

async function fetchJQL(baseUrl, email, token, jql = 'assignee = currentUser()') {
  return searchIssues(baseUrl, email, token, jql);
}

module.exports = { fetchActiveSprint, fetchBacklog, fetchJQL };
