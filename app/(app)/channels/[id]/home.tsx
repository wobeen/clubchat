import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { supabase } from '../../../../src/lib/supabase'
import { useAuth } from '../../../../src/features/auth/useAuth'
import { usePage } from '../../../../src/features/wiki/usePage'
import { WikiViewer } from '../../../../src/features/wiki/WikiViewer'
import { WikiEditor } from '../../../../src/features/wiki/WikiEditor'
import { useEvents } from '../../../../src/features/schedule'
import type { EventWithMyResponse } from '../../../../src/features/schedule'
import { ChannelHomeSkeleton } from '../../../../src/features/ui/Skeleton'
import { useToast } from '../../../../src/features/ui/Toast'

interface ChannelInfo {
  id: string
  name: string
  club_id: string
  owner_id: string
}

type LoadState = 'loading' | 'error' | 'ready'

// ─── 날짜 타일 일정 행 ────────────────────────────────────────────────────────

const STATUS_COLOR = { going: '#1FA65A', not_going: '#E5484D', maybe: '#8B95A1' } as const
const STATUS_LABEL = { going: '참석', not_going: '불참', maybe: '미정' } as const

function getMonthDay(iso: string) {
  const d = new Date(iso)
  return { month: `${d.getMonth() + 1}월`, day: String(d.getDate()), weekday: ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] }
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const ampm = h < 12 ? '오전' : '오후'
  return `${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]} ${ampm} ${h % 12 || 12}:${m}`
}

function isUpcoming(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000
}

function EventTileRow({ event, onPress }: { event: EventWithMyResponse; onPress: () => void }) {
  const { month, day } = getMonthDay(event.starts_at)
  const upcoming = isUpcoming(event.starts_at)
  const status = event.myStatus

  return (
    <Pressable
      style={({ pressed }) => [styles.eventRow, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`일정: ${event.title}`}
    >
      <View style={[styles.dateTile, upcoming ? styles.dateTilePrimary : styles.dateTileGray]}>
        <Text style={[styles.dateTileMonth, upcoming ? styles.dateTileMonthPrimary : styles.dateTileMonthGray]}>{month}</Text>
        <Text style={[styles.dateTileDay, upcoming ? styles.dateTileDayPrimary : styles.dateTileDayGray]}>{day}</Text>
      </View>
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
        <Text style={styles.eventTime}>{formatTime(event.starts_at)}{event.location ? ` · ${event.location}` : ''}</Text>
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

// ─── 화면 ─────────────────────────────────────────────────────────────────────

export default function ChannelHomeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuth()
  const router = useRouter()
  const navigation = useNavigation()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [channel, setChannel] = useState<ChannelInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [wikiEditorOpen, setWikiEditorOpen] = useState(false)
  const [chatUnread, setChatUnread] = useState(0)
  const { show: showToast, ToastComponent } = useToast()

  // ── 채널 정보 로드 ────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (!id) return
      let cancelled = false

      async function load() {
        const [channelResult, unreadResult] = await Promise.all([
          supabase.from('channels').select('id, name, club_id, owner_id').eq('id', id).single(),
          (supabase as any).rpc('get_unread_counts', { p_channel_ids: [id] }),
        ])

        if (cancelled) return

        if (channelResult.error || !channelResult.data) {
          setErrorMsg('방 정보를 불러오는 데 실패했습니다.')
          setLoadState('error')
          return
        }

        const data = channelResult.data as ChannelInfo
        navigation.setOptions({ title: data.name, headerBackTitle: '뒤로' })
        setChannel(data)

        const unreadRows = (unreadResult.data ?? []) as Array<{ channel_id: string; unread_count: number }>
        setChatUnread(Number(unreadRows[0]?.unread_count ?? 0))

        setLoadState('ready')
      }

      load()
      return () => { cancelled = true }
    }, [id])
  )

  // ── 위키 ─────────────────────────────────────────────────────────────────
  const wikiScope = channel
    ? { type: 'room' as const, clubId: channel.club_id, roomId: channel.id }
    : { type: 'room' as const, clubId: '', roomId: '' }
  const { page: wikiPage, refresh: refreshWiki } = usePage(wikiScope)

  // ── 일정 ─────────────────────────────────────────────────────────────────
  const { events: upcomingEvents, loading: eventsLoading, refresh: refreshEvents } = useEvents({ channelId: id ?? '' })

  useFocusEffect(
    useCallback(() => {
      if (id) refreshEvents()
    }, [id, refreshEvents])
  )

  // ── 방 퇴장 ──────────────────────────────────────────────────────────────
  const isChannelOwner = !!session?.user && channel?.owner_id === session.user.id

  const handleLeave = useCallback(async () => {
    if (!channel || !session?.user) return
    if (isChannelOwner) {
      Alert.alert('방장은 나갈 수 없습니다', '방장 권한을 이전하거나 방을 삭제하세요.')
      return
    }
    Alert.alert('방 나가기', '이 방에서 나갈까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '나가기', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('channel_members').delete()
            .eq('channel_id', channel.id).eq('user_id', session.user.id)
          if (error) Alert.alert('오류', '방을 나갈 수 없습니다.')
          else router.back()
        },
      },
    ])
  }, [channel, session?.user?.id, isChannelOwner, router])

  useEffect(() => {
    if (!channel) return
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={handleLeave}
          style={{ paddingHorizontal: 16, paddingVertical: 8 }}
          accessibilityRole="button"
          accessibilityLabel="방 나가기"
        >
          <Text style={{ color: '#E5484D', fontSize: 13, fontWeight: '600' }}>나가기</Text>
        </Pressable>
      ),
    })
  }, [channel, handleLeave])

  // ── 로딩 / 에러 ──────────────────────────────────────────────────────────
  if (loadState === 'loading') return <ChannelHomeSkeleton />

  if (loadState === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{errorMsg}</Text>
        <Pressable style={styles.retryBtn} onPress={() => setLoadState('loading')}>
          <Text style={styles.retryBtnText}>다시 시도</Text>
        </Pressable>
      </View>
    )
  }

  const previewEvents = upcomingEvents.slice(0, 3)
  const extraCount = upcomingEvents.length - 3

  return (
    <View style={styles.container}>
      <ToastComponent />
      <WikiEditor
        visible={wikiEditorOpen}
        scope={wikiScope}
        existingPage={wikiPage}
        onClose={() => setWikiEditorOpen(false)}
        onSaved={() => { refreshWiki(); showToast('위키가 저장됐어요 ✓') }}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 위키 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>📌 방 위키</Text>
            {isChannelOwner && (
              <Pressable onPress={() => setWikiEditorOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="위키 편집">
                <Text style={styles.editLink}>{wikiPage ? '편집' : '작성 시작'}</Text>
              </Pressable>
            )}
          </View>
          {wikiPage?.content
            ? <WikiViewer content={wikiPage.content} />
            : <Text style={styles.wikiEmpty}>방 소개를 작성해보세요.</Text>}
        </View>

        {/* 일정 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>다가오는 일정</Text>
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/channels/[id]/events/list', params: { id, channelName: channel?.name } })}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="일정 전체 보기"
            >
              <Text style={styles.editLink}>전체 보기</Text>
            </Pressable>
          </View>

          {eventsLoading && <ActivityIndicator size="small" color="#3B7DD8" style={styles.eventsLoader} />}

          {!eventsLoading && previewEvents.map((event) => (
            <EventTileRow
              key={event.id}
              event={event}
              onPress={() => router.push({ pathname: '/(app)/channels/[id]/events/[eventId]/detail', params: { id, eventId: event.id } })}
            />
          ))}

          {!eventsLoading && extraCount > 0 && (
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/channels/[id]/events/list', params: { id, channelName: channel?.name } })}
              style={styles.extraMore}
            >
              <Text style={styles.extraMoreText}>+ {extraCount}개 더 보기</Text>
            </Pressable>
          )}

          {!eventsLoading && upcomingEvents.length === 0 && (
            <Text style={styles.eventsEmpty}>다가오는 일정이 없어요</Text>
          )}

          <Pressable
            style={({ pressed }) => [styles.addEventBtn, pressed && styles.pressed]}
            onPress={() => router.push({ pathname: '/(app)/channels/[id]/events/create', params: { id } })}
            accessibilityRole="button"
            accessibilityLabel="새 일정 추가"
          >
            <Text style={styles.addEventBtnText}>+ 일정 추가</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* 채팅 버튼 (고정) */}
      <View style={styles.chatBar}>
        <Pressable
          style={({ pressed }) => [styles.chatBtn, pressed && styles.pressed]}
          onPress={() => router.push({ pathname: '/(app)/channels/[id]/chat', params: { id, channelName: channel?.name } })}
          accessibilityRole="button"
          accessibilityLabel="채팅 열기"
        >
          <Text style={styles.chatBtnText}>💬  채팅 열기</Text>
          {chatUnread > 0 && (
            <View style={styles.chatUnreadBadge}>
              <Text style={styles.chatUnreadText}>{chatUnread > 99 ? '99+' : String(chatUnread)}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  )
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 24 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  errorText: { fontSize: 15, color: '#E5484D', textAlign: 'center', marginBottom: 20 },
  retryBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, backgroundColor: '#3B7DD8' },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  // 카드
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: 'rgba(25,31,40,1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#191F28' },
  editLink: { fontSize: 13, fontWeight: '600', color: '#3B7DD8' },
  wikiEmpty: { fontSize: 13, color: '#A9B1BA', lineHeight: 20 },

  // 일정
  eventsLoader: { marginVertical: 8 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
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
  eventInfo: { flex: 1, gap: 2 },
  eventTitle: { fontSize: 15, fontWeight: '700', color: '#191F28' },
  eventTime: { fontSize: 13, color: '#8B95A1' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  eventsEmpty: { fontSize: 13, color: '#A9B1BA', textAlign: 'center', paddingVertical: 8 },
  extraMore: { alignItems: 'center', paddingVertical: 4 },
  extraMoreText: { fontSize: 13, color: '#3B7DD8', fontWeight: '500' },
  addEventBtn: {
    height: 40, borderRadius: 12, borderWidth: 1.5, borderColor: '#3B7DD8',
    alignItems: 'center', justifyContent: 'center',
  },
  addEventBtnText: { fontSize: 14, fontWeight: '600', color: '#3B7DD8' },

  // 채팅 바
  chatBar: {
    padding: 12,
    paddingHorizontal: 20,
    paddingBottom: 34,
    backgroundColor: '#F7F8FA',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EDEFF2',
  },
  chatBtn: {
    height: 54, borderRadius: 18, backgroundColor: '#3B7DD8',
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
    shadowColor: '#3B7DD8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
  },
  chatBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  chatUnreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
  },
  chatUnreadText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
})
