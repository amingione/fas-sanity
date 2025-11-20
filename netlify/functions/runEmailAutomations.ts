import type {Handler} from '@netlify/functions'
import {
  runAppointmentReminderAutomations,
  runCartAbandonmentAutomations,
  runNoOrderNinetyDayAutomations,
  runOrderPlacedSweep,
} from '../lib/emailAutomations'

export const handler: Handler = async (event) => {
  const trigger = (event.queryStringParameters?.trigger || '').toLowerCase()
  const results: string[] = []

  try {
    if (!trigger || trigger === 'order_placed') {
      await runOrderPlacedSweep()
      results.push('order_placed')
    }
    if (!trigger || trigger === 'appointment_reminder') {
      await runAppointmentReminderAutomations()
      results.push('appointment_reminder')
    }
    if (!trigger || trigger === 'cart_abandoned_1hr') {
      await runCartAbandonmentAutomations(1)
      results.push('cart_abandoned_1hr')
    }
    if (!trigger || trigger === 'cart_abandoned_24hr') {
      await runCartAbandonmentAutomations(24)
      results.push('cart_abandoned_24hr')
    }
    if (!trigger || trigger === 'no_order_90days') {
      await runNoOrderNinetyDayAutomations()
      results.push('no_order_90days')
    }

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({success: true, processed: results}),
    }
  } catch (err: any) {
    console.error('runEmailAutomations failed', err)
    return {
      statusCode: 500,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        success: false,
        error: err?.message || 'Automation run failed',
      }),
    }
  }
}
