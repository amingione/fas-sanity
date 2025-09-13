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

export const forceDeleteUnlinkAction: DocumentActionComponent = (props) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const {id, onComplete, type} = props

  // Only show for specific types for now
  if (type !== 'vehicleModel' && type !== 'filterTag') return null

  const baseId = id.startsWith('drafts.') ? id.slice(7) : id

  return {
    label: 'Force Delete (unlink refs)',
    tone: 'critical',
    onHandle: async () => {
      try {
        const ok = typeof window !== 'undefined' ? window.confirm('This will remove references to this document from all other documents, then delete it. Continue?') : false
        if (!ok) return onComplete()

        // Find referencing docs
        const refDocs: {_id: string; _type: string}[] = await client.fetch('*[references($id)]{_id,_type}[0...1000]', {id: baseId})
        const ids = new Set([baseId, `drafts.${baseId}`])

        // Unlink references
        for (const r of refDocs) {
          const doc = await client.fetch('*[_id == $id][0]', {id: r._id})
          if (!doc) continue
          const {node: next, removed} = deepRemoveRefs(doc, ids)
          if (removed > 0 && next) {
            await client.createOrReplace(next)
          }
        }

        // Delete draft + published
        const tx = client.transaction()
        tx.delete(baseId)
        tx.delete(`drafts.${baseId}`)
        await tx.commit({visibility: 'async'})

        if (typeof window !== 'undefined') window.alert('Deleted (and unlinked references).')
      } catch (e: any) {
        if (typeof window !== 'undefined') window.alert(`Force delete failed: ${e?.message || e}`)
      } finally {
        onComplete()
      }
    },
  }
}
