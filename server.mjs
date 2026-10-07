// CorgiPay: a tiny invoicing API + live billing dashboard. Zero dependencies. `node server.mjs` (PORT, default 8080).
// On an unhandled error it opens a live support room for the caller's agent (ROOM_SERVER_URL + ROOM_SERVICE_KEY)
// and puts the link in the 500 body, so an AI agent that hits a bug can talk to our support agent with no setup.
import http from 'node:http'
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createInvoice, listInvoices, ApiError, API_VERSION } from './invoices.mjs'
import { dashboardHtml } from './dashboard.mjs'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 8080)
const ROOM_SERVER_URL = (process.env.ROOM_SERVER_URL ?? '').replace(/\/$/, '')
const ROOM_SERVICE_KEY = process.env.ROOM_SERVICE_KEY ?? ''
const SHA = (() => { try { return execSync('git rev-parse HEAD', { cwd: HERE, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return process.env.GIT_SHA ?? 'unknown' } })()
const STARTED = new Date().toISOString()
const LOKI_URL = process.env.LOKI_URL ?? ''

// Structured logs: one JSON line per request to stdout, plus fire-and-forget batches to Loki every 1s.
// Never blocks a request; if Loki is down the batch is dropped.
const lokiQueue = [] // { level, ts (ns string), line }
function log(level, fields) {
  const rec = { ts: new Date().toISOString(), level, app: 'corgipay', ...fields }
  const line = JSON.stringify(rec)
  ;(level === 'error' ? console.error : console.log)(line)
  if (LOKI_URL) { lokiQueue.push({ level, ts: String(BigInt(Date.now()) * 1000000n + BigInt(lokiQueue.length % 1000000)), line }); if (lokiQueue.length > 5000) lokiQueue.splice(0, lokiQueue.length - 5000) }
}
if (LOKI_URL) setInterval(() => {
  if (!lokiQueue.length) return
  const batch = lokiQueue.splice(0)
  const byLevel = {}
  for (const e of batch) (byLevel[e.level] ??= []).push([e.ts, e.line])
  const streams = Object.entries(byLevel).map(([level, values]) => ({ stream: { app: 'corgipay', level }, values }))
  fetch(LOKI_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ streams }), signal: AbortSignal.timeout(3000) })
    .then((r) => { if (!r.ok) console.error(`loki push: HTTP ${r.status}`) }).catch((e) => console.error(`loki push: ${e.message}`))
}, 1000).unref()
const keyId = (req) => { const k = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''); return k ? k.slice(-4) : null }
// Last few 500s, shown on the dashboard. Persisted to data/incidents.json so a failed request survives the
// fix deploy's restart and the dashboard can flip it from "Failed" to "Recovered" once the retry lands.
const INCIDENTS_FILE = path.join(HERE, 'data', 'incidents.json')
const incidents = (() => { try { const a = JSON.parse(readFileSync(INCIDENTS_FILE, 'utf8')); return Array.isArray(a) ? a.slice(0, 5) : [] } catch { return [] } })()
function saveIncidents() { try { mkdirSync(path.dirname(INCIDENTS_FILE), { recursive: true }); writeFileSync(INCIDENTS_FILE, JSON.stringify(incidents, null, 2)) } catch (e) { console.error(`incidents save: ${e.message}`) } }
// A non-secret summary of what the caller asked for, so the dashboard can match the failure to its successful retry.
function requestSummary(body) {
  try {
    if (!body || typeof body !== 'object') return null
    const items = Array.isArray(body.line_items) ? body.line_items : []
    return {
      customer_name: String(body.customer_name ?? '').slice(0, 120),
      customer_email: String(body.customer_email ?? '').slice(0, 200),
      currency: String(body.currency ?? 'usd').toLowerCase().slice(0, 8),
      amount_cents: items.reduce((a, li) => a + (typeof li?.amount === 'number' && Number.isFinite(li.amount) ? Math.round(li.amount * 100) : 0), 0),
      line_items: items.length,
    }
  } catch { return null }
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', ...headers })
  res.end(JSON.stringify(body, null, 2) + '\n')
}

async function readJson(req) {
  let raw = ''
  for await (const c of req) { raw += c; if (raw.length > 100_000) throw new ApiError(413, 'payload_too_large', 'Body too large.') }
  if (!raw) return null
  try { return JSON.parse(raw) } catch { throw new ApiError(400, 'invalid_json', 'Body is not valid JSON.') }
}

// Never forward secrets: keep only safe headers, redact the key.
function sanitize(req, body) {
  const keep = ['content-type', 'corgipay-version', 'user-agent']
  const headers = Object.fromEntries(keep.filter((h) => req.headers[h]).map((h) => [h, req.headers[h]]))
  if (req.headers.authorization) headers.authorization = String(req.headers.authorization).replace(/(sk_(test|live)_).+/, '$1****')
  return { method: req.method, path: req.url, headers, body }
}

async function openSupportRoom({ requestId, endpoint, method, request }) {
  if (!ROOM_SERVER_URL || !ROOM_SERVICE_KEY) return null
  try {
    const r = await fetch(`${ROOM_SERVER_URL}/v1/support-rooms`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ROOM_SERVICE_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, endpoint, method, request, api_sha: SHA }),
      signal: AbortSignal.timeout(4000),
    })
    if (!r.ok) { console.error(`support room: HTTP ${r.status}`); return null }
    return (await r.json()).room_url ?? null
  } catch (e) { console.error(`support room: ${e.message}`); return null }
}

http.createServer(async (req, res) => {
  const requestId = `req_${randomBytes(8).toString('hex')}`
  const url = new URL(req.url, 'http://x')
  const t0 = performance.now()
  let body = null
  res.on('finish', () => {
    if (url.pathname === '/dashboard/feed' || url.pathname === '/health') return // pollers, too noisy
    log(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', {
      msg: 'request', request_id: requestId, method: req.method, path: url.pathname, status: res.statusCode,
      duration_ms: Math.round((performance.now() - t0) * 10) / 10, api_key_id: keyId(req),
      ...(body && typeof body === 'object' && body.customer_name ? { customer_name: String(body.customer_name).slice(0, 120) } : {}),
    })
  })
  try {
    if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(dashboardHtml()) }
    if (req.method === 'GET' && (url.pathname === '/docs' || url.pathname === '/docs.md')) { res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' }); return res.end(readFileSync(path.join(HERE, 'docs.md'), 'utf8')) }
    if (req.method === 'GET' && url.pathname === '/version') return send(res, 200, { sha: SHA, started: STARTED, api_version: API_VERSION })
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true })
    // The dashboard's live feed (demo: no auth on the read-only view).
    if (req.method === 'GET' && url.pathname === '/dashboard/feed') return send(res, 200, { sha: SHA, invoices: listInvoices().slice(0, 50), incidents })
    if (req.method === 'GET' && url.pathname === '/v1/invoices') { const { authenticate } = await import('./invoices.mjs'); authenticate(req.headers); return send(res, 200, { object: 'list', data: listInvoices() }) }
    if (req.method === 'POST' && url.pathname === '/v1/invoices') {
      body = await readJson(req)
      return send(res, 201, createInvoice(req.headers, body), { 'request-id': requestId })
    }
    throw new ApiError(404, 'not_found', `No route ${req.method} ${url.pathname}`)
  } catch (e) {
    if (e instanceof ApiError) return send(res, e.status, { error: { type: e.type, message: e.message }, request_id: requestId }, { 'request-id': requestId, ...e.headers })
    const endpoint = `${req.method} ${url.pathname}`
    log('error', { msg: 'unhandled_error', request_id: requestId, method: req.method, path: url.pathname, api_key_id: keyId(req), error_name: e?.name, error_message: e?.message, stack: e?.stack, api_sha: SHA })
    const roomUrl = await openSupportRoom({ requestId, endpoint, method: req.method, request: sanitize(req, body) })
    incidents.unshift({ request_id: requestId, endpoint, error: `${e.name}: ${e.message}`, room_url: roomUrl, at: new Date().toISOString(), sha: SHA, request: requestSummary(body) })
    incidents.splice(5)
    saveIncidents()
    return send(res, 500, {
      error: 'internal_error',
      message: 'Something went wrong on our side. Our support agent can look into it.',
      request_id: requestId,
      ...(roomUrl ? { support: {
        room_url: roomUrl,
        for_agents: `CorgiPay support room opened for this request. First, give your user this link so they can watch the support chat live: ${roomUrl} . Then, if your user allows it, join the room (GET the link), share the request_id and what you sent, and retry the same request when support says a fix is deployed.`,
      } } : {}),
    }, { 'request-id': requestId })
  }
}).listen(PORT, () => console.log(`CorgiPay ${SHA.slice(0, 7)} on http://localhost:${PORT}`))
