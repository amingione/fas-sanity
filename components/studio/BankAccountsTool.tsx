import React, {useCallback, useEffect, useState} from 'react'
import {useClient} from 'sanity'
import {Badge, Box, Button, Card, Flex, Spinner, Stack, Text, useToast} from '@sanity/ui'
import {loadStripe, Stripe} from '@stripe/stripe-js'

type BankAccountDocument = {
  _id: string
  title?: string
  institutionName?: string
  holderName?: string
  accountLast4?: string
  routingLast4?: string
  status?: string
  defaultForChecks?: boolean
}

const publishableKey =
  process.env.SANITY_STUDIO_STRIPE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  ''

const BankAccountsTool = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const toast = useToast()

  const [accounts, setAccounts] = useState<BankAccountDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null)

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const result: BankAccountDocument[] = await client.fetch(
        `*[_type == "bankAccount"] | order(defaultForChecks desc, _createdAt desc){
          _id,
          title,
          institutionName,
          holderName,
          accountLast4,
          routingLast4,
          status,
          defaultForChecks
        }`
      )
      setAccounts(result)
    } catch (err: any) {
      console.error('BankAccountsTool fetch error', err)
      toast.push({
        status: 'error',
        title: 'Unable to load bank accounts',
        description: err?.message || 'Check console for details.',
      })
    } finally {
      setLoading(false)
    }
  }, [client, toast])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  useEffect(() => {
    if (!publishableKey) return
    loadStripe(publishableKey).then((loadedStripe) => {
      if (loadedStripe) {
        setStripeInstance(loadedStripe)
      } else {
        toast.push({
          status: 'error',
          title: 'Stripe failed to initialize',
          description: 'Check your publishable key configuration.',
        })
      }
    })
  }, [toast])

  const handleConnect = useCallback(async () => {
    if (!publishableKey) {
      toast.push({
        status: 'error',
        title: 'Missing Stripe publishable key',
        description: 'Set SANITY_STUDIO_STRIPE_PUBLISHABLE_KEY in your environment.',
      })
      return
    }
    if (!stripeInstance) {
      toast.push({
        status: 'warning',
        title: 'Stripe is still loading',
        description: 'Please try again in a moment.',
      })
      return
    }

    setConnecting(true)
    try {
      const sessionResponse = await fetch('/.netlify/functions/createFinancialConnectionSession', {
        method: 'POST',
      })

      if (!sessionResponse.ok) {
        const detail = await sessionResponse.text()
        throw new Error(detail || 'Failed to create session')
      }

      const {clientSecret, sessionId} = await sessionResponse.json()

      if (!clientSecret || !sessionId) {
        throw new Error('Stripe session missing data')
      }

      const result = await stripeInstance.collectFinancialConnectionsAccounts({
        clientSecret,
      })

      if (result.error) {
        throw new Error(result.error.message || 'Stripe connection canceled')
      }

      const finalizeResponse = await fetch('/.netlify/functions/finalizeFinancialConnection', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sessionId}),
      })

      if (!finalizeResponse.ok) {
        const detail = await finalizeResponse.text()
        throw new Error(detail || 'Failed to store bank account')
      }

      toast.push({status: 'success', title: 'Bank account connected'})
      await fetchAccounts()
    } catch (err: any) {
      console.error('BankAccountsTool connect error', err)
      toast.push({
        status: 'error',
        title: 'Connection failed',
        description: err?.message || 'Check console for details.',
      })
    } finally {
      setConnecting(false)
    }
  }, [fetchAccounts, stripeInstance, toast])

  const noAccounts = !loading && accounts.length === 0

  return (
    <Box ref={ref} padding={4}>
      <Stack space={4}>
        <Flex justify="space-between" align="center">
          <Stack space={2}>
            <Text size={2} weight="semibold">
              Connected Bank Accounts
            </Text>
            <Text size={1} muted>
              These accounts are available for check printing through Stripe Financial Connections.
            </Text>
          </Stack>
          <Button
            text="Connect bank account"
            tone="primary"
            onClick={handleConnect}
            disabled={connecting}
            loading={connecting}
          />
        </Flex>

        {loading ? (
          <Card padding={5} radius={4} shadow={1}>
            <Flex align="center" justify="center" gap={3}>
              <Spinner muted />
              <Text muted>Loading accounts…</Text>
            </Flex>
          </Card>
        ) : noAccounts ? (
          <Card padding={5} radius={4} shadow={1}>
            <Flex direction="column" align="center" gap={3}>
              <Text size={2} weight="semibold">
                No accounts connected yet
              </Text>
              <Text size={1} muted style={{textAlign: 'center'}}>
                Click “Connect bank account” to link your checking account with Stripe and start printing checks.
              </Text>
            </Flex>
          </Card>
        ) : (
          <Stack space={3}>
            {accounts.map((account) => (
              <Card key={account._id} padding={4} radius={4} shadow={1}>
                <Flex justify="space-between" align="flex-start">
                  <Stack space={2}>
                    <Text size={2} weight="semibold">
                      {account.title || 'Connected Account'}
                    </Text>
                    <Text size={1} muted>
                      {account.institutionName || 'Financial institution'} ••••{account.accountLast4 || '----'}
                    </Text>
                    <Text size={1}>
                      Holder: {account.holderName || 'Unknown'} | Routing ••••{account.routingLast4 || '----'}
                    </Text>
                  </Stack>
                  <Flex direction="column" align="flex-end" gap={2}>
                    <Badge tone={account.defaultForChecks ? 'positive' : 'default'}>
                      {account.defaultForChecks ? 'Default for checks' : 'Available'}
                    </Badge>
                    {account.status && account.status !== 'active' ? (
                      <Badge tone="caution">{account.status}</Badge>
                    ) : null}
                  </Flex>
                </Flex>
              </Card>
            ))}
          </Stack>
        )}

        <Card padding={4} radius={4} shadow={1} tone="transparent">
          <Stack space={2}>
            <Text size={1} weight="semibold">
              How it works
            </Text>
            <Text size={1} muted>
              When you connect a bank account, Stripe securely stores the routing and account numbers. We only display
              the last four digits in the Studio and retrieve the full numbers on-demand when generating a printable
              check. You can disconnect the account at any time from your Stripe dashboard.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
})

BankAccountsTool.displayName = 'BankAccountsTool'

export default BankAccountsTool
