// Invoices: the core of the CorgiPay API.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const API_VERSION = '2026-10-01'
const CURRENCIES = ['usd', 'eur', 'gbp', 'cad']
const FEE_BPS = 290n            // CorgiPay fee: 2.9% ...
const FEE_FIXED_CENTS = 30n     // ... plus 30 cents per invoice
const RATE_LIMIT = 30
const RATE_WINDOW_MS = 10_000

export class ApiError extends Error {
  constructor(status, type, message, headers = {}) { super(message); this.status = status; this.type = type; this.headers = headers }
}

// ---------- store (data/invoices.json, seeded so the dashboard is never empty) ----------

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'invoices.json')
const day = 86_400_000
const SEED = [
  { customer_name: 'Sunrise Coffee', customer_email: 'orders@sunrisecoffee.example', currency: 'usd', status: 'paid', ago: 5 * day, line_items: [{ description: '40 butter croissants', amount: 130 }, { description: '3 dozen biscuits', amount: 54 }] },
  { customer_name: 'Paws & Pour', customer_email: 'billing@pawsandpour.example', currency: 'usd', status: 'paid', ago: 3 * day, line_items: [{ description: 'Weekly pastry order', amount: 212 }] },
  { customer_name: 'The Loaf Lounge', customer_email: 'ap@loaflounge.example', currency: 'usd', status: 'overdue', ago: 2 * day, line_items: [{ description: 'Sourdough loaves x 24', amount: 168 }] },
  { customer_name: 'Sunrise Coffee', customer_email: 'orders@sunrisecoffee.example', currency: 'usd', status: 'open', ago: 20 * 3_600_000, line_items: [{ description: 'Morning delivery: croissants, scones', amount: 96 }] },
  { customer_name: 'Paws & Pour', customer_email: 'billing@pawsandpour.example', currency: 'usd', status: 'open', ago: 19 * 3_600_000, line_items: [{ description: 'Morning delivery: cinnamon rolls x 30', amount: 105 }] },
]

let invoices = null
function load() {
  if (invoices) return invoices
  try { invoices = JSON.parse(readFileSync(DATA, 'utf8')) } catch { invoices = null }
  if (!Array.isArray(invoices)) {
    invoices = []
    for (const s of SEED) invoices.push(build(s, new Date(Date.now() - s.ago).toISOString(), s.status))
    save()
  }
  return invoices
}
function save() {
  if (process.env.NODE_ENV === 'test') return
  mkdirSync(path.dirname(DATA), { recursive: true })
  writeFileSync(DATA, JSON.stringify(invoices, null, 2))
}

// ---------- rules ----------

const hits = new Map()
function rateLimit(key) {
  const now = Date.now()
  const list = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (list.length >= RATE_LIMIT) {
    const retry = Math.ceil((RATE_WINDOW_MS - (now - list[0])) / 1000)
    throw new ApiError(429, 'rate_limited', `Too many requests. Retry after ${retry}s.`, { 'retry-after': String(retry) })
  }
  list.push(now)
  hits.set(key, list)
}

export function authenticate(headers) {
  const key = String(headers['authorization'] ?? '').replace(/^Bearer\s+/i, '')
  if (!key) throw new ApiError(401, 'missing_api_key', 'Send your API key as `Authorization: Bearer sk_test_...`.')
  if (!/^sk_(test|live)_[A-Za-z0-9_]{4,}$/.test(key)) throw new ApiError(401, 'invalid_api_key', 'API keys start with sk_test_ or sk_live_. Publishable keys (pk_) cannot create invoices.')
  return key
}

export function checkVersion(headers) {
  const v = headers['corgipay-version']
  if (v && v !== API_VERSION) throw new ApiError(400, 'unsupported_api_version', `CorgiPay-Version ${v} is not supported. Use ${API_VERSION}.`)
}

// Line item amounts are dollars with up to 2 decimals (49.50 means $49.50). The ledger keeps BigInt cents.
export function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) throw new ApiError(400, 'invalid_amount', 'Each line item `amount` must be a positive number, e.g. 49.50.')
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) throw new ApiError(400, 'invalid_amount', 'Line item amounts can have at most 2 decimal places.')
  return BigInt(amount) * 100n
}

export function fee(subtotalCents) {
  return (subtotalCents * FEE_BPS + 5000n) / 10000n + FEE_FIXED_CENTS
}

function build(input, createdAt = new Date().toISOString(), status = 'open') {
  const items = input.line_items.map((li) => ({ description: String(li.description ?? '').slice(0, 200), amount_cents: toCents(li.amount) }))
  const subtotal = items.reduce((a, li) => a + li.amount_cents, 0n)
  const f = fee(subtotal)
  const n = (invoices?.length ?? 0) + 1041
  return {
    id: `inv_${Date.parse(createdAt).toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    object: 'invoice',
    number: `CP-${n}`,
    customer_name: String(input.customer_name).slice(0, 120),
    customer_email: String(input.customer_email ?? '').slice(0, 200),
    currency: input.currency,
    line_items: items.map((li) => ({ description: li.description, amount_cents: Number(li.amount_cents) })),
    subtotal_cents: Number(subtotal),
    fee_cents: Number(f),
    total_cents: Number(subtotal),
    net_cents: Number(subtotal - f),
    status,
    created: createdAt,
    api_version: API_VERSION,
  }
}

export function createInvoice(headers, body) {
  const key = authenticate(headers)
  checkVersion(headers)
  rateLimit(key)
  if (!body || typeof body !== 'object') throw new ApiError(400, 'invalid_json', 'Send a JSON body.')
  if (!body.customer_name) throw new ApiError(400, 'missing_customer', '`customer_name` is required.')
  const currency = String(body.currency ?? 'usd').toLowerCase()
  if (!CURRENCIES.includes(currency)) throw new ApiError(400, 'invalid_currency', `\`currency\` must be one of ${CURRENCIES.join(', ')}.`)
  if (!Array.isArray(body.line_items) || !body.line_items.length) throw new ApiError(400, 'missing_line_items', '`line_items` must be a non-empty array of { description, amount }.')
  if (body.line_items.length > 50) throw new ApiError(400, 'too_many_line_items', 'At most 50 line items.')
  const list = load()
  const inv = build({ ...body, currency })
  list.push(inv)
  save()
  return { ...inv, livemode: key.startsWith('sk_live_') }
}

export function listInvoices() {
  return [...load()].sort((a, b) => b.created.localeCompare(a.created))
}
