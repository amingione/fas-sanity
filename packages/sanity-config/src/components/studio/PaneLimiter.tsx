import {useEffect, useMemo} from 'react'
import {useRouter, useRouterState} from 'sanity/router'

interface PaneLimiterProps {
  maxPanes?: number
}

export default function PaneLimiter({maxPanes = 2}: PaneLimiterProps) {
  const router = useRouter()
  const routerState = useRouterState()

  const panes = useMemo(() => {
    const deskState = routerState?.panes
    return Array.isArray(deskState) ? deskState : null
  }, [routerState])

  useEffect(() => {
    if (!panes || panes.length <= maxPanes) return

    const total = panes.length
    const activeIndex = Math.max(0, total - 1)
    const start = Math.max(0, Math.min(activeIndex - maxPanes + 1, total - maxPanes))
    const nextGroups = panes.slice(start, start + maxPanes)

    if (nextGroups.length !== panes.length) {
      router.navigate(
        {
          ...routerState,
          panes: nextGroups,
        },
        {replace: true},
      )
    }
  }, [panes, maxPanes, router, routerState])

  return null
}
