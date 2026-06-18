'use strict';

const { net } = require('electron');

function apiError(type, extra = {}) {
  return Object.assign(new Error(`gitlab:${type}`), { type, ...extra });
}

function netGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, method: 'GET' });
    for (const [k, v] of Object.entries(headers)) req.setHeader(k, v);
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

// Tries /reviews (GitLab 15.7+) for full state; falls back to /approvals for approved-only detection.
async function getReviewState(base, projectId, mrIid, userId, headers) {
  const [reviews, approvals] = await Promise.allSettled([
    netGet(`${base}/api/v4/projects/${projectId}/merge_requests/${mrIid}/reviews`, headers),
    netGet(`${base}/api/v4/projects/${projectId}/merge_requests/${mrIid}/approvals`, headers),
  ]);

  if (reviews.status === 'fulfilled' && Array.isArray(reviews.value)) {
    const mine = reviews.value.find(r => r.user?.id === userId);
    if (mine?.state === 'approved')           return 'approved';
    if (mine?.state === 'requested_changes')  return 'changes_requested';
  }

  if (approvals.status === 'fulfilled') {
    if (approvals.value?.approved_by?.some(a => a.user?.id === userId)) return 'approved';
  }

  return 'pending';
}

async function fetchMRData(baseUrl, token) {
  const base = baseUrl.replace(/\/$/, '');
  const h = { 'PRIVATE-TOKEN': token };

  const user = await netGet(`${base}/api/v4/user`, h);
  const userId = user.id;

  const [assigned, reviewerQuery] = await Promise.all([
    netGet(`${base}/api/v4/merge_requests?scope=assigned_to_me&state=opened&per_page=50`, h),
    netGet(`${base}/api/v4/merge_requests?reviewer_id=${userId}&state=opened&scope=all&per_page=50`, h),
  ]);

  const assignedList = Array.isArray(assigned)      ? assigned      : [];
  const reviewerList = Array.isArray(reviewerQuery) ? reviewerQuery : [];

  const isReviewer     = (mr) => mr.reviewers?.some(r => r.id === userId);
  const assignedOnly   = assignedList.filter(mr => !isReviewer(mr));
  const assignedAndRev = assignedList.filter(mr =>  isReviewer(mr));

  const assignedIds  = new Set(assignedList.map(mr => mr.id));
  const reviewOnly   = reviewerList.filter(mr => !assignedIds.has(mr.id));

  const allReviewMRs = [...assignedAndRev, ...reviewOnly];

  const withState = await Promise.all(
    allReviewMRs.map(async mr => ({
      ...mr,
      _reviewState: await getReviewState(base, mr.project_id, mr.iid, userId, h),
    }))
  );

  return {
    userId,
    username:               user.username,
    assigned:               assignedOnly,
    reviewPending:          withState.filter(mr => mr._reviewState === 'pending'),
    reviewApproved:         withState.filter(mr => mr._reviewState === 'approved'),
    reviewChangesRequested: withState.filter(mr => mr._reviewState === 'changes_requested'),
  };
}

module.exports = { fetchMRData };
