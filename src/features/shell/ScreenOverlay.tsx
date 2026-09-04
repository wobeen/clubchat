// ─── 관리성 화면(초대/관리/멤버/검색) 오버레이 래퍼 (Phase 4) ───────────────────────
// 이 화면들은 원래 네이티브 스택 풀스크린 라우트다(app/(app)/_layout.tsx에 등록됨).
// 컴팩트(모바일) 화면에서는 풀스크린 자체가 자연스러운 UX라 그대로 둔다 — 이 컴포넌트는
// isCompact면 children을 그냥 통과시킨다.
// 넓은 화면(웹/태블릿)에서는 같은 화면 내용을 셸(레일+목록) 위에 뜨는 다이얼로그 카드로
// 보여준다. 방식은 이미 이 코드베이스에서 검증된 MemberProfileCard/ProfileEditSheet와
// 동일한 RN <Modal transparent>(각 플랫폼에서 검증된 오버레이 프리미티브) — 라우트
// 자체를 모달 프레젠테이션으로 바꾸는 실험적인 방법 대신, 화면 컴포넌트 안에서 조건부로
// Modal로 감싸는 이미 검증된 패턴을 그대로 재사용한다.
//
// 사용법(각 화면 파일에서): 기존 `export default function XScreen() {...}` 본문은
// 그대로 두고 이름만 `XScreenContent`로 바꾼 뒤, 아래처럼 얇은 래퍼를 새 default export로
// 추가한다:
//   export default function XScreen() {
//     const router = useRouter()
//     return (
//       <ScreenOverlay title="..." onClose={() => router.back()}>
//         <XScreenContent />
//       </ScreenOverlay>
//     )
//   }
// 내부 로직(early return, 로딩/에러 상태 등)은 전혀 건드리지 않아도 된다.

import { ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, shadows } from '../ui/theme'
import { useBreakpoint } from './useBreakpoint'

interface ScreenOverlayProps {
  title: string
  onClose: () => void
  children: ReactNode
  maxWidth?: number
}

export function ScreenOverlay({ title, onClose, children, maxWidth = 480 }: ScreenOverlayProps) {
  const { isCompact } = useBreakpoint()

  if (isCompact) return <>{children}</>

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="배경을 눌러 닫기">
        <Pressable style={[styles.card, { maxWidth }]} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="닫기">
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.body}>{children}</View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(25,31,40,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, flexShrink: 1 },
  closeBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 16, color: colors.textSecondary },
  body: {
    flex: 1,
  },
})
