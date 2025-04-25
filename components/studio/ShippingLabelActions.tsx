import React, { useState } from 'react'
import { Button, Flex, Text, useToast } from '@sanity/ui'
import { useFormValue } from 'sanity'
import { createClient } from '@sanity/client'
import { Resend } from 'resend'

interface Props {
  doc: Record<string, any>
}

const getSanityClient = () =>
  createClient({
    projectId: 'r4og35qd',
    dataset: 'production',
    apiVersion: '2024-04-10',
    token: process.env.PUBLIC_SANITY_WRITE_TOKEN,
    useCdn: false
  })

  const resend = new Resend(process.env.SANITY_STUDIO_RESEND_API_KEY)

export default function ShippingLabelActions({ doc }: Props) {
  const labelUrl = useFormValue(['labelUrl']) as string | undefined
  const trackingUrl = useFormValue(['trackingUrl']) as string | undefined

  const [isLoading, setIsLoading] = useState(false)
  const toast = useToast()

  const noData = !labelUrl && !trackingUrl

  const handleCreateLabel = async () => {
    const input = prompt('Enter package weight in pounds (e.g. 1.2):')
    const weight = input ? parseFloat(input) : 1.2

    if (isNaN(weight) || weight <= 0) {
      toast.push({
        status: 'warning',
        title: 'Invalid weight entered',
        description: 'Please enter a valid number greater than 0.',
        closable: true
      })
      return
    }

    setIsLoading(true)

    const client = getSanityClient()
    const logEvent = async (entry: Record<string, any>) => {
      await client
        .patch(doc._id)
        .setIfMissing({ shippingLog: [] })
        .append('shippingLog', [entry])
        .commit({ autoGenerateArrayKeys: true })
    }

    try {
      const res = await fetch('/.netlify/functions/createShippingLabel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelSize: '4x6', weight, orderId: doc._id })
      })

      const result = await res.json()

      if (!res.ok) throw new Error(result.error)

      await client.patch(doc._id).set({
        trackingUrl: result.trackingUrl,
        labelUrl: result.labelUrl
      }).commit()

      await resend.emails.send({
        from: 'FAS Motorsports <shipping@fasmotorsports.com>',
        to: 'customer@example.com',
        subject: 'Your FAS Shipping Label is Ready!',
        html: `
          <h2>Your Order Has Shipped!</h2>
          <p><strong>Tracking Number:</strong> ${result.trackingNumber}</p>
          <p><a href="${result.trackingUrl}">Track your package</a></p>
        `
      })

      await logEvent({
        _type: 'shippingLogEntry',
        status: 'created',
        labelUrl: result.labelUrl,
        trackingUrl: result.trackingUrl,
        trackingNumber: result.trackingNumber,
        createdAt: new Date().toISOString(),
        weight
      })

      toast.push({
        status: 'success',
        title: 'Shipping label created!',
        closable: true
      })

      location.reload()
    } catch (error: any) {
      console.error(error)

      await logEvent({
        _type: 'shippingLogEntry',
        status: 'error',
        message: error.message || 'Label generation failed',
        createdAt: new Date().toISOString()
      })

      toast.push({
        status: 'error',
        title: 'Failed to create shipping label',
        description: error.message || 'Unknown error',
        closable: true
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Flex direction="column" gap={3} padding={4}>
      {noData && (
        <Text size={1} muted>
          No shipping label or tracking info yet.
        </Text>
      )}

      {labelUrl && (
        <Button text="🔘 Download Label" tone="primary" as="a" href={labelUrl} target="_blank" />
      )}

      {trackingUrl && (
        <Button text="🚚 Track Package" tone="positive" as="a" href={trackingUrl} target="_blank" />
      )}

      {noData && (
        <Button
          text={isLoading ? 'Creating label...' : '📦 Create Label'}
          tone="default"
          onClick={handleCreateLabel}
          disabled={isLoading}
        />
      )}
    </Flex>
  )
}