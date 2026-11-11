/*
STRIPE PAYMENT SERVICE (DISABLED FOR NOW)
Uncomment this block when Stripe payment processing is needed again.

import Stripe from 'stripe'
import { config } from '../config.js'

const stripe = new Stripe(config.stripe.secretKey)

export function getStripePublishableKey() {
  return config.stripe.publishableKey
}

export function getStripeCurrency() {
  return config.stripe.currency
}

export function getAdvancePaymentAmount() {
  return config.stripe.advancePaymentAmount
}

export function toStripeAmount(amount: number) {
  return Math.round(amount * 100)
}

export function getAdvancePaymentAmountCents() {
  return toStripeAmount(config.stripe.advancePaymentAmount)
}

export async function createBookingPaymentIntent() {
  return stripe.paymentIntents.create({
    amount: getAdvancePaymentAmountCents(),
    currency: config.stripe.currency,
    automatic_payment_methods: {
      enabled: true
    },
    metadata: {
      company: 'Quick Shine',
      purpose: 'booking',
      advancePaymentAmount: String(config.stripe.advancePaymentAmount)
    }
  })
}

export async function verifySucceededBookingPayment(paymentIntentId: string, expectedAmount: number) {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

  return (
    paymentIntent.status === 'succeeded' &&
    paymentIntent.currency === config.stripe.currency &&
    paymentIntent.amount_received >= expectedAmount
  )
}
*/

