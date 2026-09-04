// ─── /w 패널 전용 헤더 바 ────────────────────────────────────────────────────────
// 셸 밖의 나머지 화면(관리/초대/멤버/검색/입장/생성/가입신청/일정 CRUD 등)은 기존
// 네이티브 스택 헤더(headerBackTitle)를 그대로 쓴다. 이 컴포넌트는 /w 패널 내부에서만
// 쓰는 커스텀 헤더로, 두 헤더 시스템이 공존하되 담당 영역이 겹치지 않게 한다.

import { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../ui/theme'

interface PaneHeaderProps {
  title: string
  onPressBack?: () => void
  rightSlot?: ReactNode
}

export function PaneHeader({ title, onPressBack, rightSlot }: PaneHeaderProps) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.left}>
        {onPressBack && (
          <Pressable
            onPress={onPressBack}
            hitSlop={10}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="뒤로"
          >
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
        )}
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>
      {rightSlot != null && <View style={styles.right}>{rightSlot}</View>}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backChevron: { fontSize: 28, color: colors.text, fontWeight: '400', marginTop: -2 },
  title: { fontSize: 17, fontWeight: '800', color: colors.text, flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
