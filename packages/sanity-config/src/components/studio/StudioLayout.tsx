import {useEffect} from 'react'
import type {LayoutProps} from 'sanity'
import PaneLimiter from './PaneLimiter'

export default function StudioLayout(props: LayoutProps) {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined
    }

    const {body} = document
    body.classList.add('sanity-studio-theme')

    let bridgeScript: HTMLScriptElement | null = null
    const bridgeSrc = 'https://core.sanity-cdn.com/bridge.js'
    const existingBridge = document.head.querySelector<HTMLScriptElement>('script[data-sanity-bridge]')
    if (!existingBridge) {
      bridgeScript = document.createElement('script')
      bridgeScript.src = bridgeSrc
      bridgeScript.type = 'module'
      bridgeScript.async = true
      bridgeScript.setAttribute('data-sanity-bridge', 'true')
      document.head.appendChild(bridgeScript)
    }

    return () => {
      body.classList.remove('sanity-studio-theme')
      if (bridgeScript && bridgeScript.parentNode) {
        bridgeScript.parentNode.removeChild(bridgeScript)
      }
    }
  }, [])

  return (
    <>
      <PaneLimiter maxPanes={2} />
      {props.renderDefault(props)}
    </>
  )
}
