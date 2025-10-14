import {useMemo, useState} from 'react'
import {Box, Button, Flex, Stack, Switch, Text, TextInput, useToast} from '@sanity/ui'
import type {DocumentActionComponent} from 'sanity'

function readEnv(name: string): string {
  try {
    return ((typeof process !== 'undefined' ? (process as any)?.env?.[name] : undefined) as string | undefined) || ''
  } catch (err) {
    console.warn('Failed reading env variable', name, err)
    return ''
  }
}

function getStoredValue(key: string): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage?.getItem(key) || ''
  } catch (err) {
    console.warn('Failed reading localStorage key', key, err)
    return ''
  }
}

function setStoredValue(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    if (value) {
      window.localStorage?.setItem(key, value)
    } else {
      window.localStorage?.removeItem(key)
    }
  } catch (err) {
    console.warn('Failed writing localStorage key', key, err)
  }
}

export function getFnBase(): string {
  const envBase = readEnv('SANITY_STUDIO_NETLIFY_BASE')
  if (envBase) return envBase
  if (typeof window !== 'undefined') {
    const ls = getStoredValue('NLFY_BASE')
    if (ls) return ls
    const origin = window.location?.origin
    if (origin && /^https?:\/\//i.test(origin)) return origin
  }
  return 'https://fassanity.fasmotorsports.com'
}

type BackfillActionConfig = {
  label: string
  functionName: string
  resultSummary: (data: Record<string, any>, dryRun: boolean) => string
}

export function createBackfillAction({label, functionName, resultSummary}: BackfillActionConfig): DocumentActionComponent {
  return (props) => {
    const {onComplete} = props
    const toast = useToast()
    const [isOpen, setOpen] = useState(false)
    const [dryRun, setDryRun] = useState(false)
    const [secret, setSecret] = useState(() => {
      const envSecret = readEnv('SANITY_STUDIO_BACKFILL_SECRET')
      if (envSecret) return envSecret
      return getStoredValue('BACKFILL_SECRET')
    })
    const [isSubmitting, setSubmitting] = useState(false)

    const baseUrl = useMemo(() => getFnBase().replace(/\/$/, ''), [])

    function close() {
      setOpen(false)
      setSubmitting(false)
      onComplete()
    }

    async function run() {
      setSubmitting(true)
      try {
        setStoredValue('BACKFILL_SECRET', secret.trim())

        const query = dryRun ? '?dryRun=true' : ''
        const url = `${baseUrl}/.netlify/functions/${functionName}${query}`

        const headers: Record<string, string> = {'Content-Type': 'application/json'}
        if (secret.trim()) {
          headers.Authorization = `Bearer ${secret.trim()}`
        }

        const res = await fetch(url, {method: 'POST', headers})
        const data = await res.json().catch(() => ({}))

        if (!res.ok || data?.error) {
          throw new Error(data?.error || `Request failed (${res.status})`)
        }

        toast.push({
          status: 'success',
          title: `${label}${dryRun ? ' (dry run)' : ''} finished`,
          description: resultSummary(data, dryRun),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        toast.push({
          status: 'error',
          title: `${label} failed`,
          description: message,
        })
      } finally {
        close()
      }
    }

    return {
      label,
      onHandle: () => {
        setOpen(true)
      },
      dialog: isOpen
        ? {
            type: 'dialog' as const,
            onClose: close,
            content: (
              <Box padding={4}>
                <Stack space={4}>
                  <Box>
                    <Text size={2} weight="semibold">
                      {label}
                    </Text>
                    <Text size={1} muted>
                      Runs Netlify function `{functionName}` using base {baseUrl}. Adjust options below.
                    </Text>
                  </Box>
                  <Flex align="center" gap={3}>
                    <Switch
                      id={`${functionName}-dry-run`}
                      checked={dryRun}
                      onChange={(event) => setDryRun(event.currentTarget.checked)}
                      disabled={isSubmitting}
                    />
                    <Text>Dry run</Text>
                  </Flex>
                  <Stack space={2}>
                    <Text size={1} muted>
                      Optional bearer secret
                    </Text>
                    <TextInput
                      value={secret}
                      type="password"
                      onChange={(event) => setSecret(event.currentTarget.value)}
                      disabled={isSubmitting}
                      autoComplete="off"
                      placeholder="Leave blank if not required"
                    />
                  </Stack>
                  <Flex justify="flex-end" gap={3}>
                    <Button text="Cancel" mode="ghost" onClick={close} disabled={isSubmitting} />
                    <Button
                      text="Run"
                      tone="primary"
                      onClick={run}
                      disabled={isSubmitting}
                      loading={isSubmitting}
                    />
                  </Flex>
                </Stack>
              </Box>
            ),
          }
        : undefined,
    }
  }
}
