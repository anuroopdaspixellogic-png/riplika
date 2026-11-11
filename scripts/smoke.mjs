/**
 * End-to-end smoke test for the matchmaking + signaling server.
 *
 *   npm run dev          # in one terminal
 *   npm run smoke        # in another
 *
 * Exercises matching, mutual filters, SDP relay, chat relay, profanity
 * masking, reports, blocks and re-queueing.
 */
import { WebSocket } from 'ws'

const URL = process.env.WS_URL || 'ws://localhost:8787/ws'
const RUN = Date.now().toString(36)

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

function makeClient(name) {
  const ws = new WebSocket(URL)
  const received = []
  const waiters = []

  ws.on('message', (raw) => {
    const message = JSON.parse(String(raw))
    received.push(message)
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      if (waiters[index].predicate(message)) {
        const waiter = waiters.splice(index, 1)[0]
        clearTimeout(waiter.timer)
        waiter.resolve(message)
      }
    }
  })

  function waitFor(predicate, label, timeout = 2500) {
    const existing = received.find(predicate)
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          const index = waiters.indexOf(waiter)
          if (index !== -1) waiters.splice(index, 1)
          reject(new Error(`${name}: timed out waiting for ${label}`))
        }, timeout),
      }
      waiters.push(waiter)
    })
  }

  return {
    name,
    ws,
    received,
    waitFor,
    send: (message) => ws.send(JSON.stringify(message)),
    open: () =>
      new Promise((resolve, reject) => {
        ws.once('open', resolve)
        ws.once('error', reject)
      }),
    close: () => ws.close(),
    last: (type) => [...received].reverse().find((message) => message.type === type),
  }
}

function join(client, profile, key) {
  client.send({
    type: 'join',
    clientKey: key,
    profile: {
      nickname: client.name,
      country: 'US',
      gender: 'na',
      lookingFor: 'any',
      countryPref: 'any',
      ...profile,
    },
  })
  return client.waitFor((message) => message.type === 'welcome', 'welcome')
}

function waitType(client, type, label = type) {
  return client.waitFor((message) => message.type === type, label)
}

async function main() {
  console.log('Riplika server smoke test\n')

  const a = makeClient('Ava', {})
  const b = makeClient('Ben', {})

  await Promise.all([a.open(), b.open()])
  const [welcomeA, welcomeB] = await Promise.all([
    join(a, { gender: 'woman', lookingFor: 'man' }, `smoke-ava-${RUN}`),
    join(b, { country: 'CA', gender: 'man', lookingFor: 'woman' }, `smoke-ben-${RUN}`),
  ])
  check('both clients receive welcome', Boolean(welcomeA.id && welcomeB.id))
  await a.waitFor(
    (message) => message.type === 'stats' && message.online >= 2,
    'stats reflecting two clients',
  )
  check('live stats count both clients', Boolean(a.last('stats') && a.last('stats').online >= 2))

  a.send({ type: 'find' })
  await waitType(a, 'queued', 'A queued')
  check('first searcher is queued', Boolean(a.last('queued')))

  b.send({ type: 'find' })
  const [matchA, matchB] = await Promise.all([waitType(a, 'matched'), waitType(b, 'matched')])
  check('both clients receive a match', Boolean(matchA.roomId && matchB.roomId))
  check('room ids agree', matchA.roomId === matchB.roomId)
  check('only one side is the initiator', matchA.initiator !== matchB.initiator)
  check('partner profile relayed', matchA.partner.nickname === 'Ben' && matchB.partner.nickname === 'Ava')
  check('mutual gender filters honored', matchA.partner.gender === 'man' && matchB.partner.gender === 'woman')

  a.send({ type: 'signal', data: { kind: 'offer', sdp: { type: 'offer', sdp: 'v=0 fake' } } })
  const relayed = await waitType(b, 'signal', 'offer relay')
  check('signaling offer is relayed', relayed.data.sdp.sdp === 'v=0 fake')

  a.send({ type: 'chat', text: 'hello there you fucking idiot' })
  const [echo, delivered] = await Promise.all([
    waitType(a, 'chat', 'chat echo'),
    waitType(b, 'chat', 'chat delivery'),
  ])
  check('chat echoes to sender as me', echo.from === 'me' && echo.text.includes('hello'))
  check('chat delivers to partner as them', delivered.from === 'them')
  check('profanity is masked', !delivered.text.includes('fucking') && delivered.text.includes('f***'))

  b.send({ type: 'typing', on: true })
  const typing = await waitType(a, 'typing', 'typing relay')
  check('typing indicator relays', typing.on === true)

  b.send({ type: 'report', reason: 'harassment', details: 'smoke test' })
  const [reportReceipt, partnerLeft] = await Promise.all([
    waitType(b, 'reported', 'report receipt'),
    waitType(a, 'partner-left', 'partner left'),
  ])
  check('reporter receives confirmation', reportReceipt.type === 'reported')
  check('reported partner sees the chat end', partnerLeft.type === 'partner-left')

  b.send({ type: 'find' })
  await waitType(b, 'queued', 'B requeued')
  const c = makeClient('Cleo')
  await c.open()
  await join(c, { country: 'GB', gender: 'woman', lookingFor: 'any' }, `smoke-cleo-${RUN}`)
  c.send({ type: 'find' })
  const [matchB2, matchC] = await Promise.all([waitType(b, 'matched'), waitType(c, 'matched', 'C matched')])
  check('reported user can meet someone new', Boolean(matchB2.roomId && matchC.roomId))
  check('blocked pair is not rematched immediately', matchC.partner.nickname === 'Ben')

  c.send({ type: 'stop' })
  const stopped = await waitType(b, 'partner-left', 'B informed of stop')
  check('stop ends the partner call', stopped.type === 'partner-left')

  // Mutual country filters: a Japan-only client should not match a Canada-only client.
  const d = makeClient('Dana')
  const e = makeClient('Eli')
  await Promise.all([d.open(), e.open()])
  await Promise.all([
    join(d, { country: 'US', countryPref: 'JP' }, `smoke-dana-${RUN}`),
    join(e, { country: 'CA', countryPref: 'CA' }, `smoke-eli-${RUN}`),
  ])
  d.send({ type: 'find' })
  e.send({ type: 'find' })
  await new Promise((resolve) => setTimeout(resolve, 400))
  check('incompatible country filters stay unmatched', !d.last('matched') && !e.last('matched'))

  // Matchmaking churn: 13 quick find calls should trip the 12/30s action limit.
  const f = makeClient('Finn')
  await f.open()
  await join(f, { country: 'US', countryPref: 'JP' }, `smoke-finn-${RUN}`)
  for (let index = 0; index < 13; index += 1) f.send({ type: 'find' })
  const actionLimited = await waitType(f, 'error', 'action limit')
  check('find spam is rate limited', actionLimited.message.includes('moving too fast'))

  // Chat flood: the 7th message inside 3s should be rejected.
  const g = makeClient('Gia')
  const h = makeClient('Hugo')
  await Promise.all([g.open(), h.open()])
  await Promise.all([join(g, {}, `smoke-gia-${RUN}`), join(h, {}, `smoke-hugo-${RUN}`)])
  g.send({ type: 'find' })
  h.send({ type: 'find' })
  await Promise.all([waitType(g, 'matched'), waitType(h, 'matched')])
  for (let index = 0; index < 7; index += 1) g.send({ type: 'chat', text: `flood ${index}` })
  const chatLimited = await waitType(g, 'error', 'chat limit')
  check('chat spam is rate limited', chatLimited.message.includes('Slow down'))

  for (const client of [a, b, c, d, e, f, g, h]) client.close()
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(`\nSmoke test crashed: ${error.message}`)
  process.exit(1)
})
