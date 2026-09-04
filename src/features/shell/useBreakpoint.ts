import { useWindowDimensions } from 'react-native'

export type Breakpoint = 'compact' | 'medium' | 'expanded'

export const BREAKPOINTS = { medium: 768, expanded: 1180 } as const

interface UseBreakpointReturn {
  width: number
  bp: Breakpoint
  isCompact: boolean
  isMedium: boolean
  isExpanded: boolean
}

/**
 * 반응형 3-pane 셸(향후 단계)을 위한 화면 폭 기준점.
 * - compact: 폭 < 768 (휴대폰 세로 등, 한 번에 한 pane만 보여줄 폭)
 * - medium: 768 <= 폭 < 1180
 * - expanded: 폭 >= 1180
 */
export function useBreakpoint(): UseBreakpointReturn {
  const { width } = useWindowDimensions()

  const isCompact = width < BREAKPOINTS.medium
  const isExpanded = width >= BREAKPOINTS.expanded
  const isMedium = !isCompact && !isExpanded

  const bp: Breakpoint = isCompact ? 'compact' : isExpanded ? 'expanded' : 'medium'

  return { width, bp, isCompact, isMedium, isExpanded }
}
