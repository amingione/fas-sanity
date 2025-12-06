import React, {useEffect, useMemo, useState} from 'react'
import {Card, Spinner, Stack, Text, TextInput} from '@sanity/ui'
import {StringInputProps, StringSchemaType, set, unset, useClient, useFormValue} from 'sanity'
import {computeCustomerName, splitFullName} from '../../../../../shared/customerName'

type Props = StringInputProps<StringSchemaType>

const API_VERSION = '2024-10-01'

const normalizeName = (value?: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ')
}

const ComputedOrderCustomerNameInput = (props: Props) => {
  const {value, onChange} = props
  const client = useClient({apiVersion: API_VERSION})
  const doc = (useFormValue([]) || {}) as Record<string, any>
  const [refName, setRefName] = useState<string | undefined>()
  const [loadingRef, setLoadingRef] = useState<boolean>(false)

  const shippingName = normalizeName(doc?.shippingAddress?.name)
  const customerEmail =
    typeof doc?.customerEmail === 'string' ? normalizeName(doc.customerEmail) : undefined
  const customerRefId =
    typeof doc?.customerRef?._ref === 'string' ? doc.customerRef._ref.replace(/^drafts\./, '') : ''

  useEffect(() => {
    let cancelled = false
    if (!customerRefId) {
      setRefName(undefined)
      return () => {
        cancelled = true
      }
    }

    setLoadingRef(true)
    client
      .fetch(
        `*[_type == "customer" && _id == $id][0]{firstName,lastName,email,name}`,
        {id: customerRefId},
      )
      .then((res: any) => {
        if (cancelled) return
        const computed =
          computeCustomerName({
            firstName: res?.firstName as string | null | undefined,
            lastName: res?.lastName as string | null | undefined,
            email: res?.email as string | null | undefined,
            fallbackName: res?.name as string | null | undefined,
          }) || undefined
        setRefName(computed)
      })
      .catch(() => {
        if (cancelled) return
        setRefName(undefined)
      })
      .finally(() => {
        if (!cancelled) setLoadingRef(false)
      })

    return () => {
      cancelled = true
    }
  }, [client, customerRefId])

  const computedName = useMemo(() => {
    const shippingParts = splitFullName(shippingName)
    const refParts = splitFullName(refName)
    const firstName = shippingParts.firstName || refParts.firstName
    const lastName = shippingParts.lastName || refParts.lastName
    return (
      computeCustomerName({
        firstName,
        lastName,
        email: customerEmail,
        fallbackName: shippingName || refName,
      }) || ''
    )
  }, [customerEmail, refName, shippingName])

  useEffect(() => {
    if (!onChange) return
    const currentValue = typeof value === 'string' ? normalizeName(value) : ''
    const nextValue = normalizeName(computedName)
    if (nextValue && nextValue !== currentValue) {
      onChange(set(nextValue))
    } else if (!nextValue && currentValue) {
      onChange(unset())
    }
  }, [computedName, onChange, value])

  return (
    <Card padding={3} tone="transparent">
      <Stack space={2}>
        <Text size={1} muted>
          Auto-computed from customer record, shipping address, or email
        </Text>
        <TextInput
          value={computedName}
          readOnly
          suffix={loadingRef ? <Spinner muted size={0} /> : undefined}
          placeholder="Name will auto-fill"
        />
        {refName && (
          <Text size={1} muted>
            Customer record: {refName}
          </Text>
        )}
      </Stack>
    </Card>
  )
}

export default ComputedOrderCustomerNameInput
