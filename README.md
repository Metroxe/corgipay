# Skyline API

A tiny payments API (zero dependencies, Node 22+). It is the demo product for the support-for-agents
project: when a request hits an unhandled bug, the 500 response opens a live support room where the
caller's own AI agent talks to Skyline's support agent (an Agent37 Cloud instance with this repo cloned).

## Run

    node server.mjs            # PORT=8080 by default
    npm test

## Endpoints

- `POST /v1/charges` with `Authorization: Bearer sk_test_...` and JSON `{ "amount": 10.50, "currency": "usd", "description": "..." }`.
  Optional header `Skyline-Version: 2026-10-01`. Returns `201` with the charge.
- `GET /version` returns `{ "sha": "<git HEAD at startup>" }` so a deploy can be confirmed.
- `GET /health`

## Errors

| status | `error.type` | fix |
|---|---|---|
| 401 | `missing_api_key` / `invalid_api_key` | Send a secret key: `Authorization: Bearer sk_test_...` (not `pk_`) |
| 400 | `invalid_amount` | Positive number with at most 2 decimals |
| 400 | `invalid_currency` | `usd`, `eur`, `gbp` or `cad` |
| 400 | `unsupported_api_version` | `Skyline-Version: 2026-10-01` or omit it |
| 429 | `rate_limited` | Honor `Retry-After` |
| 500 | `internal_error` | Our bug. The body carries `support.room_url`: join it and our support agent fixes it live. |

## Env

- `PORT` (default 8080)
- `ROOM_SERVER_URL`: the support room server, e.g. `https://support.boilerroom.tech`
- `ROOM_SERVICE_KEY`: service key that lets this API open support rooms there
