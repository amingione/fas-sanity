import {useEffect} from 'react'
import type {StudioLayoutProps} from 'sanity'

export default function StudioLayout(props: StudioLayoutProps) {
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
