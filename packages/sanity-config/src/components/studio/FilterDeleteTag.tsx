import React, {useCallback, useEffect, useState} from 'react'
import {Box, Button, Dialog, Flex, Stack, Text} from '@sanity/ui'
import {useClient} from 'sanity'

type Props = {tag: string}

function normalizeTag(s: string): string {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export default function FilterDeleteTag({tag}: Props) {
  const client = useClient({apiVersion: '2024-10-01'})
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const normTag = normalizeTag(tag)

  const refresh = useCallback(async () => {
    setBusy(true)
    setMsg('')
    try {
      const c = await client.fetch<number>(
        'count(*[_type=="product" && defined(filters) && $tag in filters])' as any,
        {tag: normTag} as any,
      )
      setCount(Number(c) || 0)
    } catch (e: any) {
      setMsg(String(e?.message || e))
      setCount(0)
    } finally {
      setBusy(false)
    }
  }, [client, normTag])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function removeEverywhere() {
    setBusy(true)
    setMsg('')
    try {
      const ids = await client.fetch<string[]>(
        '*[_type=="product" && defined(filters) && $tag in filters][]._id' as any,
        {tag: normTag} as any,
      )
      if (ids.length === 0) {
        setMsg('No products currently have this filter.')
        setCount(0)
        return
      }
      const docs: any[] = await client.fetch('*[_id in $ids]{_id, filters}', {ids})
      const tx = client.transaction()
      for (const d of docs) {
        const arr = Array.isArray(d.filters) ? d.filters : []
        const next = arr.filter((t: any) => normalizeTag(String(t)) !== normTag)
        tx.patch(d._id, {set: {filters: next}})
      }
      await tx.commit({autoGenerateArrayKeys: true})
      setMsg(`Removed "${normTag}" from ${docs.length} product(s).`)
      setCount(0)
    } catch (e: any) {
      setMsg(String(e?.message || e) || 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  function openConfirm() {
    setConfirmOpen(true)
  }

  function closeConfirm() {
    setConfirmOpen(false)
  }

  async function confirmDelete() {
    closeConfirm()
    await removeEverywhere()
  }

  return (
    <Box padding={3}>
      <Stack space={3}>
        <Text as="h3" size={2} weight="semibold">
          Delete filter: “{normTag}”
        </Text>
        <Text muted>{count === null ? 'Counting…' : `Products with this filter: ${count}`}</Text>
        {msg ? (
          <Text size={1} muted>
            {msg}
          </Text>
        ) : null}
        <Flex gap={2}>
          <Button text={busy ? 'Refreshing…' : 'Refresh'} onClick={refresh} disabled={busy} />
          <Button
            text={busy ? 'Deleting…' : 'Delete This Filter Everywhere'}
            tone="critical"
            onClick={openConfirm}
            disabled={busy}
          />
        </Flex>
        <Text size={1} muted>
          This removes the tag from all products. Since the filter list is auto-generated from
          products, the tag disappears once no products have it.
        </Text>
      </Stack>

      {confirmOpen ? (
        <Dialog
          id="delete-filter-confirm"
          header={`Delete filter "${normTag}"?`}
          onClose={closeConfirm}
          width={1}
          footer={
            <Flex gap={2} justify="flex-end">
              <Button text="Cancel" mode="ghost" onClick={closeConfirm} />
              <Button
                text="Delete"
                tone="critical"
                onClick={confirmDelete}
                loading={busy}
                disabled={busy}
              />
            </Flex>
          }
        >
          <Box padding={4}>
            <Text>
              This action removes “{normTag}” from all products that currently include it.
            </Text>
          </Box>
        </Dialog>
      ) : null}
    </Box>
  )
}
