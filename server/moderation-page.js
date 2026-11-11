const REASON_LABELS = {
  nudity: 'Nudity or sexual content',
  harassment: 'Harassment or hate',
  minor: 'Suspected minor',
  spam: 'Spam or scam',
  violence: 'Violence or self-harm',
  other: 'Something else',
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function layout({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(title)} · Riplika</title>
  <style>
    :root {
      --ink: #0c1b2a;
      --muted: #5d6f83;
      --line: #e1e8f0;
      --teal: #0e8f96;
      --teal-soft: #e3f7f7;
      --coral: #e95331;
      --coral-soft: #fff1ec;
      --navy: #071521;
      --card: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f4f8fb;
      color: var(--ink);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.5;
    }
    a { color: var(--teal); }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.76rem;
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 5px;
    }
    .top {
      background: var(--navy);
      color: #fff;
      padding: 18px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .brand { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .brand strong {
      font-size: 1.25rem;
      letter-spacing: -0.03em;
      font-weight: 800;
    }
    .brand strong::after { content: '.'; color: #ff6b4a; }
    .brand span {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #7fe3e2;
      background: rgba(127, 227, 226, 0.1);
      border: 1px solid rgba(127, 227, 226, 0.22);
      padding: 3px 8px;
      border-radius: 999px;
    }
    .top form { margin: 0; }
    .signout {
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.05);
      color: #c9d9e6;
      padding: 7px 12px;
      border-radius: 8px;
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .signout:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }
    .wrap { max-width: 1180px; margin: 0 auto; padding: 28px 24px 56px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 22px;
    }
    .stat {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 16px 18px;
      box-shadow: 0 4px 14px rgba(12, 27, 42, 0.04);
    }
    .stat strong {
      display: block;
      font-size: 1.6rem;
      letter-spacing: -0.03em;
      line-height: 1.15;
    }
    .stat span { font-size: 0.72rem; color: var(--muted); }
    .stat.alert strong { color: var(--coral); }
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .filters { display: flex; gap: 6px; flex-wrap: wrap; }
    .filters a {
      text-decoration: none;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--muted);
      background: #fff;
      border: 1px solid var(--line);
      padding: 7px 12px;
      border-radius: 999px;
    }
    .filters a.active {
      background: var(--ink);
      border-color: var(--ink);
      color: #fff;
    }
    .count { font-size: 0.75rem; color: var(--muted); }
    .panel {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(12, 27, 42, 0.05);
    }
    .table-scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 900px; }
    th {
      text-align: left;
      font-size: 0.64rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      background: #f9fbfd;
      border-bottom: 1px solid var(--line);
      padding: 11px 14px;
      white-space: nowrap;
    }
    td {
      padding: 13px 14px;
      border-bottom: 1px solid #eef3f8;
      vertical-align: top;
      font-size: 0.78rem;
    }
    tr:last-child td { border-bottom: 0; }
    tr:hover td { background: #fbfdff; }
    .reason { font-weight: 700; white-space: nowrap; }
    .reason small { display: block; color: var(--muted); font-weight: 500; font-size: 0.66rem; }
    .details { max-width: 330px; color: #3d5165; white-space: pre-wrap; overflow-wrap: anywhere; }
    .status {
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 0.64rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      white-space: nowrap;
    }
    .status.open { background: var(--coral-soft); color: var(--coral); }
    .status.resolved { background: var(--teal-soft); color: var(--teal); }
    .repeat {
      display: inline-block;
      margin-top: 4px;
      padding: 2px 6px;
      border-radius: 5px;
      background: #fff1ec;
      color: var(--coral);
      font-size: 0.62rem;
      font-weight: 700;
    }
    .meta { color: var(--muted); font-size: 0.7rem; white-space: nowrap; }
    .action { margin: 0; }
    .action button {
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      border-radius: 8px;
      padding: 7px 10px;
      font: inherit;
      font-size: 0.7rem;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    .action button:hover { background: var(--teal-soft); border-color: #b7e8e7; color: var(--teal); }
    .empty { padding: 56px 24px; text-align: center; color: var(--muted); }
    .empty strong { display: block; color: var(--ink); margin-bottom: 4px; font-size: 0.95rem; }
    .pager {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 16px;
      border-top: 1px solid var(--line);
      font-size: 0.72rem;
      color: var(--muted);
    }
    .pager a {
      text-decoration: none;
      border: 1px solid var(--line);
      background: #fff;
      padding: 6px 10px;
      border-radius: 8px;
      font-weight: 600;
    }
    .pager a[aria-disabled='true'] { opacity: 0.4; pointer-events: none; }
    .footnote { margin: 18px 2px 0; font-size: 0.68rem; color: #8496a8; }
    .auth {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .auth-card {
      width: min(420px, 100%);
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 28px;
      box-shadow: 0 24px 60px rgba(12, 27, 42, 0.12);
    }
    .auth-card .brand { margin-bottom: 22px; }
    .auth-card .brand strong { color: var(--ink); }
    .auth-card h1 { font-size: 1.35rem; letter-spacing: -0.03em; margin: 0 0 6px; }
    .auth-card p { margin: 0 0 18px; color: var(--muted); font-size: 0.8rem; }
    .auth-card label { display: block; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin-bottom: 6px; }
    .auth-card input {
      width: 100%;
      border: 1px solid var(--line);
      background: #fbfcfe;
      border-radius: 10px;
      padding: 11px 12px;
      font: inherit;
      font-size: 0.82rem;
      outline: none;
    }
    .auth-card input:focus { border-color: var(--teal); box-shadow: 0 0 0 3px rgba(14, 143, 150, 0.12); }
    .auth-card button {
      width: 100%;
      margin-top: 12px;
      border: 0;
      border-radius: 10px;
      padding: 11px 14px;
      background: linear-gradient(135deg, #19c6ca, #0b9aa1);
      color: #04252a;
      font: inherit;
      font-size: 0.82rem;
      font-weight: 800;
      cursor: pointer;
    }
    .auth-error {
      margin: 0 0 12px;
      padding: 9px 11px;
      border-radius: 8px;
      background: var(--coral-soft);
      color: var(--coral);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .auth-note { margin: 16px 0 0; font-size: 0.66rem; color: #8496a8; }
    @media (max-width: 760px) {
      .stats { grid-template-columns: 1fr 1fr; }
      .top { padding: 14px 16px; }
      .wrap { padding: 20px 14px 40px; }
    }
  </style>
</head>
<body>${body}</body>
</html>`
}

export function moderationLoginPage({ error = '' } = {}) {
  return layout({
    title: 'Sign in',
    body: `
  <div class="auth">
    <div class="auth-card">
      <div class="brand"><strong>riplika</strong><span>moderation</span></div>
      <h1>Moderation sign-in</h1>
      <p>Enter the token from the server's <code>MODERATION_TOKEN</code> environment variable.</p>
      ${error ? `<p class="auth-error">${escapeHtml(error)}</p>` : ''}
      <form method="post" action="/moderation/login">
        <label for="token">Access token</label>
        <input id="token" name="token" type="password" autocomplete="current-password" required autofocus>
        <button type="submit">Sign in</button>
      </form>
      <p class="auth-note">Sessions last 8 hours. This page is not linked from the app.</p>
    </div>
  </div>`,
  })
}

export function moderationNotConfiguredPage() {
  return layout({
    title: 'Not configured',
    body: `
  <div class="auth">
    <div class="auth-card">
      <div class="brand"><strong>riplika</strong><span>moderation</span></div>
      <h1>Moderation is not configured</h1>
      <p>Set a long random <code>MODERATION_TOKEN</code> on the server, then restart it.</p>
      <p><code>openssl rand -hex 32</code></p>
      <p class="auth-note">Example: <code>MODERATION_TOKEN=… npm start</code>. The dashboard stays disabled while the variable is empty.</p>
    </div>
  </div>`,
  })
}

export function moderationReportsPage({
  rows,
  total,
  page,
  pageSize,
  status,
  stats,
  retentionDays,
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const filters = [
    ['open', 'Open', stats.open],
    ['resolved', 'Reviewed', stats.total - stats.open],
    ['all', 'All', stats.total],
  ]
  const filterHtml = filters
    .map(
      ([value, label, count]) =>
        `<a class="${status === value ? 'active' : ''}" href="/moderation?status=${value}">${label} (${count})</a>`,
    )
    .join('')

  const rowsHtml =
    rows.length === 0
      ? `<tr><td colspan="7"><div class="empty"><strong>No reports here</strong>Nothing needs review in this view.</div></td></tr>`
      : rows
          .map((row) => {
            const reason = REASON_LABELS[row.reason] ?? 'Other'
            const reportedKey = row.reportedKey ? String(row.reportedKey) : ''
            const reporterKey = row.reporterKey ? String(row.reporterKey) : ''
            const shortReported = reportedKey ? `${reportedKey.slice(0, 8)}…` : '—'
            const shortReporter = reporterKey ? `${reporterKey.slice(0, 8)}…` : '—'
            const action =
              row.status === 'open'
                ? `<form class="action" method="post" action="/moderation/reports/${Number(row.id)}/resolve">
                    <input type="hidden" name="status" value="${escapeHtml(status)}">
                    <input type="hidden" name="page" value="${Number(page)}">
                    <button type="submit">Mark reviewed</button>
                  </form>`
                : `<form class="action" method="post" action="/moderation/reports/${Number(row.id)}/reopen">
                    <input type="hidden" name="status" value="${escapeHtml(status)}">
                    <input type="hidden" name="page" value="${Number(page)}">
                    <button type="submit">Reopen</button>
                  </form>`

            return `<tr>
              <td class="meta">${formatTime(row.createdAt)}<br><span>UTC</span></td>
              <td class="reason">${escapeHtml(reason)}<small>${escapeHtml(row.reason)}</small></td>
              <td class="details">${row.details ? escapeHtml(row.details) : '<span class="meta">No details</span>'}</td>
              <td>
                <code title="${escapeHtml(reportedKey)}">${escapeHtml(shortReported)}</code>
                <div class="meta">${escapeHtml(row.reportedId)}</div>
                ${
                  Number(row.reportCount) > 1
                    ? `<span class="repeat">${Number(row.reportCount)} reports against this key</span>`
                    : ''
                }
              </td>
              <td>
                <code title="${escapeHtml(reporterKey)}">${escapeHtml(shortReporter)}</code>
                <div class="meta">${escapeHtml(row.reporterId)}</div>
              </td>
              <td><span class="status ${row.status === 'open' ? 'open' : 'resolved'}">${row.status === 'open' ? 'Open' : 'Reviewed'}</span></td>
              <td>${action}</td>
            </tr>`
          })
          .join('')

  const prevHref = `/moderation?status=${status}&page=${Math.max(1, page - 1)}`
  const nextHref = `/moderation?status=${status}&page=${Math.min(pageCount, page + 1)}`

  return layout({
    title: 'Reports',
    body: `
  <header class="top">
    <div class="brand"><strong>riplika</strong><span>moderation</span></div>
    <form method="post" action="/moderation/logout"><button class="signout" type="submit">Sign out</button></form>
  </header>
  <main class="wrap">
    <section class="stats">
      <div class="stat alert"><strong>${stats.open}</strong><span>open reports</span></div>
      <div class="stat"><strong>${stats.total}</strong><span>all reports</span></div>
      <div class="stat"><strong>${stats.blocks}</strong><span>blocked pairs</span></div>
      <div class="stat"><strong>${stats.reportsToday}</strong><span>reports last 24h</span></div>
    </section>

    <div class="bar">
      <nav class="filters" aria-label="Filter reports">${filterHtml}</nav>
      <span class="count">${total} ${total === 1 ? 'report' : 'reports'} · page ${page} of ${pageCount}</span>
    </div>

    <section class="panel">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Received</th><th>Reason</th><th>Details</th><th>Reported key</th><th>Reporter key</th><th>Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div class="pager">
        <a href="${prevHref}" aria-disabled="${page <= 1}">← Previous</a>
        <span>Showing ${rows.length} of ${total}</span>
        <a href="${nextHref}" aria-disabled="${page >= pageCount}">Next →</a>
      </div>
    </section>

    <p class="footnote">
      Reports are stored in SQLite. Reviewed reports older than ${Number(retentionDays)} days are pruned automatically.
      Blocked pairs never expire. Treat report details as confidential user content.
    </p>
  </main>`,
  })
}
