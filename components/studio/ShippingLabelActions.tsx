import React, { useState } from 'react'
import { Button, Flex, Text, useToast } from '@sanity/ui'
import { useFormValue } from 'sanity'
import { createClient } from '@sanity/client'
import { Resend } from 'resend'

const getSanityClient = () =>
  createClient({
    projectId: 'r4og35qd',
    dataset: 'production',
    apiVersion: '2024-04-10',
    token: process.env.PUBLIC_SANITY_WRITE_TOKEN,
    useCdn: false
  })

const resend = new Resend(process.env.RESEND_API_KEY!)

export default function ShippingLabelActions() {
  const doc = useFormValue([]) as any
  const labelUrl = useFormValue(['labelUrl']) as string | undefined
  const trackingUrl = useFormValue(['trackingUrl']) as string | undefined

  const [isLoading, setIsLoading] = useState(false)
  const toast = useToast()

  const noData = !labelUrl && !trackingUrl

  const handleCreateLabel = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/.netlify/functions/createShippingLabel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelSize: '4x6' })
      })

      const result = await res.json()

      if (!res.ok) throw new Error(result.error)

      await getSanityClient().patch(doc._id).set({
        trackingUrl: result.trackingUrl,
        labelUrl: result.labelUrl
      }).commit()

      await resend.emails.send({
        from: 'FAS Motorsports &lt;shipping@fasmotorsports.com&gt;',
        to: 'customer@example.com', // Replace with actual customer's email if available
        subject: 'Your FAS Shipping Label is Ready!',
        html: `
          &lt;h2 style="font-family:sans-serif;color:#333"&gt;Your Order Has Shipped!&lt;/h2&gt;
          &lt;p&gt;We're excited to let you know your order has been shipped.&lt;/p&gt;
          &lt;p&gt;&lt;strong&gt;Tracking Number:&lt;/strong&gt; ${result.trackingNumber}&lt;/p&gt;
          &lt;p&gt;
            &lt;a href="${result.trackingUrl}" style="background:#0f62fe;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;"&gt;
              Track Your Package
            &lt;/a&gt;
          &lt;/p&gt;
          &lt;p&gt;
            Or &lt;a href="${result.labelUrl}"&gt;download your shipping label&lt;/a&gt; if needed.
          &lt;/p&gt;
          &lt;br /&gt;
          &lt;footer style="font-size:12px;color:#999"&gt;
            FAS Motorsports &mdash; Performance Delivered.
          &lt;/footer&gt;
        `
      })

      toast.push({
        status: 'success',
        title: 'Shipping label created!',
        closable: true
      })

      location.reload()
    } catch (error) {
      console.error(error)
      toast.push({
        status: 'error',
        title: 'Failed to create shipping label',
        description: 'Please try again or check logs.',
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
          No shipping label or tracking info yet. You can create a label using the invoice record.
        </Text>
      )}

      {labelUrl && (
        <Button
          text="🔘 Download Label"
          tone="primary"
          as="a"
          href={labelUrl}
          target="_blank"
        />
      )}

      {trackingUrl && (
        <Button
          text="🚚 Track Package"
          tone="positive"
          as="a"
          href={trackingUrl}
          target="_blank"
        />
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