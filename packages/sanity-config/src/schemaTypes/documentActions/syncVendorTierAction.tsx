/**
 * syncVendorTierAction
 *
 * Sanity Studio document action for vendor documents.
 * Appears in the action menu when viewing a vendor in Sanity Studio.
 * Calls the sync-vendor-tier-to-medusa Netlify function to push the
 * vendor's current pricingTier to Medusa customer groups.
 *
 * Registered in resolveDocumentActions.ts for _type === 'vendor'.
 */

import {useState} from 'react'
import {SyncIcon} from '@sanity/icons'
import {Box, Button, Card, Flex, Stack, Text, useToast} from '@sanity/ui'
import type {DocumentActionComponent} from 'sanity'
import {getNetlifyFnBase} from './netlifyFnBase'

type VendorDoc = {
  _id: string
  _type: 'vendor'
  companyName?: string
  displayName?: string
  pricingTier?: string
  portalAccess?: {email?: string}
  primaryContact?: {email?: string}
}

const TIER_LABELS: Record<string, string> = {
  standard: 'Standard',
  preferred: 'Preferred',
  platinum: 'Platinum',
  custom: 'Custom',
}

export const syncVendorTierAction: DocumentActionComponent = (props) => {
  const doc = (props.draft || props.published) as VendorDoc | null
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)

  if (props.type !== 'vendor') return null
  if (!doc) {
    return {
      label: 'Sync Tier to Medusa',
      icon: SyncIcon,
      disabled: true,
      title: 'Vendor document not ready',
    }
  }

  const baseId = props.id.replace(/^drafts\./, '')
  const companyLabel = doc.companyName || doc.displayName || 'Vendor'
  const currentTier = doc.pricingTier || 'standard'
  const tierLabel = TIER_LABELS[currentTier] ?? currentTier

  const handleSync = async () => {
    setSyncing(true)
    setResult(null)
    try {
      const response = await fetch(
        `${getNetlifyFnBase()}/.netlify/functions/sync-vendor-tier-to-medusa`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            vendorId: baseId,
            _id: baseId,
            _type: 'vendor',
            pricingTier: doc.pricingTier,
            portalAccess: doc.portalAccess,
            primaryContact: doc.primaryContact,
            companyName: doc.companyName,
          }),
        }
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || 'Sync failed')
      }
      setResult(data)
      toast.push({
        status: 'success',
        title: 'Tier synced to Medusa',
        description: `${companyLabel} → ${tierLabel} tier · Group: ${data.customer_group_name || '—'}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sync tier'
      toast.push({status: 'error', title: 'Sync failed', description: message})
    } finally {
      setSyncing(false)
      if (!result) props.onComplete()
    }
  }

  const dialogContent = (
    <Box padding={4}>
      <Stack space={4}>
        <Stack space={2}>
          <Text size={1} muted>Vendor</Text>
          <Text weight="semibold">{companyLabel}</Text>
        </Stack>
        <Stack space={2}>
          <Text size={1} muted>Current pricing tier</Text>
          <Text weight="semibold">{tierLabel}</Text>
        </Stack>
        <Card padding={3} radius={2} tone="primary" shadow={1} border>
          <Text size={1}>
            This will assign this vendor to the <strong>FAS Vendor: {tierLabel}</strong> Medusa
            customer group, linking the <strong>Vendor Wholesale: {tierLabel}</strong> price list.
            Happens automatically on vendor save — use this to force-sync if Medusa is out of sync.
          </Text>
        </Card>

        {result && (
          <Card padding={3} radius={2} tone="positive" shadow={1} border>
            <Stack space={2}>
              <Text size={1} weight="semibold">Sync result</Text>
              <Text size={1}>Customer: {(result.medusa_customer_id as string) || '—'}</Text>
              <Text size={1}>Group: {(result.customer_group_name as string) || '—'}</Text>
              <Text size={1}>Price list: {(result.price_list_name as string) || '—'}</Text>
              {Array.isArray(result.warnings) && result.warnings.length > 0 && (
                <Text size={1} muted>
                  Warnings: {(result.warnings as string[]).join('; ')}
                </Text>
              )}
            </Stack>
          </Card>
        )}

        <Flex justify="flex-end" gap={3}>
          <Button
            text="Close"
            mode="ghost"
            disabled={syncing}
            onClick={() => {
              setOpen(false)
              setResult(null)
              props.onComplete()
            }}
          />
          {!result && (
            <Button
              tone="primary"
              text={syncing ? 'Syncing…' : 'Sync to Medusa'}
              icon={SyncIcon}
              disabled={syncing}
              loading={syncing}
              onClick={handleSync}
            />
          )}
        </Flex>
      </Stack>
    </Box>
  )

  return {
    label: 'Sync Tier to Medusa',
    icon: SyncIcon,
    tone: 'primary' as const,
    onHandle: () => {
      setResult(null)
      setOpen(true)
    },
    dialog: open
      ? {
          type: 'dialog' as const,
          header: 'Sync vendor tier to Medusa',
          onClose: () => {
            setOpen(false)
            setResult(null)
            props.onComplete()
          },
          content: dialogContent,
        }
      : undefined,
  }
}
