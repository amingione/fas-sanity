import {useEffect, useMemo, useState} from 'react'
import {EnvelopeIcon} from '@sanity/icons'
import {
  Box,
  Button,
  Card,
  Checkbox,
  Flex,
  Stack,
  Text,
  TextInput,
  useToast,
} from '@sanity/ui'
import {useClient} from 'sanity'
import type {DocumentActionComponent} from 'sanity'
import {getNetlifyFnBase} from './netlifyFnBase'

const API_VERSION = '2024-10-01'
const DEFAULT_PORTAL_URL =
  process.env.SANITY_STUDIO_VENDOR_PORTAL_URL ||
  process.env.PUBLIC_VENDOR_PORTAL_URL ||
  ''

type PortalUser = {
  email?: string
  name?: string
  active?: boolean
}

type VendorDoc = {
  _id: string
  _type: 'vendor'
  companyName?: string
  displayName?: string
  vendorNumber?: string
  primaryContact?: {name?: string; email?: string}
  portalAccess?: {email?: string; invitedAt?: string}
  portalUsers?: PortalUser[]
  email?: string
}

const resolveVendorEmail = (doc: VendorDoc | null): string => {
  if (!doc) return ''
  const portalAccessEmail = doc.portalAccess?.email?.trim()
  if (portalAccessEmail) return portalAccessEmail
  const primaryEmail = doc.primaryContact?.email?.trim()
  if (primaryEmail) return primaryEmail
  const portalUserEmail = (doc.portalUsers || []).find((user) => user?.active !== false && user.email)
    ?.email
  if (portalUserEmail?.trim()) return portalUserEmail.trim()
  const legacyEmail = doc.email?.trim()
  return legacyEmail || ''
}

const formatDateTime = (iso?: string) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export const sendVendorInviteAction: DocumentActionComponent = (props) => {
  const doc = (props.draft || props.published) as VendorDoc | null
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const initialEmail = useMemo(
    () => resolveVendorEmail(doc),
    [doc?._id, doc?.portalAccess?.email, doc?.primaryContact?.email, doc?.email, doc?.portalUsers],
  )
  const [emailInput, setEmailInput] = useState(initialEmail)
  const invitedAt = doc?.portalAccess?.invitedAt
  const alreadyInvited = Boolean(invitedAt)
  const [resendConfirmed, setResendConfirmed] = useState(!alreadyInvited)

  useEffect(() => setEmailInput(initialEmail), [initialEmail])
  useEffect(() => setResendConfirmed(!alreadyInvited), [alreadyInvited])

  if (props.type !== 'vendor') return null
  if (!doc) {
    return {
      label: 'Send Invite',
      icon: EnvelopeIcon,
      disabled: true,
      title: 'Vendor document is not ready yet',
    }
  }

  const baseId = props.id.replace(/^drafts\./, '')
  const companyLabel = doc.companyName || doc.displayName || 'Vendor'
  const sendDisabled =
    sending || !emailInput.trim() || (alreadyInvited && resendConfirmed === false)
  const sendLabel = alreadyInvited ? 'Resend invite' : 'Send invite'

  const handleSend = async () => {
    const email = emailInput.trim()
    if (!email) {
      toast.push({status: 'warning', title: 'Add an email before sending'})
      return
    }
    setSending(true)
    try {
      const response = await fetch(`${getNetlifyFnBase()}/.netlify/functions/send-vendor-invite`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          vendorId: baseId,
          email,
          companyName: doc.companyName || doc.displayName,
          contactName: doc.primaryContact?.name,
          vendorNumber: doc.vendorNumber,
          portalUrl: DEFAULT_PORTAL_URL,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || 'Invite request failed')
      }
      const invitedOn = data?.invitedAt || new Date().toISOString()
      await client
        .patch(baseId)
        .setIfMissing({portalAccess: {}})
        .set({
          'portalAccess.email': email,
          'portalAccess.invitedAt': invitedOn,
        })
        .commit({autoGenerateArrayKeys: true})
      toast.push({status: 'success', title: 'Invite sent'})
      setOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send invite'
      toast.push({status: 'error', title: 'Invite failed', description: message})
    } finally {
      setSending(false)
      props.onComplete()
    }
  }

  const dialogContent = (
    <Box padding={4}>
      <Stack space={4}>
        <Stack space={2}>
          <Text size={1} muted>
            Invite for
          </Text>
          <Text weight="semibold">{companyLabel}</Text>
          {doc.vendorNumber && (
            <Text size={1} muted>
              Vendor #: {doc.vendorNumber}
            </Text>
          )}
        </Stack>

        {alreadyInvited && (
          <Card padding={3} radius={2} tone="caution" shadow={1} border>
            <Stack space={3}>
              <Text weight="semibold">Invite already sent</Text>
              <Text size={1} muted>
                Last invite: {formatDateTime(invitedAt)}
              </Text>
              <Checkbox
                checked={resendConfirmed}
                onChange={(event) => setResendConfirmed(event.currentTarget.checked)}
              >
                I want to resend this invite
              </Checkbox>
            </Stack>
          </Card>
        )}

        <Stack space={2}>
          <Text size={1} muted>
            Send to
          </Text>
          <TextInput
            value={emailInput}
            onChange={(event) => setEmailInput(event.currentTarget.value)}
            placeholder="vendor@email.com"
          />
        </Stack>

        {DEFAULT_PORTAL_URL && (
          <Text size={1} muted>
            Portal link: {DEFAULT_PORTAL_URL}
          </Text>
        )}

        <Flex justify="flex-end" gap={3}>
          <Button
            text="Cancel"
            mode="ghost"
            disabled={sending}
            onClick={() => {
              setOpen(false)
              setSending(false)
            }}
          />
          <Button
            tone="primary"
            text={sendLabel}
            icon={EnvelopeIcon}
            disabled={sendDisabled}
            loading={sending}
            onClick={handleSend}
          />
        </Flex>
      </Stack>
    </Box>
  )

  return {
    label: 'Send Invite',
    icon: EnvelopeIcon,
    tone: alreadyInvited ? 'caution' : 'primary',
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: 'dialog',
          header: 'Send vendor portal invite',
          onClose: () => {
            setOpen(false)
            setSending(false)
            props.onComplete()
          },
          content: dialogContent,
        }
      : undefined,
  }
}
