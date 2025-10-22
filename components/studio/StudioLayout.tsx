import {useEffect} from 'react'
import type {LayoutProps} from 'sanity'

export default function StudioLayout(props: LayoutProps) {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined
    }

    const {body} = document
    body.classList.add('sanity-studio-theme')

    return () => {
      body.classList.remove('sanity-studio-theme')
    }
  }, [])

  return props.renderDefault(props)
}
