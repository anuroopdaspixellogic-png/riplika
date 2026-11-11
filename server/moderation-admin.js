import crypto from 'node:crypto'
import express from 'express'
import { createRateLimiter } from './rate-limit.js'
import {
  moderationLoginPage,
  moderationNotConfiguredPage,
  moderationReportsPage,
} from './moderation-page.js'

const COOKIE_NAME = 'riplika_mod'
const SESSION_SECONDS = 8 * 60 * 60
const PAGE_SIZE = 25
const MODERATION_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) return false
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function parseCookies(header) {
  const cookies = {}
  if (typeof header !== 'string') return cookies
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const key = part.slice(0, index).trim()
    if (!key) continue
    const raw = part.slice(index + 1).trim()
    try {
      cookies[key] = decodeURIComponent(raw)
    } catch {
      cookies[key] = raw
    }
  }
  return cookies
}

function normalizeStatus(value) {
  return value === 'resolved' || value === 'all' ? value : 'open'
}

function normalizePage(value) {
  const page = Number.parseInt(String(value ?? '1'), 10)
  return Number.isInteger(page) && page > 0 ? page : 1
}

function isSecureRequest(req) {
  if (req.secure) return true
  const forwarded = req.headers['x-forwarded-proto']
  return typeof forwarded === 'string' && forwarded.split(',')[0].trim() === 'https'
}

function cookieHeader(req, value, maxAgeSeconds) {
  const secure = isSecureRequest(req) ? '; Secure' : ''
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/moderation; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`
}

/**
 * Token-protected moderation dashboard. Mounted before the static client so
 * /moderation never falls through to the single-page app.
 */
export function createModerationRouter({ store, token, getClientIp }) {
  const loginLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 10 })
  const router = express.Router()

  router.use(express.urlencoded({ extended: false, limit: '16kb' }))
  router.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', MODERATION_CSP)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    next()
  })

  function isAuthenticated(req) {
    if (!token) return false
    const cookie = parseCookies(req.headers.cookie)[COOKIE_NAME]
    return safeEqual(cookie, token)
  }

  function requireAuth(req, res, next) {
    if (!token) return res.status(503).type('html').send(moderationNotConfiguredPage())
    if (!isAuthenticated(req)) return res.redirect(303, '/moderation')
    next()
  }

  function backTo(req) {
    const status = normalizeStatus(req.body?.status)
    const page = normalizePage(req.body?.page)
    return `/moderation?status=${status}&page=${page}`
  }

  router.get('/', (req, res) => {
    if (!token) return res.status(503).type('html').send(moderationNotConfiguredPage())
    if (!isAuthenticated(req)) return res.status(401).type('html').send(moderationLoginPage())

    const status = normalizeStatus(req.query.status)
    let page = normalizePage(req.query.page)
    let result = store.listReports({
      status,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    })
    const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE))
    if (page > pageCount) {
      return res.redirect(303, `/moderation?status=${status}&page=${pageCount}`)
    }
    if (result.rows.length === 0 && result.total > 0 && page > 1) {
      page = pageCount
      result = store.listReports({ status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
    }

    res.type('html').send(
      moderationReportsPage({
        rows: result.rows,
        total: result.total,
        page,
        pageSize: PAGE_SIZE,
        status,
        stats: store.reportStats(),
        retentionDays: Number(process.env.REPORT_RETENTION_DAYS) || 90,
      }),
    )
  })

  router.post('/login', (req, res) => {
    if (!token) return res.status(503).type('html').send(moderationNotConfiguredPage())
    if (!loginLimiter.take(getClientIp(req))) {
      return res
        .status(429)
        .type('html')
        .send(moderationLoginPage({ error: 'Too many attempts. Wait a few minutes and try again.' }))
    }

    const submitted = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
    if (!safeEqual(submitted, token)) {
      return res.status(401).type('html').send(moderationLoginPage({ error: 'That token is not right.' }))
    }

    res.setHeader('Set-Cookie', cookieHeader(req, token, SESSION_SECONDS))
    res.redirect(303, '/moderation')
  })

  router.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', cookieHeader(req, '', 0))
    res.redirect(303, '/moderation')
  })

  router.post('/reports/:id/resolve', requireAuth, (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (Number.isInteger(id) && id > 0) store.resolveReport(id)
    res.redirect(303, backTo(req))
  })

  router.post('/reports/:id/reopen', requireAuth, (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (Number.isInteger(id) && id > 0) store.reopenReport(id)
    res.redirect(303, backTo(req))
  })

  return {
    router,
    stop() {
      loginLimiter.stop()
    },
  }
}
