// Charges: the core of the Skyline API.
export const API_VERSION = '2026-10-01'
const CURRENCIES = ['usd', 'eur', 'gbp', 'cad']
const RATE_LIMIT = 20          // requests
const RATE_WINDOW_MS = 10_000  // per 10 seconds, per API key

export class ApiError extends Error {
  constructor(status, type, message, headers = {}) { super(message); this.status = status; this.type = type; this.headers = headers }
}

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
  if (!/^sk_(test|live)_[A-Za-z0-9_]{4,}$/.test(key)) throw new ApiError(401, 'invalid_api_key', 'API keys start with sk_test_ or sk_live_. Publishable keys (pk_) cannot create charges.')
  return key
}

export function checkVersion(headers) {
  const v = headers['skyline-version']
  if (v && v !== API_VERSION) throw new ApiError(400, 'unsupported_api_version', `Skyline-Version ${v} is not supported. Use ${API_VERSION}.`)
}

// Amounts are major units with up to 2 decimals: 10.50 means $10.50.
export function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) throw new ApiError(400, 'invalid_amount', '`amount` must be a positive number, e.g. 10.50.')
  const cents = Math.round(amount * 100)
  if (Math.abs(amount * 100 - cents) > 1e-6) throw new ApiError(400, 'invalid_amount', '`amount` can have at most 2 decimal places.')
  return cents
}

// Platform fee: 2.9% + 30 cents. The ledger keeps money as BigInt cents.
export function platformFee(cents) {
  const fee = cents * 0.029 + 30
  return BigInt(fee)
}

let seq = 0
export function createCharge(headers, body) {
  const key = authenticate(headers)
  checkVersion(headers)
  rateLimit(key)
  if (!body || typeof body !== 'object') throw new ApiError(400, 'invalid_json', 'Send a JSON body.')
  const currency = String(body.currency ?? '').toLowerCase()
  if (!CURRENCIES.includes(currency)) throw new ApiError(400, 'invalid_currency', `\`currency\` must be one of ${CURRENCIES.join(', ')}.`)
  const cents = toCents(body.amount)
  const fee = platformFee(cents)
  return {
    id: `ch_${Date.now().toString(36)}${(seq++).toString(36)}`,
    object: 'charge',
    status: 'succeeded',
    amount: cents / 100,
    amount_cents: cents,
    fee_cents: Number(fee),
    net_cents: Number(BigInt(cents) - fee),
    currency,
    description: body.description ?? null,
    livemode: key.startsWith('sk_live_'),
    api_version: API_VERSION,
  }
}
