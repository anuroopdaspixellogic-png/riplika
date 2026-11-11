import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import { isReportReason, maskProfanity } from './moderation.js'
import { createStore } from './store.js'
import { createRateLimiter } from './rate-limit.js'
import { createModerationRouter } from './moderation-admin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = positiveInt(process.env.PORT, 8787)
const MAX_MESSAGE_BYTES = 16 * 1024
const CHAT_WINDOW_MS = 3000
const CHAT_LIMIT = 6
const MESSAGE_WINDOW_MS = 5000
const MESSAGE_LIMIT = 80
const ACTION_WINDOW_MS = 30_000
const ACTION_LIMIT = 12
const REPORT_COOLDOWN_MS = 10_000
const REPORT_RETENTION_DAYS = positiveInt(process.env.REPORT_RETENTION_DAYS, 90)
const MAX_CONNECTIONS_PER_IP = positiveInt(process.env.MAX_CONNECTIONS_PER_IP, 8)
// When nobody real is waiting, pair with a clearly labelled demo bot so a
// single visitor can still try the chat. Set DEMO_PARTNER=0 to disable.
const DEMO_PARTNER_ENABLED = !/^(0|false|no)$/i.test(process.env.DEMO_PARTNER || '1')
const DEMO_WAIT_MS = positiveInt(process.env.DEMO_WAIT_SECONDS, 10) * 1000
const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || '')
const MODERATION_TOKEN = (process.env.MODERATION_TOKEN || '').trim()
const ALLOWED_ORIGINS =
  process.env.ALLOWED_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []

const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
const NATIVE_APP_ORIGINS = new Set(['https://localhost', 'capacitor://localhost'])

function isAllowedOrigin(origin) {
  if (!origin) return true
  if (NATIVE_APP_ORIGINS.has(origin) || LOCAL_ORIGIN.test(origin)) return true
  return ALLOWED_ORIGINS.includes(origin)
}

const app = express()
app.disable('x-powered-by')
if (TRUST_PROXY) app.set('trust proxy', 1)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=()')
  next()
})
// The Android/iOS app is bundled on https://localhost and calls the backend
// from a different origin, so it needs CORS. Browser builds on the same
// origin, and configured ALLOWED_ORIGINS, keep working unchanged.
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })

/** All sockets, including ones that have not joined yet. */
const clients = new Set()
/** Sockets waiting to be matched, oldest first. */
const queue = []
/** clientKey -> Set<clientKey> of people this person has blocked/reported. */
const blocks = new Map()
/** IP -> number of open WebSocket connections. */
const connectionsByIp = new Map()
/** clientKey -> timestamp of the last accepted report. */
const reportCooldowns = new Map()
/** Socket -> timer that will offer a demo partner if the queue stays empty. */
const demoTimers = new WeakMap()
/** Demo bot -> set of pending typing/chat timers. */
const demoReplies = new WeakMap()

const store = openStore()
for (const { ownerKey, blockedKey } of store.loadBlocks()) {
  if (!blocks.has(ownerKey)) blocks.set(ownerKey, new Set())
  blocks.get(ownerKey).add(blockedKey)
}

const apiLimiter = createRateLimiter({ windowMs: 60_000, max: 120 })
const connectionLimiter = createRateLimiter({ windowMs: 60_000, max: 30 })
const moderation = createModerationRouter({
  store,
  token: MODERATION_TOKEN,
  getClientIp: clientIp,
})
app.use('/moderation', moderation.router)

let dayKey = new Date().toISOString().slice(0, 10)
let chatsToday = 0
const startedAt = Date.now()

const stats = {
  online: 0,
  searching: 0,
  chatting: 0,
  chatsToday: 0,
}

const GENDERS = new Set(['woman', 'man', 'nonbinary', 'na'])
const LOOKING_FOR = new Set(['any', 'woman', 'man', 'nonbinary'])
const COUNTRY_CODE = /^[A-Z]{2}$/
const CLIENT_KEY = /^[A-Za-z0-9_-]{8,64}$/

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function resolveStorePath() {
  const raw = process.env.SQLITE_PATH
  if (!raw) return path.join(__dirname, '..', 'data', 'riplika.sqlite')
  if (raw === ':memory:') return raw
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
}

function openStore() {
  const file = resolveStorePath()
  try {
    if (file !== ':memory:') {
      fs.mkdirSync(path.dirname(file), { recursive: true })
    }
    const created = createStore(file)
    console.log(`Storage: SQLite at ${file}`)
    return created
  } catch (error) {
    console.error(`Could not open the moderation database at ${file}`)
    console.error(error)
    process.exit(1)
  }
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = req.headers['x-forwarded-for']
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim()
    }
  }
  return req.socket.remoteAddress || 'unknown'
}

function newId() {
  return crypto.randomBytes(4).toString('hex')
}

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

function normalizeProfile(raw) {
  const p = raw && typeof raw === 'object' ? raw : {}
  const nickname =
    typeof p.nickname === 'string'
      ? p.nickname.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24)
      : ''
  return {
    nickname,
    country: typeof p.country === 'string' && COUNTRY_CODE.test(p.country) ? p.country : 'US',
    gender: GENDERS.has(p.gender) ? p.gender : 'na',
    lookingFor: LOOKING_FOR.has(p.lookingFor) ? p.lookingFor : 'any',
    countryPref:
      typeof p.countryPref === 'string' && (p.countryPref === 'any' || COUNTRY_CODE.test(p.countryPref))
        ? p.countryPref
        : 'any',
  }
}

function publicProfile(state) {
  return {
    nickname: state.profile.nickname || 'Stranger',
    country: state.profile.country,
    gender: state.profile.gender,
    ...(state.demo ? { demo: true } : {}),
  }
}

function bumpChatsToday() {
  const key = new Date().toISOString().slice(0, 10)
  if (key !== dayKey) {
    dayKey = key
    chatsToday = 0
  }
  chatsToday += 1
}

function recomputeStats() {
  let online = 0
  let searching = 0
  let paired = 0
  for (const ws of clients) {
    if (!ws.state.joined || ws.readyState !== WebSocket.OPEN) continue
    online += 1
    if (ws.state.searching) searching += 1
    if (ws.state.partner) paired += 1
  }
  stats.online = online
  stats.searching = searching
  stats.chatting = Math.floor(paired / 2)
  stats.chatsToday = chatsToday
}

function broadcastStats() {
  recomputeStats()
  for (const ws of clients) {
    if (ws.state?.joined) send(ws, { type: 'stats', ...stats })
  }
}

function leaveQueue(ws) {
  const index = queue.indexOf(ws)
  if (index !== -1) queue.splice(index, 1)
  ws.state.searching = false
  clearDemoTimer(ws)
}

function clearDemoTimer(ws) {
  const timer = demoTimers.get(ws)
  if (timer) {
    clearTimeout(timer)
    demoTimers.delete(ws)
  }
}

function clearDemoReplies(bot) {
  const timers = demoReplies.get(bot)
  if (timers) {
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    demoReplies.delete(bot)
  }
  bot.state.replyPending = false
}

function trackDemoReply(bot, timer) {
  if (typeof timer.unref === 'function') timer.unref()
  if (!demoReplies.has(bot)) demoReplies.set(bot, new Set())
  demoReplies.get(bot).add(timer)
}

const DEMO_GREETING =
  "Hi! I'm Riplika's demo partner 🤖 — a bot, so there's no camera. Type anything and I'll reply. Real people are always matched first."

const DEMO_REPLIES = [
  "Hey! 👋 I'm a demo bot, here so you can try the chat solo. Click Next whenever you want to look for a real person.",
  "This text chat is the real thing — only the partner is simulated. Try Next, Report or Stop to see how they work.",
  'Good one 😄 I can’t video chat, but real visitors are always matched with each other first.',
  'You can change your gender and country preferences before starting a new search.',
]

function createDemoPartner(user) {
  const userProfile = user.state.profile
  return {
    readyState: WebSocket.OPEN,
    state: {
      id: `demo-${newId()}`,
      key: '',
      demo: true,
      joined: true,
      profile: {
        nickname: 'Demo Partner',
        country: userProfile.countryPref === 'any' ? 'GB' : userProfile.countryPref,
        gender: userProfile.lookingFor === 'any' ? 'na' : userProfile.lookingFor,
        lookingFor: 'any',
        countryPref: 'any',
      },
      partner: null,
      searching: false,
      queuedAt: 0,
      connectedAt: 0,
      recent: new Set(),
      lastChat: [],
      messageTimes: [],
      actionTimes: [],
      abuseStrikes: 0,
      media: { cam: false, mic: false },
      replyPending: false,
    },
    // Anything the server addresses to the bot is intentionally ignored.
    send() {},
  }
}

function scheduleDemoGreeting(user, bot) {
  bot.state.replyPending = true
  const typing = setTimeout(() => {
    if (user.state.partner !== bot) {
      bot.state.replyPending = false
      return
    }
    send(user, { type: 'typing', on: true })
    const greeting = setTimeout(() => {
      if (user.state.partner !== bot) {
        bot.state.replyPending = false
        return
      }
      send(user, { type: 'typing', on: false })
      send(user, { type: 'chat', from: 'them', text: DEMO_GREETING, ts: Date.now() })
      bot.state.replyPending = false
    }, 900)
    trackDemoReply(bot, greeting)
  }, 700)
  trackDemoReply(bot, typing)
}

function queueDemoReply(user, bot, incomingText) {
  if (bot.state.replyPending) return
  bot.state.replyPending = true

  const text = incomingText.toLowerCase()
  const reply = /\b(hi|hello|hey)\b/.test(text)
    ? "Hey! 👋 Nice to meet you. I'm a demo bot, so there's no video — but the chat is real. Try Next whenever you like."
    : DEMO_REPLIES[Math.floor(Math.random() * DEMO_REPLIES.length)]

  const typing = setTimeout(() => {
    if (user.state.partner !== bot) {
      bot.state.replyPending = false
      return
    }
    send(user, { type: 'typing', on: true })
    const message = setTimeout(() => {
      if (user.state.partner !== bot) {
        bot.state.replyPending = false
        return
      }
      send(user, { type: 'typing', on: false })
      send(user, { type: 'chat', from: 'them', text: reply, ts: Date.now() })
      bot.state.replyPending = false
    }, 1100)
    trackDemoReply(bot, message)
  }, 500)
  trackDemoReply(bot, typing)
}

function scheduleDemoPartner(ws) {
  if (!DEMO_PARTNER_ENABLED) return
  clearDemoTimer(ws)
  const timer = setTimeout(() => {
    demoTimers.delete(ws)
    if (!ws.state.joined || ws.state.partner || !ws.state.searching) return
    if (ws.readyState !== WebSocket.OPEN) return
    // A real visitor may have joined in the meantime; always prefer them.
    const waiting = pickPartner(ws)
    if (waiting) {
      pair(ws, waiting)
      return
    }
    const bot = createDemoPartner(ws)
    pair(ws, bot)
    // Make the UI show the bot as off camera straight away.
    send(ws, { type: 'media', media: { cam: false, mic: false } })
    scheduleDemoGreeting(ws, bot)
  }, DEMO_WAIT_MS)
  if (typeof timer.unref === 'function') timer.unref()
  demoTimers.set(ws, timer)
}

function isBlocked(a, b) {
  if (!a.state.key || !b.state.key) return false
  return Boolean(blocks.get(a.state.key)?.has(b.state.key) || blocks.get(b.state.key)?.has(a.state.key))
}

function rememberBlock(ownerKey, blockedKey) {
  if (!ownerKey || !blockedKey) return
  if (!blocks.has(ownerKey)) blocks.set(ownerKey, new Set())
  blocks.get(ownerKey).add(blockedKey)
  try {
    store.block(ownerKey, blockedKey)
  } catch (error) {
    console.error('[store] could not persist block', error)
  }
}

function compatible(a, b) {
  if (a === b) return false
  if (!a.state.joined || !b.state.joined) return false
  if (a.readyState !== WebSocket.OPEN || b.readyState !== WebSocket.OPEN) return false
  if (a.state.partner || b.state.partner) return false
  if (isBlocked(a, b)) return false

  const profileA = a.state.profile
  const profileB = b.state.profile

  if (profileA.countryPref !== 'any' && profileA.countryPref !== profileB.country) return false
  if (profileB.countryPref !== 'any' && profileB.countryPref !== profileA.country) return false

  if (profileA.lookingFor !== 'any' && profileA.lookingFor !== profileB.gender) return false
  if (profileB.lookingFor !== 'any' && profileB.lookingFor !== profileA.gender) return false

  return true
}

function pickPartner(ws) {
  let fallback = null
  for (const candidate of queue) {
    if (candidate === ws || !compatible(ws, candidate)) continue
    if (!ws.state.recent.has(candidate.state.id)) return candidate
    if (!fallback) fallback = candidate
  }
  return fallback
}

function remember(ws, partnerWs) {
  ws.state.recent.add(partnerWs.state.id)
  if (ws.state.recent.size > 6) {
    ws.state.recent.delete(ws.state.recent.values().next().value)
  }
}

function endPair(ws, { notify = true, reason = 'left' } = {}) {
  const partner = ws.state.partner
  if (!partner) return
  if (partner.state.demo) clearDemoReplies(partner)
  if (ws.state.demo) clearDemoReplies(ws)
  ws.state.partner = null
  partner.state.partner = null
  if (notify) send(partner, { type: 'partner-left', reason })
}

function pair(a, b) {
  leaveQueue(a)
  leaveQueue(b)
  a.state.partner = b
  b.state.partner = a
  a.state.connectedAt = Date.now()
  b.state.connectedAt = Date.now()
  remember(a, b)
  remember(b, a)
  if (!a.state.demo && !b.state.demo) bumpChatsToday()

  const roomId = `room_${newId()}`
  const aInitiated = a.state.queuedAt <= b.state.queuedAt

  send(a, { type: 'matched', roomId, initiator: aInitiated, partner: publicProfile(b.state) })
  send(b, { type: 'matched', roomId, initiator: !aInitiated, partner: publicProfile(a.state) })
  broadcastStats()
}

function startSearching(ws) {
  if (!ws.state.joined) return
  if (ws.state.partner) endPair(ws, { reason: 'left' })
  leaveQueue(ws)

  ws.state.searching = true
  ws.state.queuedAt = Date.now()

  const partner = pickPartner(ws)
  if (partner) {
    pair(ws, partner)
    return
  }

  queue.push(ws)
  send(ws, { type: 'queued' })
  scheduleDemoPartner(ws)
  broadcastStats()
}

function stopSearching(ws) {
  leaveQueue(ws)
  if (ws.state.partner) endPair(ws, { reason: 'left' })
  ws.state.searching = false
  send(ws, { type: 'stopped' })
  broadcastStats()
}

function handleReport(ws, msg) {
  const partner = ws.state.partner
  if (!partner) return

  if (partner.state.demo) {
    send(ws, { type: 'reported' })
    endPair(ws, { reason: 'left' })
    broadcastStats()
    return
  }

  if (!ws.state.key || !partner.state.key) return

  const now = Date.now()
  const lastReport = reportCooldowns.get(ws.state.key) ?? 0
  if (now - lastReport < REPORT_COOLDOWN_MS) {
    send(ws, { type: 'error', message: 'You just sent a report. Give it a moment before reporting again.' })
    return
  }
  reportCooldowns.set(ws.state.key, now)

  const reason = isReportReason(msg.reason) ? msg.reason : 'other'
  const details =
    typeof msg.details === 'string'
      ? msg.details.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 300)
      : ''

  let reportId = null
  try {
    reportId = store.addReport({
      reporterId: ws.state.id,
      reportedId: partner.state.id,
      reporterKey: ws.state.key,
      reportedKey: partner.state.key,
      reason,
      details,
    })
  } catch (error) {
    console.error('[store] could not persist report', error)
  }

  rememberBlock(ws.state.key, partner.state.key)

  console.warn(
    `[report]${reportId ? ` #${reportId}` : ''} ${ws.state.id} reported ${partner.state.id} — reason=${reason}`,
  )

  send(ws, { type: 'reported' })
  endPair(ws, { reason: 'left' })
  broadcastStats()
}

function allowMatchAction(state) {
  const now = Date.now()
  state.actionTimes = state.actionTimes.filter((time) => now - time < ACTION_WINDOW_MS)
  if (state.actionTimes.length >= ACTION_LIMIT) return false
  state.actionTimes.push(now)
  return true
}

function overMessageLimit(state) {
  const now = Date.now()
  state.messageTimes = state.messageTimes.filter((time) => now - time < MESSAGE_WINDOW_MS)
  if (state.messageTimes.length >= MESSAGE_LIMIT) {
    state.abuseStrikes += 1
    return true
  }
  state.messageTimes.push(now)
  return false
}

function handleMessage(ws, raw) {
  if (overMessageLimit(ws.state)) {
    if (ws.state.abuseStrikes === 1 || ws.state.abuseStrikes === 3) {
      send(ws, { type: 'error', message: 'Slow down a little.' })
    }
    if (ws.state.abuseStrikes >= 5) {
      try {
        ws.close(1008, 'Too many messages')
      } catch {
        // ignore
      }
    }
    return
  }
  if (raw.length > MAX_MESSAGE_BYTES) return

  let msg
  try {
    msg = JSON.parse(raw.toString())
  } catch {
    return
  }
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return

  const state = ws.state

  switch (msg.type) {
    case 'join': {
      if (state.joined) return
      const clientKey =
        typeof msg.clientKey === 'string' && CLIENT_KEY.test(msg.clientKey)
          ? msg.clientKey
          : crypto.randomUUID()
      state.key = clientKey
      state.profile = normalizeProfile(msg.profile)
      state.joined = true
      recomputeStats()
      send(ws, {
        type: 'welcome',
        id: state.id,
        ...stats,
        demoWaitSeconds: DEMO_PARTNER_ENABLED ? Math.round(DEMO_WAIT_MS / 1000) : 0,
      })
      broadcastStats()
      return
    }

    case 'find': {
      if (!state.joined) return
      if (!allowMatchAction(state)) {
        send(ws, { type: 'error', message: 'You are moving too fast. Take a breath and try again in a moment.' })
        return
      }
      startSearching(ws)
      return
    }

    case 'next': {
      if (!state.joined) return
      if (!allowMatchAction(state)) {
        send(ws, { type: 'error', message: 'You are moving too fast. Take a breath and try again in a moment.' })
        return
      }
      if (state.partner) endPair(ws, { reason: 'left' })
      startSearching(ws)
      return
    }

    case 'stop': {
      if (!state.joined) return
      stopSearching(ws)
      return
    }

    case 'cancel': {
      if (!state.joined) return
      leaveQueue(ws)
      send(ws, { type: 'queued-cancelled' })
      broadcastStats()
      return
    }

    case 'signal': {
      if (!state.partner || !msg.data || typeof msg.data !== 'object') return
      send(state.partner, { type: 'signal', data: msg.data })
      return
    }

    case 'chat': {
      if (!state.partner || typeof msg.text !== 'string') return
      const now = Date.now()
      state.lastChat = state.lastChat.filter((ts) => now - ts < CHAT_WINDOW_MS)
      if (state.lastChat.length >= CHAT_LIMIT) {
        send(ws, { type: 'error', message: 'Slow down a little — that is a lot of messages.' })
        return
      }
      state.lastChat.push(now)

      const text = maskProfanity(msg.text)
      if (!text) return

      send(ws, { type: 'chat', from: 'me', text, ts: now })
      send(state.partner, { type: 'chat', from: 'them', text, ts: now })
      if (state.partner.state.demo) queueDemoReply(ws, state.partner, text)
      return
    }

    case 'typing': {
      if (!state.partner) return
      send(state.partner, { type: 'typing', on: Boolean(msg.on) })
      return
    }

    case 'media': {
      state.media = { cam: Boolean(msg.cam), mic: Boolean(msg.mic) }
      if (state.partner) {
        send(state.partner, { type: 'media', media: state.media })
      }
      return
    }

    case 'report': {
      handleReport(ws, msg)
      return
    }

    case 'ping': {
      send(ws, { type: 'pong', ts: Date.now() })
      return
    }

    default:
      return
  }
}

wss.on('connection', (ws, req) => {
  const ip = clientIp(req)
  connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1)

  const state = {
    id: newId(),
    key: null,
    joined: false,
    profile: null,
    partner: null,
    searching: false,
    queuedAt: 0,
    connectedAt: 0,
    recent: new Set(),
    lastChat: [],
    messageTimes: [],
    actionTimes: [],
    abuseStrikes: 0,
    media: { cam: true, mic: true },
  }

  ws.state = state
  ws.isAlive = true
  clients.add(ws)

  ws.on('pong', () => {
    ws.isAlive = true
  })

  ws.on('message', (raw) => {
    ws.isAlive = true
    handleMessage(ws, raw)
  })

  ws.on('error', () => {})

  ws.on('close', () => {
    leaveQueue(ws)
    if (state.partner) {
      endPair(ws, { reason: 'left' })
    }
    state.joined = false
    clients.delete(ws)

    const remaining = (connectionsByIp.get(ip) ?? 1) - 1
    if (remaining <= 0) connectionsByIp.delete(ip)
    else connectionsByIp.set(ip, remaining)

    broadcastStats()
  })
})

function rejectUpgrade(socket, message) {
  socket.end(
    `HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`,
  )
}

server.on('upgrade', (req, socket, head) => {
  let pathname = '/'
  try {
    pathname = new URL(req.url || '/', 'http://localhost').pathname
  } catch {
    socket.destroy()
    return
  }

  if (pathname !== '/ws') {
    socket.destroy()
    return
  }

  const origin = req.headers.origin
  if (origin && !isAllowedOrigin(origin)) {
    socket.destroy()
    return
  }

  const ip = clientIp(req)
  if (!connectionLimiter.take(ip) || (connectionsByIp.get(ip) ?? 0) >= MAX_CONNECTIONS_PER_IP) {
    rejectUpgrade(socket, 'Too many connections from this address. Try again in a minute.')
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!apiLimiter.take(clientIp(req))) {
    res.status(429).json({ error: 'Too many requests' })
    return
  }
  next()
})

app.get('/api/health', (_req, res) => {
  recomputeStats()
  try {
    if (!store.ping()) throw new Error('Database did not respond')
    res.json({ ok: true, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) })
  } catch {
    res.status(503).json({ ok: false })
  }
})

app.get('/api/stats', (_req, res) => {
  recomputeStats()
  res.json(stats)
})

// Runtime client configuration. TURN credentials are read from the
// environment so they can be rotated or replaced without rebuilding the
// client, which matters for the Android app where the bundle is baked in.
app.get('/api/config', (_req, res) => {
  const turnUrl = (process.env.TURN_URL || '').trim()
  const turn = turnUrl
    ? {
        url: turnUrl,
        username: (process.env.TURN_USERNAME || '').trim() || undefined,
        credential: (process.env.TURN_CREDENTIAL || '').trim() || undefined,
      }
    : null
  res.json({ turn })
})

// Serve the built client in production. In development Vite serves the app and proxies here.
const distDir = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(
    '/assets',
    express.static(path.join(distDir, 'assets'), { index: false, maxAge: '1y', immutable: true }),
  )
  app.use(express.static(distDir, { index: false, maxAge: '1h' }))
  app.use((req, res, next) => {
    if (
      (req.method !== 'GET' && req.method !== 'HEAD') ||
      req.path.startsWith('/api') ||
      req.path.startsWith('/moderation')
    ) {
      return next()
    }
    res.setHeader('Content-Security-Policy', APP_CSP)
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Heartbeat + periodic stats. Drops dead sockets so matchmaking stays healthy.
const heartbeat = setInterval(() => {
  for (const ws of clients) {
    if (ws.isAlive === false) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    try {
      ws.ping()
    } catch {
      // ignore
    }
  }

  const cutoff = Date.now() - 10 * 60_000
  for (const [key, timestamp] of reportCooldowns) {
    if (timestamp < cutoff) reportCooldowns.delete(key)
  }

  broadcastStats()
}, 10_000)

function pruneReports() {
  try {
    const pruned = store.pruneReports(REPORT_RETENTION_DAYS)
    if (pruned > 0) {
      console.log(`[moderation] pruned ${pruned} reviewed reports older than ${REPORT_RETENTION_DAYS} days`)
    }
  } catch (error) {
    console.error('[moderation] could not prune reports', error)
  }
}

pruneReports()
const pruneTimer = setInterval(pruneReports, 24 * 60 * 60 * 1000)
pruneTimer.unref()

let storeClosed = false
function closeStore() {
  if (storeClosed) return
  storeClosed = true
  try {
    store.close()
  } catch {
    // ignore
  }
}

function shutdown() {
  clearInterval(heartbeat)
  clearInterval(pruneTimer)
  apiLimiter.stop()
  connectionLimiter.stop()
  moderation.stop()
  for (const ws of clients) {
    try {
      ws.close(1001, 'Server shutting down')
    } catch {
      // ignore
    }
  }
  server.close(() => {
    closeStore()
    process.exit(0)
  })
  setTimeout(() => {
    closeStore()
    process.exit(0)
  }, 2500).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

server.listen(PORT, () => {
  console.log(`Riplika server listening on http://localhost:${PORT}`)
  console.log(`WebSocket signaling at ws://localhost:${PORT}/ws`)
  console.log(
    MODERATION_TOKEN
      ? `Moderation: http://localhost:${PORT}/moderation`
      : 'Moderation: disabled (set MODERATION_TOKEN to enable /moderation)',
  )
  if (MODERATION_TOKEN && MODERATION_TOKEN.length < 16) {
    console.warn('[moderation] MODERATION_TOKEN is short — use at least 32 random characters.')
  }
})
