import type { DocumentActionComponent } from 'sanity'

function getFnBase(): string {
  const envBase = (typeof process !== 'undefined' ? (process as any)?.env?.SANITY_STUDIO_NETLIFY_BASE : undefined) as string | undefined
  if (envBase) return envBase
  if (typeof window !== 'undefined') {
    try {
      const ls = window.localStorage?.getItem('NLFY_BASE')
      if (ls) return ls
      const origin = window.location?.origin
      if (origin && /^https?:\/\//i.test(origin)) return origin
    } catch {}
  }
  return 'https://fassanity.fasmotorsports.com'
}

export const backfillOrdersAction: DocumentActionComponent = (props) => {
  const { onComplete } = props

  return {
    label: 'Backfill Orders',
    onHandle: async () => {
      try {
        const ok = typeof window !== 'undefined' ? window.confirm('Run backfill on all Orders?') : false
        if (!ok) return onComplete()

        const dry = typeof window !== 'undefined' && window.confirm('Dry run first?')
        const base = getFnBase().replace(/\/$/, '')
        const url = `${base}/.netlify/functions/backfillOrders${dry ? '?dryRun=true' : ''}`

        // Read secret from env, localStorage, or prompt
        let secret = ''
        try {
          // @ts-ignore — available at build time in Studio if provided
          secret = (typeof process !== 'undefined' ? (process as any)?.env?.SANITY_STUDIO_BACKFILL_SECRET : '') || ''
        } catch {}
        if (!secret && typeof window !== 'undefined') {
          try { secret = window.localStorage?.getItem('BACKFILL_SECRET') || '' } catch {}
        }
        if (!secret && typeof window !== 'undefined') {
          const ans = window.prompt('Optional BACKFILL secret (leave blank if not set):')
          if (ans) {
            secret = ans.trim()
            try { window.localStorage?.setItem('BACKFILL_SECRET', secret) } catch {}
          }
        }

        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (secret) headers['Authorization'] = `Bearer ${secret}`

        const res = await fetch(url, { method: 'POST', headers })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data?.error) {
          alert(`Backfill failed: ${data?.error || res.status}`)
        } else {
          const msg = `Backfill ${dry ? '(dry run) ' : ''}ok\n` +
            `Processed: ${data.total}\nChanged: ${data.changed}\nMigrated customer: ${data.migratedCustomer}\nCart fixed: ${data.cartFixed}\nRemaining legacy customer: ${data.remainingCustomer}`
          alert(msg)
        }
      } catch (e: any) {
        alert(`Backfill error: ${e?.message || e}`)
      } finally {
        onComplete()
      }
    },
  }
}
