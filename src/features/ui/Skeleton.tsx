import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View, ViewStyle } from 'react-native'

function SkeletonBlock({ style }: { style?: ViewStyle }) {
  const opacity = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  return <Animated.View style={[styles.block, style, { opacity }]} />
}

// ── 동아리 홈 (w/[clubId]/index.tsx) 스켈레톤 ────────────────────────────────

export function ClubDetailSkeleton() {
  return (
    <View style={styles.container}>
      <View style={styles.list}>
        {/* 위키 카드 */}
        <View style={[styles.card, { flexDirection: 'column', gap: 10, padding: 16 }]}>
          <SkeletonBlock style={{ height: 20, borderRadius: 6, width: '50%' }} />
          <SkeletonBlock style={{ height: 13, borderRadius: 5, width: '100%' }} />
          <SkeletonBlock style={{ height: 13, borderRadius: 5, width: '80%' }} />
          <SkeletonBlock style={{ height: 13, borderRadius: 5, width: '90%' }} />
        </View>
        {/* 방 카드 3개 */}
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.card}>
            <View style={{ flex: 1, gap: 8 }}>
              <SkeletonBlock style={{ height: 15, borderRadius: 6, width: '50%' }} />
            </View>
            <SkeletonBlock style={{ height: 32, width: 56, borderRadius: 10 }} />
          </View>
        ))}
      </View>
    </View>
  )
}

// ── 방 홈 (channels/[id]/home.tsx) 스켈레톤 ─────────────────────────────────

export function ChannelHomeSkeleton() {
  return (
    <View style={[styles.container, { padding: 16, gap: 16 }]}>
      {/* 위키 카드 */}
      <View style={[styles.card, { flexDirection: 'column', gap: 10, padding: 16 }]}>
        <SkeletonBlock style={{ height: 18, borderRadius: 6, width: '45%' }} />
        <SkeletonBlock style={{ height: 13, borderRadius: 5, width: '100%' }} />
        <SkeletonBlock style={{ height: 13, borderRadius: 5, width: '75%' }} />
      </View>
      {/* 일정 카드 */}
      <View style={[styles.card, { flexDirection: 'column', gap: 10, padding: 16 }]}>
        <SkeletonBlock style={{ height: 16, borderRadius: 6, width: '30%' }} />
        <SkeletonBlock style={{ height: 50, borderRadius: 10, width: '100%' }} />
        <SkeletonBlock style={{ height: 50, borderRadius: 10, width: '100%' }} />
      </View>
      {/* 채팅 버튼 */}
      <SkeletonBlock style={{ height: 52, borderRadius: 14, width: '100%' }} />
    </View>
  )
}

const styles = StyleSheet.create({
  block: { backgroundColor: '#D1D5DB', borderRadius: 6 },
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardAvatar: { width: 44, height: 44, borderRadius: 12 },
})
