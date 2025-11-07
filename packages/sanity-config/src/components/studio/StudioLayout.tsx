import {useEffect} from 'react'
import type {LayoutProps} from 'sanity'
import {StyleSheetManager} from 'styled-components'
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

  const shouldForwardProp = (propName: string, elementToBeCreated: unknown) => {
    if (typeof elementToBeCreated === 'string' && propName === 'tone') {
      return false
    }
    return true
  }

  return (
    <StyleSheetManager shouldForwardProp={shouldForwardProp}>
      <>
        <PaneLimiter maxPanes={2} />
        {props.renderDefault(props)}
      </>
    </StyleSheetManager>
  )
}
