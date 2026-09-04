// ─── 반응형 셸 레이아웃 프리미티브 ───────────────────────────────────────────────
// <PaneGroup>은 넓은 화면에서 자식들을 가로로 나란히 배치하는 얇은 래퍼일 뿐이다.
//
// 설계 메모(컴팩트 모드 처리 방식): PaneGroup 자체는 "activeIndex" 같은 prop을
// 받지 않는다. 이 프로젝트의 실제 사용 패턴은 각 라우트 파일(app/(app)/w/**)이
// useBreakpoint().isCompact를 이미 최상위에서 분기해서, 컴팩트일 때는 PaneGroup을
// 아예 렌더링하지 않고 단일 패널(ClubListPane 등)만 직접 렌더링하기 때문이다
// (스펙의 "On isCompact: just <ClubListPane .../> full width" 참고).
// 그래도 방어적으로 PaneGroup이 컴팩트 모드에서 호출되는 경우를 대비해,
// 그때는 마지막 자식 하나만 렌더링한다(호출부가 "메인 콘텐츠"를 보통 마지막에
// 배치하는 관례를 따름).

import { Children, ReactNode } from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'
import { colors } from '../ui/theme'
import { useBreakpoint } from './useBreakpoint'

interface PaneGroupProps {
  children: ReactNode
  style?: ViewStyle
}

export function PaneGroup({ children, style }: PaneGroupProps) {
  const { isCompact } = useBreakpoint()

  if (isCompact) {
    const list = Children.toArray(children)
    return <View style={[styles.compactGroup, style]}>{list[list.length - 1] ?? null}</View>
  }

  return <View style={[styles.row, style]}>{children}</View>
}

interface PaneProps {
  width?: number
  children: ReactNode
  style?: ViewStyle
}

export function Pane({ width, children, style }: PaneProps) {
  const { isCompact } = useBreakpoint()

  if (isCompact) {
    return <View style={[styles.paneCompact, style]}>{children}</View>
  }

  return (
    <View style={[styles.pane, width != null ? { width } : null, style]}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  compactGroup: { flex: 1 },
  pane: {
    flexGrow: 0,
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  paneCompact: { flex: 1 },
})
