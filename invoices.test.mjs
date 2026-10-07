process.env.NODE_ENV = 'test'
const { test } = await import('node:test')
const assert = (await import('node:assert/strict')).default
const { createInvoice, toCents, fee, ApiError } = await import('./invoices.mjs')

const H = { authorization: 'Bearer sk_test_unit_1234' }
const inv = (line_items) => createInvoice(H, { customer_name: 'Test Co', customer_email: 'a@test.example', currency: 'usd', line_items })

test('invoices fractional-dollar amounts without truncating cents', () => {
  const i = inv([{ description: 'Croissants', amount: 58.5 }, { description: 'Biscuits', amount: 36 }])
  assert.equal(i.subtotal_cents, 9450)
})

test('invoices whole-dollar line items', () => {
  const i = inv([{ description: 'Website redesign', amount: 1200 }])
  assert.equal(i.status, 'sent')
  assert.equal(i.subtotal_cents, 120000)
  assert.equal(i.fee_cents, 3510)
})

test('invoices a line item with cents ($49.50)', () => {
  const i = inv([{ description: 'Website redesign', amount: 1200 }, { description: 'Logo files', amount: 49.5 }])
  assert.equal(i.subtotal_cents, 124950)
  assert.equal(i.total_cents, 124950)
})

test('converts dollars to cents', () => {
  assert.equal(toCents(10.5), 1050n)
  assert.equal(toCents(0.29), 29n)
  assert.equal(toCents(19.99), 1999n)
  assert.throws(() => toCents(1.234), ApiError)
})

test('fee is 2.9% + 30c, rounded', () => {
  assert.equal(fee(1050n), 60n)
})

test('rejects bad keys', () => {
  assert.throws(() => createInvoice({ authorization: 'Bearer pk_test_1234' }, {}), (e) => e.status === 401)
})
