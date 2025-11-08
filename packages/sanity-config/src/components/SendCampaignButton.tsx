import React, {useState} from 'react'
import {Button, Stack, Text} from '@sanity/ui'
import {ArrowUpIcon} from '@sanity/icons'

interface SendCampaignButtonProps {
  document?: {
    _id?: string
    status?: string
  }
}

export default function SendCampaignButton(props: SendCampaignButtonProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const campaignId = props?.document?._id?.replace('drafts.', '')
  const status = props?.document?.status

  const handleSend = async (isTest: boolean) => {
    if (!campaignId) return

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/.netlify/functions/sendEmailCampaign', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({campaignId, isTest}),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send')
      }

      setResult(
        isTest
          ? `✅ Test email sent successfully!`
          : `✅ Campaign sent to ${data.sent} recipients!`,
      )
    } catch (err: any) {
      setResult(`❌ Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (status === 'sent') {
    return <Text size={1}>✅ Campaign already sent</Text>
  }

  return (
    <Stack space={3}>
      <Stack space={2}>
        <Button
          text={loading ? 'Sending Test...' : 'Send Test Email'}
          onClick={() => handleSend(true)}
          tone="primary"
          mode="ghost"
          disabled={loading}
        />
        <Button
          text={loading ? 'Sending...' : 'Send to All Recipients'}
          onClick={() => handleSend(false)}
          tone="positive"
          icon={ArrowUpIcon}
          disabled={loading || status !== 'draft'}
        />
      </Stack>
      {result && <Text size={1}>{result}</Text>}
    </Stack>
  )
}
