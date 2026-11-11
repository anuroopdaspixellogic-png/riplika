/**
 * Persistence checks for the SQLite moderation store. Uses a temporary
 * database and needs no running server.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createStore } from '../server/store.js'

let passed = 0
let failed = 0

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'riplika-store-'))
const file = path.join(dir, 'test.sqlite')
const owner = 'owner-key-aaaaaaaa'
const blocked = 'blocked-key-bbbbbbbb'

const baseReport = {
  reporterId: 'abc12345',
  reportedId: 'def67890',
  reporterKey: owner,
  reportedKey: blocked,
  reason: 'harassment',
  details: 'persistence check',
}

try {
  console.log('Riplika store smoke test\n')

  let store = createStore(file)
  store.block(owner, blocked)
  const first = store.addReport(baseReport)
  const second = store.addReport({ ...baseReport, reporterId: 'fedcba98', reportedId: '0123abcd' })

  check('report returns an id', Number.isInteger(first) && first > 0)
  check('blocks are recorded', store.loadBlocks().length === 1)

  let open = store.listReports({ status: 'open' })
  check('open reports are listed', open.total === 2 && open.rows.length === 2)
  check('repeat reports are counted', Number(open.rows[0].reportCount) === 2)

  const stats = store.reportStats()
  check('stats include open reports', stats.open === 2)
  check('stats include blocks', stats.blocks === 1)

  check('report can be resolved', store.resolveReport(first))
  check('resolved report leaves the open queue', store.listReports({ status: 'open' }).total === 1)
  check('resolved filter finds it', store.listReports({ status: 'resolved' }).total === 1)
  check('report can be reopened', store.reopenReport(first))
  check('reopened report is open again', store.listReports({ status: 'open' }).total === 2)

  check('prune keeps recent reports', store.pruneReports(90) === 0)
  store.close()

  store = createStore(file)
  const restoredBlocks = store.loadBlocks()
  check(
    'blocks survive a restart',
    restoredBlocks.length === 1 &&
      restoredBlocks[0].ownerKey === owner &&
      restoredBlocks[0].blockedKey === blocked,
  )
  check('reports survive a restart', store.listReports({ status: 'all' }).total === 2)
  check('database ping works', store.ping())
  check('database still resolves reports', store.resolveReport(second))
  check(
    'reviewed state survives a restart',
    store.listReports({ status: 'open' }).total === 1 &&
      store.listReports({ status: 'resolved' }).total === 1,
  )
  store.close()
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
