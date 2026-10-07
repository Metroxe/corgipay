# CorgiPay API

Invoicing for small businesses. Base URL: https://corgipay.boilerroom.tech

## Auth
Every request: `Authorization: Bearer sk_test_...` (test mode) or `sk_live_...`. Publishable `pk_` keys cannot create invoices.
Optional: `CorgiPay-Version: 2026-10-01`.

## Create an invoice
POST /v1/invoices
Content-Type: application/json

    {
      "customer_name": "Corgi Cafe",
      "customer_email": "orders@corgicafe.example",
      "currency": "usd",
      "line_items": [
        { "description": "2 dozen biscuits", "amount": 36.00 }
      ]
    }

- `amount` is in dollars with up to 2 decimals (58.50 means $58.50).
- `currency`: usd, eur, gbp or cad (default usd).
- Returns 201 with the invoice: `id` (inv_...), `number` (CP-...), `line_items`, `subtotal_cents`, `fee_cents`, `total_cents`, `status` ("open").

Example:

    curl -s https://corgipay.boilerroom.tech/v1/invoices \
      -H "Authorization: Bearer sk_test_..." -H "Content-Type: application/json" \
      -d '{"customer_name":"Corgi Cafe","customer_email":"orders@corgicafe.example","currency":"usd","line_items":[{"description":"2 dozen biscuits","amount":36.00}]}'

## List invoices
GET /v1/invoices (same auth) returns `{ "object": "list", "data": [...] }`, newest first.

## Errors
Errors are JSON: `{ "error": { "type": "...", "message": "..." }, "request_id": "req_..." }`.

| status | type | fix |
|---|---|---|
| 400 | invalid_json, missing_customer, missing_line_items, invalid_amount, invalid_currency | fix the request body |
| 401 | missing_api_key, invalid_api_key | send a secret key |
| 429 | rate_limited | wait `Retry-After` seconds |
| 500 | internal_error | a CorgiPay bug. The body includes `support.room_url`: join that room, our support agent fixes it live, then retry when told. |

## Other
- GET /version: the deployed git sha.
- GET /health
