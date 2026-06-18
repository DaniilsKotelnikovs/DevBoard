const api = globalThis.devboard;

const state = {
  config: null,
  credentials: { gitlab: false, jira: false },
  panelData: {},
  settingsOpen: false,
  gitlabSaveStatus: null,
  jiraSaveStatus: null,
  _sliderDragging: false,
};

// textContent → innerHTML escapes <, >, & but not " — needed for attribute safety
function esc(str) {
  const el = document.createElement('span');
  el.textContent = str == null ? '' : String(str);
  return el.innerHTML.replaceAll('"', '&quot;');
}

function applyTheme(theme) {
  const valid = ['teal', 'slate-blue', 'clay'];
  document.documentElement.setAttribute('data-theme', valid.includes(theme) ? theme : 'teal');
}

function brandLogoSVG() {
  return `<svg class="brand-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3" y="3" width="94" height="94" rx="22" fill="#202327" stroke="rgba(255,255,255,0.09)" stroke-width="1"/>
    <circle cx="30" cy="34" r="4.6" class="logo-accent"/>
    <rect x="42" y="31" width="30" height="6" rx="3" fill="#C7CCD2"/>
    <circle cx="30" cy="50" r="4.6" fill="#7E858E"/>
    <rect x="42" y="47" width="22" height="6" rx="3" fill="#878D95"/>
    <circle cx="30" cy="66" r="4.6" fill="#5A6068"/>
    <rect x="42" y="63" width="26" height="6" rx="3" fill="#676D75"/>
  </svg>`;
}

function relAge(ms) {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function itemAge(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  return `${d}d`;
}

function mrDotClass(mr) {
  if (mr.draft || mr.work_in_progress)                    return 'grey';
  if (mr.has_conflicts)                                    return 'red';
  if (mr.merge_status === 'can_be_merged' || mr.upvotes)  return 'green';
  return 'amber';
}

function jiraDotClass(issue) {
  const s = (issue.fields?.status?.name || '').toLowerCase();
  if (s.includes('done') || s.includes('closed') || s.includes('resolved')) return 'green';
  if (s.includes('block') || s.includes('impede'))                           return 'red';
  if (s.includes('progress') || s.includes('review') || s.includes('testing')) return 'amber';
  return 'grey';
}

function mrProjectPath(mr) {
  // Extract "group/repo" from web_url: https://gitlab.com/group/repo/-/merge_requests/1
  try {
    const u = new URL(mr.web_url);
    const parts = u.pathname.split('/').filter(Boolean);
    const mrIdx = parts.indexOf('-');
    if (mrIdx > 0) return parts.slice(0, mrIdx).join('/');
    return parts.slice(0, -2).join('/');
  } catch {
    return mr.references?.short?.split('!')[0] || '';
  }
}

function loadingBar() {
  return `<div class="loading-bar"><div class="loading-bar-fill"></div></div>`;
}

function skeletonRows(n) {
  const widthPairs = [[72, 42], [60, 36], [78, 48], [55, 30]];
  return Array.from({ length: n }, (_, i) => {
    const [w1, w2] = widthPairs[i % widthPairs.length];
    return `<div class="skeleton-row">
      <span class="skeleton-dot"></span>
      <div class="skeleton-lines">
        <div class="skeleton-line" style="width:${w1}%"></div>
        <div class="skeleton-line narrow" style="width:${w2}%"></div>
      </div>
    </div>`;
  }).join('');
}

function staleIndicator(lastUpdated) {
  return `<div class="stale-indicator">
    <span class="stale-dot"></span>
    Last updated ${esc(relAge(lastUpdated))} · retrying
  </div>`;
}

function unconfiguredState(panel) {
  const svc  = panel.type === 'gitlab-mr' ? 'GitLab' : 'Jira';
  const noun = panel.type === 'gitlab-mr' ? 'merge requests' : 'issues';
  return `<div class="unconfigured-state">
    <div class="unconfigured-text">Connect ${esc(svc)} to see your ${esc(noun)}.</div>
    <button class="unconfigured-btn" data-action="open-settings">Open Settings</button>
  </div>`;
}

function authErrorState(panel, lastUpdated) {
  const svc  = panel.type === 'gitlab-mr' ? 'GitLab' : 'Jira';
  const when = lastUpdated ? ` Last good sync ${relAge(lastUpdated)}.` : '';
  return `<div class="error-state">
    <span class="error-icon"></span>
    <div>
      <div class="error-title">${esc(svc)} token expired.</div>
      <div class="error-sub">Update it in Settings to resume syncing.${esc(when)}</div>
    </div>
  </div>`;
}

function networkErrorState(panel) {
  const svc = panel.type === 'gitlab-mr' ? 'GitLab' : 'Jira';
  return `<div class="error-state">
    <span class="error-icon"></span>
    <div>
      <div class="error-title">Could not reach ${esc(svc)}.</div>
      <div class="error-sub">Check your network connection. Will retry automatically.</div>
    </div>
  </div>`;
}

function mrRows(mrs, isStale) {
  if (!mrs.length) return '';
  const staleClass = isStale ? ' stale-item' : '';
  return mrs.map(mr => {
    const dot  = mrDotClass(mr);
    const proj = mrProjectPath(mr);
    const mrId = mr.iid ? `!${mr.iid}` : '';
    const age  = itemAge(mr.updated_at);
    return `<div class="item-row${staleClass}" tabindex="0"
        data-url="${esc(mr.web_url)}"
        title="${esc(mr.title)}">
      <span class="status-dot ${dot}"></span>
      <div class="row-content">
        <div class="row-title">${esc(mr.title)}</div>
        <div class="row-meta">
          <span>${esc(proj)}</span>
          <span class="row-id">${esc(mrId)}</span>
          <span class="row-sep-dot">·</span><span>${esc(age)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function jiraRows(issues, baseUrl, isStale) {
  if (!issues.length) return '';
  const staleClass = isStale ? ' stale-item' : '';
  return issues.map(issue => {
    const dot        = jiraDotClass(issue);
    const key        = issue.key || '';
    const summary    = issue.fields?.summary || '';
    const statusName = issue.fields?.status?.name || '';
    const assignee   = issue.fields?.assignee;
    const who        = assignee
      ? (assignee.displayName?.split(' ')[0] || 'me')
      : 'me';
    const itemUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/browse/${key}` : '';
    return `<div class="item-row${staleClass}" tabindex="0"
        data-url="${esc(itemUrl)}"
        title="${esc(summary)}">
      <span class="status-dot ${dot}"></span>
      <div class="row-content">
        <div class="row-title">
          <span class="row-jira-id">${esc(key)}</span>${esc(summary)}
        </div>
        <div class="row-meta">
          <span>${esc(statusName)}</span>
          <span class="row-sep-dot">·</span><span>${esc(who)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function newestAge(mrs) {
  if (!mrs.length) return '';
  const top = mrs.reduce((a, b) =>
    new Date(b.updated_at) > new Date(a.updated_at || 0) ? b : a, {});
  return top.updated_at ? itemAge(top.updated_at) : '';
}

function mrSection(label, mrs, isStale, dotOverride) {
  if (!mrs.length) return '';
  const rows = mrs.map(mr => {
    const dot  = dotOverride || mrDotClass(mr);
    const proj = mrProjectPath(mr);
    const mrId = mr.iid ? `!${mr.iid}` : '';
    const age  = itemAge(mr.updated_at);
    const staleClass = isStale ? ' stale-item' : '';
    return `<div class="item-row${staleClass}" tabindex="0"
        data-url="${esc(mr.web_url)}"
        title="${esc(mr.title)}">
      <span class="status-dot ${dot}"></span>
      <div class="row-content">
        <div class="row-title">${esc(mr.title)}</div>
        <div class="row-meta">
          <span>${esc(proj)}</span>
          <span class="row-id">${esc(mrId)}</span>
          <span class="row-sep-dot">·</span><span>${esc(age)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
  return `<div class="mr-group">
    <div class="mr-group-label">${label}</div>
    ${rows}
  </div>`;
}

function mrPanelBody(panel, data) {
  const assigned               = data.items                  || [];
  const reviewPending          = data.reviewPending          || [];
  const reviewApproved         = data.reviewApproved         || [];
  const reviewChangesRequested = data.reviewChangesRequested || [];
  const isStale                = data.status === 'error';

  const tileAge1 = newestAge(reviewPending);
  const tileAge2 = newestAge(assigned);

  const tiles = `<div class="summary-tiles">
    <div class="summary-tile" tabindex="0">
      <div class="summary-count">${reviewPending.length}</div>
      <div class="summary-label">Needs your review</div>
      ${tileAge1 ? `<div class="summary-age">${tileAge1}</div>` : ''}
    </div>
    <div class="summary-tile" tabindex="0">
      <div class="summary-count">${assigned.length}</div>
      <div class="summary-label">Assigned to you</div>
      ${tileAge2 ? `<div class="summary-age">${tileAge2}</div>` : ''}
    </div>
  </div>`;

  const totalMRs = reviewPending.length + reviewChangesRequested.length
    + reviewApproved.length + assigned.length;

  if (totalMRs === 0) {
    return tiles + `<div class="empty-state">
      <div class="empty-title">No open merge requests.</div>
      <div class="empty-sub">Nothing needs your attention right now.</div>
    </div>`;
  }

  return tiles
    + mrSection('Needs review',       reviewPending,          isStale, 'amber')
    + mrSection('Changes requested',  reviewChangesRequested, isStale, 'red')
    + mrSection('Approved by you',    reviewApproved,         isStale, 'green')
    + mrSection('Assigned to you',    assigned,               isStale, null);
}

function jiraPanelBody(panel, data) {
  const items   = data.items || [];
  const isStale = data.status === 'error' && items.length > 0;
  const baseUrl = state.config?.jira?.url || '';

  if (items.length === 0) {
    return `<div class="empty-state">
      <div class="empty-title">No items.</div>
      <div class="empty-sub">All clear.</div>
    </div>`;
  }
  return jiraRows(items, baseUrl, isStale);
}

function dataRows(panel, data) {
  return panel.type === 'gitlab-mr' ? mrPanelBody(panel, data) : jiraPanelBody(panel, data);
}

function panelBodyHTML(panel, data) {
  const status   = data.status || 'loading';
  const hasItems = (data.items && data.items.length > 0) ||
                   (data.reviewPending && data.reviewPending.length > 0) ||
                   (data.reviewApproved && data.reviewApproved.length > 0) ||
                   (data.reviewChangesRequested && data.reviewChangesRequested.length > 0);

  if (status === 'unconfigured') return unconfiguredState(panel);

  if (status === 'auth-error') {
    const prev = hasItems ? dataRows(panel, data) : '';
    return authErrorState(panel, data.lastUpdated) + prev;
  }

  if (status === 'error' && !hasItems) return networkErrorState(panel);
  if (status === 'loading' && !hasItems) return loadingBar() + skeletonRows(2);

  const bar   = status === 'loading' ? loadingBar() : '';
  const stale = (status === 'error' && hasItems && data.lastUpdated)
    ? staleIndicator(data.lastUpdated) : '';

  return bar + stale + dataRows(panel, data);
}

function panelHTML(panel, idx, isFirst) {
  const data      = state.panelData[panel.id] || { status: 'loading' };
  const collapsed = panel.collapsed;

  let displayCount;
  if (data.status === 'ok') {
    displayCount = panel.type === 'gitlab-mr'
      ? (data.reviewPending?.length || 0) + (data.reviewApproved?.length || 0)
        + (data.reviewChangesRequested?.length || 0) + (data.items?.length || 0)
      : (data.items?.length ?? 0);
  } else if (data.status === 'loading' && data.items) {
    displayCount = '…';
  } else {
    displayCount = '—';
  }

  return `<div class="panel" data-panel-id="${esc(panel.id)}">
    <div class="panel-header${isFirst ? ' first-panel' : ''}"
        tabindex="0"
        role="button"
        aria-expanded="${!collapsed}"
        data-panel-id="${esc(panel.id)}">
      <span class="panel-caret">${collapsed ? '▸' : '▾'}</span>
      <span class="panel-label">${esc(panel.label)}</span>
      <span class="panel-count">${displayCount}</span>
    </div>
    <div class="panel-body${collapsed ? ' collapsed' : ''}"
        data-panel-id="${esc(panel.id)}">
      ${panelBodyHTML(panel, data)}
    </div>
  </div>`;
}

function renderPanels() {
  const container = document.getElementById('panels-container');
  if (!state.config) {
    container.innerHTML = skeletonRows(3);
    return;
  }

  const panels = state.config.panels || [];
  let html = '';
  panels.forEach((panel, idx) => {
    if (idx > 0) html += '<div class="panel-divider"></div>';
    html += panelHTML(panel, idx, idx === 0);
  });
  html += `<button class="add-panel-btn" id="add-panel-btn" aria-label="Add panel">+ Add panel</button>`;

  container.innerHTML = html;
  bindPanelEvents();
}

function bindPanelEvents() {
  container().querySelectorAll('.panel-header').forEach(el => {
    const activate = () => {
      const id = el.dataset.panelId;
      const panel = state.config.panels.find(p => p.id === id);
      if (!panel) return;
      panel.collapsed = !panel.collapsed;
      api.config.save({ panels: state.config.panels });
      renderPanels();
    };
    el.addEventListener('click', activate);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
  });

  container().querySelectorAll('.item-row').forEach(el => {
    const open = () => {
      const url = el.dataset.url;
      if (url) api.shell.openUrl(url);
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

  container().querySelectorAll('[data-action="open-settings"]').forEach(el => {
    el.addEventListener('click', openSettings);
  });

  let _refreshCooldown = false;
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    if (_refreshCooldown) return;
    _refreshCooldown = true;
    const btn = document.getElementById('btn-refresh');
    btn.style.opacity = '0.4';
    api.data.refresh();
    setTimeout(() => {
      btn.style.opacity = '';
      _refreshCooldown = false;
    }, 800);
  });
  document.getElementById('btn-settings')?.addEventListener('click', openSettings);
  document.getElementById('btn-minimize')?.addEventListener('click', () => api.window.minimize());
  document.getElementById('btn-close')?.addEventListener('click',    () => api.window.close());

  document.getElementById('add-panel-btn')?.addEventListener('click', () => {
    openSettings();
    requestAnimationFrame(() => {
      const body = document.querySelector('.settings-body');
      if (body) body.scrollTop = body.scrollHeight;
    });
  });
}

function container() {
  return document.getElementById('panels-container');
}

function buildSettingsHTML() {
  const cfg = state.config;
  const opacityVal  = cfg.opacity == null ? 0.9 : cfg.opacity;
  const opacityPct  = Math.round(opacityVal * 100);
  // Map 20-100% → 0-100% fill
  const fillPct     = Math.round(((opacityPct - 20) / 80) * 100);

  const glSaved = state.gitlabSaveStatus;
  const jrSaved = state.jiraSaveStatus;

  return `
    <div class="settings-titlebar" id="settings-drag-region">
      ${brandLogoSVG()}
      <span class="brand-name">DevBoard</span>
      <div style="flex:1"></div>
      <button class="ctrl-btn" id="s-gear-btn"
          style="background:var(--accent-soft);color:var(--accent);"
          aria-label="Close settings">⚙</button>
      <button class="ctrl-btn" id="s-min-btn"  aria-label="Minimize">–</button>
      <button class="ctrl-btn ctrl-close" id="s-close-btn" aria-label="Close">✕</button>
    </div>

    <div class="settings-body">
      <div class="settings-heading">
        <span class="settings-title-text">Settings</span>
        <div style="flex:1"></div>
        <button class="icon-btn" id="close-settings-btn" aria-label="Close settings">✕</button>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">Window</div>

        <div class="s-row">
          <span class="s-label">Opacity</span>
          <span class="s-value" id="opacity-pct">${opacityPct}%</span>
        </div>
        <div class="slider-wrap" id="opacity-slider" data-opacity="${opacityVal}">
          <div class="slider-fill"  id="slider-fill"  style="width:${fillPct}%"></div>
          <div class="slider-thumb" id="slider-thumb" style="left:${fillPct}%"></div>
        </div>

        <div class="s-row">
          <span class="s-label">Always on top</span>
          <button class="toggle ${cfg.alwaysOnTop === false ? '' : 'on'}"
              id="aot-toggle" role="switch"
              aria-checked="${cfg.alwaysOnTop === false ? 'false' : 'true'}">
            <div class="toggle-thumb"></div>
          </button>
        </div>

        <div class="s-row">
          <span class="s-label">Accent</span>
          <div class="theme-swatches" role="group" aria-label="Accent colour">
            ${['teal', 'slate-blue', 'clay'].map(t => {
              const color = t === 'teal' ? '#5E9B92' : t === 'slate-blue' ? '#6E86A6' : '#AE7C6D';
              const label = t === 'teal' ? 'Teal' : t === 'slate-blue' ? 'Slate Blue' : 'Clay';
              return `<button class="theme-swatch${cfg.theme === t || (!cfg.theme && t === 'teal') ? ' active' : ''}"
                  data-theme="${t}" title="${label}"
                  style="background:${color}" aria-pressed="${cfg.theme === t || (!cfg.theme && t === 'teal')}"></button>`;
            }).join('')}
          </div>
        </div>

        <div class="s-row" style="margin-bottom:0">
          <span class="s-label">Refresh interval</span>
          <div class="stepper">
            <button class="stepper-btn" id="interval-dec" aria-label="Decrease interval">−</button>
            <span   class="stepper-val" id="interval-val">${cfg.refreshInterval || 5} min</span>
            <button class="stepper-btn" id="interval-inc" aria-label="Increase interval">+</button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">GitLab</div>
        <div class="field-group">
          <div class="field-label">Instance URL</div>
          <input class="field-input" id="gl-url" type="url"
              value="${esc(cfg.gitlab?.url || 'https://gitlab.com')}"
              placeholder="https://gitlab.com"
              autocomplete="off" spellcheck="false">
        </div>
        <div class="field-group">
          <div class="field-label">Personal access token</div>
          <input class="field-input" id="gl-token" type="password"
              placeholder="Paste token…"
              autocomplete="new-password" spellcheck="false">
          <div class="field-hint">Token needs the <code>read_api</code> scope.</div>
        </div>
        <div class="save-actions">
          <button class="btn-primary" id="gl-save-btn">Save</button>
          ${glSaved === 'saved' ? '<span class="save-ok">✓ Stored</span>'   : ''}
          ${glSaved === 'error' ? '<span class="save-error">Error saving</span>' : ''}
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">Jira</div>
        <div class="field-group">
          <div class="field-label">Site URL</div>
          <input class="field-input" id="jr-url" type="url"
              value="${esc(cfg.jira?.url || '')}"
              placeholder="https://team.atlassian.net"
              autocomplete="off" spellcheck="false">
        </div>
        <div class="field-group">
          <div class="field-label">Account email</div>
          <input class="field-input" id="jr-email" type="email"
              value="${esc(cfg.jira?.email || '')}"
              placeholder="you@team.com"
              autocomplete="off" spellcheck="false">
        </div>
        <div class="field-group">
          <div class="field-label">API token</div>
          <input class="field-input" id="jr-token" type="password"
              placeholder="Paste token…"
              autocomplete="new-password" spellcheck="false">
        </div>
        <div class="save-actions">
          <button class="btn-primary" id="jr-save-btn">Save</button>
          ${jrSaved === 'saved' ? '<span class="save-ok">✓ Stored</span>'   : ''}
          ${jrSaved === 'error' ? '<span class="save-error">Error saving</span>' : ''}
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">Panels</div>
        <div id="panels-cfg-list">
          ${panelConfigListHTML(cfg.panels || [])}
        </div>
        <button class="btn-dashed" id="add-panel-settings-btn">+ Add panel</button>
      </div>
    </div>
  `;
}

function panelConfigListHTML(panels) {
  const subtitles = {
    'gitlab-mr':    'GitLab · merge requests',
    'jira-sprint':  'Jira · active sprint',
    'jira-backlog': 'Jira · backlog',
    'jira-jql':     'Jira · custom JQL',
  };
  return panels.map((panel, idx) =>
    `<div class="panel-config-item" draggable="true"
        data-panel-id="${esc(panel.id)}" data-idx="${idx}">
      <span class="drag-handle" aria-hidden="true">⠿</span>
      <div class="panel-config-info">
        <div class="panel-config-name">${esc(panel.label)}</div>
        <div class="panel-config-sub">${esc(subtitles[panel.type] || panel.type)}</div>
      </div>
      <button class="icon-btn danger"
          data-action="remove-panel"
          data-panel-id="${esc(panel.id)}"
          aria-label="Remove ${esc(panel.label)}">✕</button>
    </div>`
  ).join('');
}

function showKeychainWarning() {
  const existing = document.getElementById('keychain-warning');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'keychain-warning';
  banner.setAttribute('role', 'alert');
  banner.style.cssText = [
    'position:fixed', 'bottom:0', 'left:0', 'right:0',
    'padding:8px 12px', 'background:var(--error,#c0392b)', 'color:#fff',
    'font-size:11px', 'z-index:9999', 'text-align:center',
  ].join(';');
  banner.textContent = 'Warning: OS keychain unavailable — credentials are session-only and will be lost on restart.';
  document.body.appendChild(banner);
}

function renderSettings() {
  const overlay = document.getElementById('settings-overlay');
  overlay.innerHTML = buildSettingsHTML();
  bindSettingsEvents();
}

function bindSettingsEvents() {
  document.querySelectorAll('.theme-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      state.config.theme = theme;
      applyTheme(theme);
      api.config.save({ theme });
      document.querySelectorAll('.theme-swatch').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === theme);
        b.setAttribute('aria-pressed', String(b.dataset.theme === theme));
      });
    });
  });

  document.getElementById('s-gear-btn')?.addEventListener('click',  closeSettings);
  document.getElementById('s-min-btn')?.addEventListener('click',   () => api.window.minimize());
  document.getElementById('s-close-btn')?.addEventListener('click', () => api.window.close());
  document.getElementById('close-settings-btn')?.addEventListener('click', closeSettings);

  const sliderWrap = document.getElementById('opacity-slider');
  if (sliderWrap) {
    const fill  = document.getElementById('slider-fill');
    const thumb = document.getElementById('slider-thumb');
    const label = document.getElementById('opacity-pct');

    function applyOpacity(clientX) {
      const rect  = sliderWrap.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      // Slider range: 20% – 100%
      const opacity = 0.2 + ratio * 0.8;
      const pct = Math.round(opacity * 100);
      const fillW = `${ratio * 100}%`;
      fill.style.width  = fillW;
      thumb.style.left  = fillW;
      label.textContent = `${pct}%`;
      api.window.setOpacity(opacity);
      state.config.opacity = opacity;
    }

    sliderWrap.addEventListener('mousedown', e => {
      state._sliderDragging = true;
      applyOpacity(e.clientX);
    });
    // Attach to document so dragging outside the slider wrap still works
    const onMove = e => { if (state._sliderDragging) applyOpacity(e.clientX); };
    const onUp   = () => {
      if (state._sliderDragging) {
        state._sliderDragging = false;
        api.config.save({ opacity: state.config.opacity });
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    // Stored on the element so closeSettings() can remove these document listeners
    sliderWrap._cleanupSlider = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }

  document.getElementById('aot-toggle')?.addEventListener('click', function () {
    const newVal = !state.config.alwaysOnTop;
    state.config.alwaysOnTop = newVal;
    this.classList.toggle('on', newVal);
    this.setAttribute('aria-checked', String(newVal));
    api.window.setAlwaysOnTop(newVal);
    api.config.save({ alwaysOnTop: newVal });
  });

  const valEl = document.getElementById('interval-val');
  document.getElementById('interval-dec')?.addEventListener('click', () => {
    const cur = state.config.refreshInterval || 5;
    const v   = Math.max(1, cur - 1);
    state.config.refreshInterval = v;
    valEl.textContent = `${v} min`;
    api.config.save({ refreshInterval: v });
  });
  document.getElementById('interval-inc')?.addEventListener('click', () => {
    const cur = state.config.refreshInterval || 5;
    const v   = Math.min(60, cur + 1);
    state.config.refreshInterval = v;
    valEl.textContent = `${v} min`;
    api.config.save({ refreshInterval: v });
  });

  document.getElementById('gl-save-btn')?.addEventListener('click', async () => {
    const url   = document.getElementById('gl-url')?.value.trim()   || '';
    const token = document.getElementById('gl-token')?.value.trim() || '';
    if (!token) return;
    try {
      await api.credentials.saveGitLab({ url, token });
      state.config.gitlab = { url: url || 'https://gitlab.com' };
      state.gitlabSaveStatus = 'saved';
    } catch {
      state.gitlabSaveStatus = 'error';
    }
    renderSettings();
  });

  document.getElementById('jr-save-btn')?.addEventListener('click', async () => {
    const url   = document.getElementById('jr-url')?.value.trim()   || '';
    const email = document.getElementById('jr-email')?.value.trim() || '';
    const token = document.getElementById('jr-token')?.value.trim() || '';
    if (!token || !email || !url) return;
    try {
      await api.credentials.saveJira({ url, email, token });
      state.config.jira = { url, email };
      state.jiraSaveStatus = 'saved';
    } catch {
      state.jiraSaveStatus = 'error';
    }
    renderSettings();
  });

  document.querySelectorAll('[data-action="remove-panel"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.panelId;
      state.config.panels = state.config.panels.filter(p => p.id !== id);
      api.config.save({ panels: state.config.panels });
      document.getElementById('panels-cfg-list').innerHTML =
        panelConfigListHTML(state.config.panels);
      bindPanelConfigDrag();
      renderPanels();
    });
  });

  document.getElementById('add-panel-settings-btn')?.addEventListener('click', addPanel);

  bindPanelConfigDrag();
}

function addPanel() {
  const typeOrder = [
    { type: 'jira-sprint',  label: 'Active Sprint' },
    { type: 'jira-backlog', label: 'Backlog'        },
    { type: 'jira-jql',     label: 'Custom JQL'     },
  ];
  const existing = new Set(state.config.panels.map(p => p.type));
  const tpl = typeOrder.find(t => !existing.has(t.type))
           || { type: 'jira-jql', label: 'Custom JQL' };

  state.config.panels.push({
    id:        `${tpl.type}-${Date.now()}`,
    type:      tpl.type,
    label:     tpl.label,
    collapsed: false,
    jql:       null,
  });
  api.config.save({ panels: state.config.panels });
  document.getElementById('panels-cfg-list').innerHTML =
    panelConfigListHTML(state.config.panels);
  bindPanelConfigDrag();
  renderPanels();
}

function bindPanelConfigDrag() {
  const items = [...document.querySelectorAll('.panel-config-item')];
  let dragSrcIdx = -1;

  items.forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSrcIdx = Number.parseInt(item.dataset.idx, 10);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragSrcIdx));
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      items.forEach(i => i.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const dstIdx = Number.parseInt(item.dataset.idx, 10);
      if (dragSrcIdx === dstIdx || dragSrcIdx < 0) return;

      const panels = [...state.config.panels];
      const [moved] = panels.splice(dragSrcIdx, 1);
      panels.splice(dstIdx, 0, moved);
      state.config.panels = panels;
      api.config.save({ panels });

      document.getElementById('panels-cfg-list').innerHTML =
        panelConfigListHTML(panels);
      bindPanelConfigDrag();
      renderPanels();
    });
    item.addEventListener('dragend', () =>
      items.forEach(i => i.classList.remove('drag-over')));
  });
}

function openSettings() {
  state.settingsOpen = true;
  const overlay = document.getElementById('settings-overlay');
  overlay.classList.remove('hidden');
  renderSettings();
}

function closeSettings() {
  document.getElementById('opacity-slider')?._cleanupSlider?.();
  state._sliderDragging  = false;
  state.gitlabSaveStatus = null;
  state.jiraSaveStatus   = null;
  state.settingsOpen     = false;
  const overlay = document.getElementById('settings-overlay');
  overlay.classList.add('hidden');
  overlay.innerHTML = '';
}

async function init() {
  document.getElementById('btn-settings')?.addEventListener('click', openSettings);
  document.getElementById('btn-minimize')?.addEventListener('click', () => api.window.minimize());
  document.getElementById('btn-close')?.addEventListener('click',    () => api.window.close());

  document.getElementById('panels-container').innerHTML = skeletonRows(3);

  const [cfg, creds] = await Promise.all([
    api.config.getAll(),
    api.credentials.getStatus(),
  ]);
  state.config      = cfg;
  state.credentials = creds;

  applyTheme(cfg.theme || 'teal');

  if (creds.keychainAvailable === false) {
    console.error('[DevBoard] OS keychain unavailable — tokens are session-only and not persisted securely.');
    showKeychainWarning();
  }

  renderPanels();

  api.data.onPanelUpdate(({ panelId, ...payload }) => {
    const prev = state.panelData[panelId] || {};
    // Preserve stale items when a new loading/error status arrives
    state.panelData[panelId] = {
      ...prev,
      ...payload,
      items: (payload.status === 'error' || payload.status === 'loading')
        ? (payload.items ?? prev.items)
        : payload.items,
      reviewPending: (payload.status === 'error' || payload.status === 'loading')
        ? (payload.reviewPending ?? prev.reviewPending)
        : payload.reviewPending,
      reviewApproved: (payload.status === 'error' || payload.status === 'loading')
        ? (payload.reviewApproved ?? prev.reviewApproved)
        : payload.reviewApproved,
      reviewChangesRequested: (payload.status === 'error' || payload.status === 'loading')
        ? (payload.reviewChangesRequested ?? prev.reviewChangesRequested)
        : payload.reviewChangesRequested,
      lastUpdated: payload.lastUpdated ?? prev.lastUpdated,
    };

    const bodyEl = document.querySelector(
      `.panel-body[data-panel-id="${CSS.escape(panelId)}"]`
    );
    const panel = state.config?.panels.find(p => p.id === panelId);

    if (bodyEl && panel && !panel.collapsed) {
      const d = state.panelData[panelId];
      const hasContent = (d.items?.length > 0)
        || (d.reviewPending?.length > 0)
        || (d.reviewApproved?.length > 0)
        || (d.reviewChangesRequested?.length > 0);

      if (payload.status === 'loading' && hasContent) {
        // Show progress overlay without rewriting DOM — avoids flicker
        bodyEl.setAttribute('data-loading', '');
      } else {
        bodyEl.removeAttribute('data-loading');
        bodyEl.innerHTML = panelBodyHTML(panel, d);
        bindPanelBodyEvents(bodyEl);
      }
    }

    const countEl = document.querySelector(
      `.panel-header[data-panel-id="${CSS.escape(panelId)}"] .panel-count`
    );
    if (countEl && panel) {
      const d = state.panelData[panelId];
      if (d.status === 'ok') {
        const n = panel.type === 'gitlab-mr'
          ? (d.reviewPending?.length || 0) + (d.reviewApproved?.length || 0)
            + (d.reviewChangesRequested?.length || 0) + (d.items?.length || 0)
          : (d.items?.length ?? 0);
        countEl.textContent = String(n);
      }
    }
  });

  api.data.refresh();
}

function bindPanelBodyEvents(bodyEl) {
  bodyEl.querySelectorAll('.item-row').forEach(el => {
    const open = () => { const url = el.dataset.url; if (url) api.shell.openUrl(url); };
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
  bodyEl.querySelectorAll('[data-action="open-settings"]').forEach(el => {
    el.addEventListener('click', openSettings);
  });
}

try {
  await init();
} catch (err) {
  console.error('[DevBoard] init error:', err);
}
