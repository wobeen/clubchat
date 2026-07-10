import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { EventWithMyResponse } from './types'

const STATUS_COLOR = { going: '#1FA65A', not_going: '#E5484D', maybe: '#8B95A1' } as const
const STATUS_LABEL = { going: '참석', not_going: '불참', maybe: '미정' } as const

export function getMonthDay(iso: string) {
  const d = new Date(iso)
  return { month: `${d.getMonth() + 1}월`, day: String(d.getDate()) }
}

export function formatEventTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const ampm = h < 12 ? '오전' : '오후'
  return `${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]} ${ampm} ${h % 12 || 12}:${m}`
}

export function isUpcomingSoon(iso: string): boolean {
  const diff = new Date(iso).getTime() - Date.now()
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000
}

export function EventPreviewRow({
  event,
  onPress,
}: {
  event: EventWithMyResponse
  onPress: () => void
}) {
  const { month, day } = getMonthDay(event.starts_at)
  const upcoming = isUpcomingSoon(event.starts_at)
  const status = event.myStatus

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`일정: ${event.title}`}
    >
      <View style={[styles.dateTile, upcoming ? styles.dateTilePrimary : styles.dateTileGray]}>
        <Text style={[styles.dateTileMonth, upcoming ? styles.dateTileMonthPrimary : styles.dateTileMonthGray]}>{month}</Text>
        <Text style={[styles.dateTileDay, upcoming ? styles.dateTileDayPrimary : styles.dateTileDayGray]}>{day}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
        <Text style={styles.time}>{formatEventTime(event.starts_at)}{event.location ? ` · ${event.location}` : ''}</Text>
      </View>
      {status ? (
        <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[status] + '22' }]}>
          <Text style={[styles.statusPillText, { color: STATUS_COLOR[status] }]}>{STATUS_LABEL[status]}</Text>
        </View>
      ) : (
        <View style={[styles.statusPill, { backgroundColor: '#F2F4F6' }]}>
          <Text style={[styles.statusPillText, { color: '#8B95A1' }]}>미응답</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pressed: { opacity: 0.7 },
  dateTile: {
    width: 48, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dateTilePrimary: { backgroundColor: '#E7EFFF' },
  dateTileGray: { backgroundColor: '#F2F4F6' },
  dateTileMonth: { fontSize: 11, fontWeight: '700' },
  dateTileMonthPrimary: { color: '#3B7DD8' },
  dateTileMonthGray: { color: '#6B7684' },
  dateTileDay: { fontSize: 19, fontWeight: '800', lineHeight: 22 },
  dateTileDayPrimary: { color: '#3B7DD8' },
  dateTileDayGray: { color: '#6B7684' },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700', color: '#191F28' },
  time: { fontSize: 13, color: '#8B95A1' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusPillText: { fontSize: 12, fontWeight: '700' },
})
