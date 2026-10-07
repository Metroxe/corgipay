import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCharge, toCents, platformFee, ApiError } from './charges.mjs'

const H = { authorization: 'Bearer sk_test_unit_1234' }

test('charges a whole-dollar amount', () => {
  const c = createCharge(H, { amount: 10, currency: 'usd' })
  assert.equal(c.status, 'succeeded')
  assert.equal(c.amount_cents, 1000)
  assert.equal(c.fee_cents, 59)
})

test('charges an amount with cents ($10.50)', () => {
  const c = createCharge(H, { amount: 10.5, currency: 'usd' })
  assert.equal(c.amount_cents, 1050)
  assert.equal(c.fee_cents, 60)
  assert.equal(c.net_cents, 990)
})

test('charges $19.99', () => {
  const c = createCharge(H, { amount: 19.99, currency: 'usd' })
  assert.equal(c.amount_cents, 1999)
})

test('fee is rounded to whole cents', () => {
  assert.equal(platformFee(1050), 60n)
  assert.equal(platformFee(1999), 88n)
})

test('converts amounts to cents', () => {
  assert.equal(toCents(10.5), 1050)
  assert.equal(toCents(0.29), 29)
  assert.throws(() => toCents(1.234), ApiError)
})

test('rejects bad keys', () => {
  assert.throws(() => createCharge({ authorization: 'Bearer pk_test_1234' }, { amount: 1, currency: 'usd' }), (e) => e.status === 401)
})
