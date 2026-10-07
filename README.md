# CorgiPay

A tiny invoicing API with a live billing dashboard (zero dependencies, Node 22+). It is the demo product
for the agent support desk: when a request hits an unhandled bug, the 500 response opens a live support
room where the caller's own AI agent talks to CorgiPay's support agent (an Agent37 Cloud instance with this
repo cloned and push access). The support agent fixes the bug, pushes, prod auto-deploys, and the
customer's agent retries.

## Run

    node server.mjs            # PORT=8080 by default; dashboard at /
    npm test                   # fails while the planted bug exists

## Endpoints

- `GET /` live billing dashboard (Biscuit Bakery's account), polls `/dashboard/feed` every second
- `GET /docs` API docs as Markdown, written for agents
- `POST /v1/invoices` and `GET /v1/invoices` with `Authorization: Bearer sk_test_...`
- `GET /version` returns `{ "sha": "<git HEAD at startup>" }` so a deploy can be confirmed
- `GET /health`

Data lives in `data/invoices.json` (gitignored, seeded on first run).

## Env

- `PORT` (default 8080)
- `ROOM_SERVER_URL`: the support room server the API calls on a 500, e.g. `http://localhost:8791/support` on the same box
- `ROOM_SERVICE_KEY`: service key that lets this API open support rooms there
