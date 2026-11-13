import { useEffect, useState } from 'react'
import { AccessibilityInfo, Platform } from 'react-native'

export function useReducedTransparency() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (Platform.OS === 'web') {
      const mq = window.matchMedia('(prefers-reduced-transparency: reduce)')
      setReduced(mq.matches)
      const onChange = () => setReduced(mq.matches)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }

    let remove = () => {}
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((value) => setReduced(!!value))
      .catch(() => {})
    const sub = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', setReduced)
    if (sub && typeof sub.remove === 'function') remove = () => sub.remove()
    return () => remove()
  }, [])

  return reduced
}
