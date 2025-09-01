import React from 'react'
import { Button, useToast } from '@sanity/ui'

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

type CheckResponse = {
  ok: boolean
  present: Record<string, boolean>
  missing: Record<string, string[]>
  extras?: Record<string, string>
}

export default function EnvSelfCheck() {
  const [data, setData] = React.useState<CheckResponse | null>(null)
  const [err, setErr] = React.useState<string>('')
  const [loading, setLoading] = React.useState<boolean>(true)
  const base = getFnBase().replace(/\/$/, '')
  const toast = useToast()

  async function runSelfCheck(pushToast = false) {
    setLoading(true)
    setErr('')
    try {
      const res = await fetch(`${base}/.netlify/functions/selfCheck`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      setData(json as CheckResponse)
      if (pushToast) {
        toast.push({
          status: json?.ok ? 'success' : 'warning',
          title: 'Env Self‑Check',
          description: (
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {JSON.stringify(json, null, 2)}
            </pre>
          ) as unknown as string, // toast description accepts ReactNode; cast to satisfy TS in some setups
          closable: true,
          duration: 8000,
        })
      }
    } catch (e: any) {
      setErr(e?.message || 'Failed to load env status')
      toast.push({ status: 'error', title: 'Env Self‑Check failed', description: String(e?.message || e), closable: true })
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!cancelled) await runSelfCheck(false)
    })()
    return () => {
      cancelled = true
    }
  }, [base])

  const Section = ({ title, keys }: { title: string; keys: string[] }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 600, color: '#000' }}>{title}</div>
      <ul style={{ margin: '6px 0 0 14px', padding: 0 }}>
        {keys.map((k) => {
          const ok = data?.present?.[k]
          return (
            <li key={k} style={{ color: ok ? '#0a7' : '#c00' }}>
              {ok ? '✔' : '✖'} {k}
            </li>
          )
        })}
      </ul>
    </div>
  )

  return (
    <div style={{ padding: 16, color: '#000' }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#000' }}>Environment Self‑Check</div>
        <div style={{ fontSize: 12, color: '#333' }}>Base: {base}</div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <Button
            text={loading ? 'Checking…' : 'Run Self‑Check'}
            tone="primary"
            mode="ghost"
            disabled={loading}
            onClick={() => runSelfCheck(true)}
          />
          <Button
            text="Copy JSON"
            tone="default"
            mode="ghost"
            disabled={!data || loading}
            onClick={async () => {
              try {
                const text = JSON.stringify(data, null, 2)
                if (navigator?.clipboard?.writeText) {
                  await navigator.clipboard.writeText(text)
                } else {
                  // Fallback
                  const ta = document.createElement('textarea')
                  ta.value = text
                  document.body.appendChild(ta)
                  ta.select()
                  document.execCommand('copy')
                  document.body.removeChild(ta)
                }
                toast.push({ status: 'success', title: 'Copied Self‑Check JSON', closable: true })
              } catch (e: any) {
                toast.push({ status: 'error', title: 'Copy failed', description: String(e?.message || e), closable: true })
              }
            }}
          />
        </div>
      </div>
      {loading && <div>Loading…</div>}
      {err && !loading && (
        <div style={{ color: '#c00' }}>Error: {err}</div>
      )}
      {!loading && !err && data && (
        <div>
          <Section title="Sanity" keys={['SANITY_STUDIO_PROJECT_ID','SANITY_STUDIO_DATASET','SANITY_API_TOKEN']} />
          <Section title="Stripe" keys={['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET']} />
          <Section title="Resend" keys={['RESEND_API_KEY','RESEND_FROM']} />
          <Section title="ShipEngine" keys={['SHIPENGINE_API_KEY']} />
          <Section title="CORS" keys={['CORS_ALLOW','CORS_ORIGIN']} />
          <Section title="Base URL" keys={['SANITY_STUDIO_NETLIFY_BASE']} />
          {data?.extras && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#333' }}>
              <div>Extras:</div>
              <div>PUBLIC_SITE_URL: {data.extras.PUBLIC_SITE_URL || '(unset)'}</div>
              <div>AUTH0_BASE_URL: {data.extras.AUTH0_BASE_URL || '(unset)'}</div>
            </div>
          )}
          {!data.ok && (
            <div style={{ color: '#b26b00', marginTop: 12 }}>
              Some required variables are missing. Update Site settings → Environment variables in Netlify and redeploy.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
