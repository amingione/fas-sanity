/// <reference types="react" />
import React from 'react'

type Props = {
  inline?: boolean
  language?: string
  value?: string
  className?: string
  markers?: unknown
}

// Minimal stub for `react-refractor` to avoid runtime crashes in dev when
// bundling/CJS interop misdetects the default export. This renders a plain
// <code> or <pre><code> block and exposes the static helpers that Sanity calls.
function Refractor(props: Props) {
  const {inline, value, className, language} = props
  const codeEl = (
    <code className={[className, language ? `language-${language}` : ''].filter(Boolean).join(' ')}>
      {String(value ?? '')}
    </code>
  )
  if (inline) return codeEl
  return <pre className={[className, 'refractor'].filter(Boolean).join(' ')}>{codeEl}</pre>
}

const registered = new Set<string>()
;(Refractor as any).registerLanguage = (lang: {
  displayName?: string
  alias?: string | string[]
}) => {
  // Accept language modules but only record their displayName/alias to satisfy hasLanguage checks
  const names: string[] = []
  if (lang && typeof lang === 'object') {
    if (typeof (lang as any).displayName === 'string') names.push((lang as any).displayName)
    const alias = (lang as any).alias
    if (typeof alias === 'string') names.push(alias)
    else if (Array.isArray(alias)) names.push(...alias.filter((s) => typeof s === 'string'))
  }
  for (const n of names) if (n) registered.add(n)
}
;(Refractor as any).hasLanguage = (name: string) => registered.has(name)

export default Refractor as unknown as {
  (props: Props): React.ReactElement
  registerLanguage: (lang: any) => void
  hasLanguage: (name: string) => boolean
}
