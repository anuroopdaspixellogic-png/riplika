import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    reporter_id TEXT NOT NULL,
    reported_id TEXT NOT NULL,
    reporter_key TEXT,
    reported_key TEXT,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    reviewed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_reports_status_created
    ON reports (status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_reports_reported_key
    ON reports (reported_key);

  CREATE TABLE IF NOT EXISTS blocks (
    owner_key TEXT NOT NULL,
    blocked_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (owner_key, blocked_key)
  );
`

const REPORT_SELECT = `
  SELECT
    r.id,
    r.created_at AS createdAt,
    r.reporter_id AS reporterId,
    r.reported_id AS reportedId,
    r.reporter_key AS reporterKey,
    r.reported_key AS reportedKey,
    r.reason,
    r.details,
    r.status,
    r.reviewed_at AS reviewedAt,
    (SELECT COUNT(*) FROM reports x WHERE x.reported_key = r.reported_key) AS reportCount
  FROM reports r
`

/**
 * Small SQLite-backed store for moderation data.
 *
 * Blocks are cached in memory by the server for fast matchmaking checks, but
 * written here so they survive restarts. Reports are read directly by the
 * moderation dashboard.
 */
export function createStore(filePath = ':memory:') {
  const inMemory = filePath === ':memory:'
  if (!inMemory) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
  }

  const db = new DatabaseSync(filePath)
  db.exec(SCHEMA)

  const statements = {
    insertReport: db.prepare(`
      INSERT INTO reports
        (created_at, reporter_id, reported_id, reporter_key, reported_key, reason, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    block: db.prepare(`
      INSERT INTO blocks (owner_key, blocked_key, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(owner_key, blocked_key) DO NOTHING
    `),
    listBlocks: db.prepare(`SELECT owner_key AS ownerKey, blocked_key AS blockedKey FROM blocks`),
    listAll: db.prepare(`${REPORT_SELECT} ORDER BY r.id DESC LIMIT ? OFFSET ?`),
    listByStatus: db.prepare(`${REPORT_SELECT} WHERE r.status = ? ORDER BY r.id DESC LIMIT ? OFFSET ?`),
    countAll: db.prepare(`SELECT COUNT(*) AS count FROM reports`),
    countByStatus: db.prepare(`SELECT COUNT(*) AS count FROM reports WHERE status = ?`),
    resolve: db.prepare(`UPDATE reports SET status = 'resolved', reviewed_at = ? WHERE id = ?`),
    reopen: db.prepare(`UPDATE reports SET status = 'open', reviewed_at = NULL WHERE id = ?`),
    statsOpen: db.prepare(`SELECT COUNT(*) AS count FROM reports WHERE status = 'open'`),
    statsTotal: db.prepare(`SELECT COUNT(*) AS count FROM reports`),
    statsBlocks: db.prepare(`SELECT COUNT(*) AS count FROM blocks`),
    statsRecent: db.prepare(`SELECT COUNT(*) AS count FROM reports WHERE created_at >= ?`),
    prune: db.prepare(`DELETE FROM reports WHERE status = 'resolved' AND created_at < ?`),
    ping: db.prepare(`SELECT 1 AS ok`),
  }

  function reportCount(status) {
    if (status === 'open' || status === 'resolved') {
      return Number(statements.countByStatus.get(status).count)
    }
    return Number(statements.countAll.get().count)
  }

  return {
    loadBlocks() {
      return statements.listBlocks.all()
    },

    block(ownerKey, blockedKey) {
      statements.block.run(ownerKey, blockedKey, new Date().toISOString())
    },

    addReport({ reporterId, reportedId, reporterKey, reportedKey, reason, details }) {
      const result = statements.insertReport.run(
        new Date().toISOString(),
        reporterId,
        reportedId,
        reporterKey,
        reportedKey,
        reason,
        details,
      )
      return Number(result.lastInsertRowid)
    },

    listReports({ status = 'open', limit = 25, offset = 0 } = {}) {
      const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100)
      const safeOffset = Math.max(Number(offset) || 0, 0)
      const rows =
        status === 'open' || status === 'resolved'
          ? statements.listByStatus.all(status, safeLimit, safeOffset)
          : statements.listAll.all(safeLimit, safeOffset)
      return { rows, total: reportCount(status) }
    },

    resolveReport(id) {
      const result = statements.resolve.run(new Date().toISOString(), id)
      return Number(result.changes) > 0
    },

    reopenReport(id) {
      const result = statements.reopen.run(id)
      return Number(result.changes) > 0
    },

    reportStats() {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      return {
        open: Number(statements.statsOpen.get().count),
        total: Number(statements.statsTotal.get().count),
        blocks: Number(statements.statsBlocks.get().count),
        reportsToday: Number(statements.statsRecent.get(dayAgo).count),
      }
    },

    pruneReports(retentionDays) {
      if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
      return Number(statements.prune.run(cutoff).changes)
    },

    ping() {
      return Boolean(statements.ping.get()?.ok)
    },

    close() {
      db.close()
    },
  }
}
