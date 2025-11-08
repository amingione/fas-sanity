import {useState} from 'react'
import {Box, Button, Flex, Stack, Text, useToast} from '@sanity/ui'
import type {DocumentActionComponent} from 'sanity'
import {useClient} from 'sanity'

function deepRemoveRefs(node: any, idSet: Set<string>): {node: any; removed: number} {
  if (Array.isArray(node)) {
    const out: any[] = []
    let removed = 0
    for (const v of node) {
      const r = deepRemoveRefs(v, idSet)
      removed += r.removed
      if (typeof r.node !== 'undefined') out.push(r.node)
    }
    return {node: out, removed}
  }
  if (node && typeof node === 'object') {
    if (node._type === 'reference' && node._ref && idSet.has(node._ref)) {
      return {node: undefined, removed: 1}
    }
    let removed = 0
    let changed = false
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(node)) {
      const r = deepRemoveRefs(v as any, idSet)
      removed += r.removed
      if (typeof r.node === 'undefined') {
        changed = true
      } else {
        out[k] = r.node
        if (r.removed > 0) changed = true
      }
    }
    return {node: changed ? out : node, removed}
  }
  return {node, removed: 0}
}

const ForceDeleteUnlinkAction: DocumentActionComponent = (props) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const toast = useToast()
  const {id, onComplete, type} = props
  const [isOpen, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!['vehicleModel', 'filterTag', 'product'].includes(type)) return null

  const baseId = id.startsWith('drafts.') ? id.slice(7) : id

  function close() {
    setOpen(false)
    setBusy(false)
    onComplete()
  }

  async function handleConfirm() {
    setBusy(true)
    try {
      const refDocs: {_id: string; _type: string}[] = await client.fetch(
        '*[references($id)]{_id,_type}[0...1000]',
        {
          id: baseId,
        },
      )
      const ids = new Set([baseId, `drafts.${baseId}`])

      for (const r of refDocs) {
        const doc = await client.fetch('*[_id == $id][0]', {id: r._id})
        if (!doc) continue
        const {node: next, removed} = deepRemoveRefs(doc, ids)
        if (removed > 0 && next && next._type) {
          await client.createOrReplace(next as any)
        }
      }

      const tx = client.transaction()
      tx.delete(baseId)
      tx.delete(`drafts.${baseId}`)
      await tx.commit({visibility: 'async'})

      toast.push({
        status: 'success',
        title: 'Deleted document and unlinked references',
        description: `Removed ${refDocs.length} referencing document(s) before deletion.`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.push({
        status: 'error',
        title: 'Force delete failed',
        description: message,
      })
    } finally {
      close()
    }
  }

  return {
    label: 'Force Delete (unlink refs)',
    tone: 'critical',
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
                <Text size={2} weight="semibold">
                  Force delete this {type}?
                </Text>
                <Text size={1} muted>
                  This removes references to the selected document from up to 1000 related documents
                  and then deletes both draft and published versions. This action cannot be undone.
                </Text>
                <Flex justify="flex-end" gap={3}>
                  <Button text="Cancel" mode="ghost" onClick={close} disabled={busy} />
                  <Button
                    text="Delete"
                    tone="critical"
                    onClick={handleConfirm}
                    disabled={busy}
                    loading={busy}
                  />
                </Flex>
              </Stack>
            </Box>
          ),
        }
      : undefined,
  }
}

export const forceDeleteUnlinkAction = ForceDeleteUnlinkAction
