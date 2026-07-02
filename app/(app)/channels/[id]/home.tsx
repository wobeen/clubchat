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
import { formatDatetime, STATUS_COLOR, STATUS_LABEL } from '../../../../src/features/schedule/scheduleUtils'
import type { EventWithMyResponse } from '../../../../src/features/schedule'

interface ChannelInfo {
  id: string
  name: string
  club_id: string
  owner_id: string
}

type LoadState = 'loading' | 'error' | 'ready'

// ─── 인라인 일정 카드 ─────────────────────────────────────────────────────────

function EventRow({ event, onPress }: { event: EventWithMyResponse; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.eventRow, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`일정: ${event.title}`}
    >
      <View style={styles.eventAccent} />
      <View style={styles.eventRowContent}>
        <View style={styles.eventRowHeader}>
          <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
          {event.myStatus ? (
            <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[event.myStatus] }]}>
              <Text style={styles.statusPillText}>{STATUS_LABEL[event.myStatus]}</Text>
            </View>
          ) : (
            <View style={[styles.statusPill, styles.statusPillNone]}>
              <Text style={[styles.statusPillText, styles.statusPillTextNone]}>미응답</Text>
            </View>
          )}
        </View>
        <Text style={styles.eventDate}>{formatDatetime(event.starts_at)}</Text>
        {event.location ? (
          <Text style={styles.eventLocation} numberOfLines={1}>{event.location}</Text>
        ) : null}
      </View>
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

  // ── 채널 정보 로드 ────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (!id) return
      let cancelled = false

      async function load() {
        const { data, error } = await supabase
          .from('channels')
          .select('id, name, club_id, owner_id')
          .eq('id', id)
          .single()

        if (cancelled) return

        if (error || !data) {
          setErrorMsg('방 정보를 불러오는 데 실패했습니다.')
          setLoadState('error')
          return
        }

        navigation.setOptions({ title: data.name, headerBackTitle: '뒤로' })
        setChannel(data as ChannelInfo)
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
  const { events: upcomingEvents, loading: eventsLoading, refresh: refreshEvents } = useEvents(id ?? '')

  // 화면 포커스 시 일정 새로고침 (일정 생성/수정 후 돌아올 때 반영)
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
      Alert.alert('방장은 나갈 수 없습니다', '방장은 이 방에서 나갈 수 없습니다. 방 관리에서 삭제하거나 다른 멤버에게 이관하세요.')
      return
    }
    Alert.alert('방 나가기', '이 방에서 나갈까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '나가기', style: 'destructive', onPress: async () => {
          const { error } = await supabase
            .from('channel_members')
            .delete()
            .eq('channel_id', channel.id)
            .eq('user_id', session.user.id)
          if (error) {
            Alert.alert('오류', '방을 나갈 수 없습니다.')
          } else {
            router.back()
          }
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
          <Text style={{ color: '#EF4444', fontSize: 14, fontWeight: '500' }}>나가기</Text>
        </Pressable>
      ),
    })
  }, [channel, handleLeave])

  // ── 로딩 / 에러 ──────────────────────────────────────────────────────────
  if (loadState === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    )
  }

  if (loadState === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{errorMsg}</Text>
      </View>
    )
  }

  const previewEvents = upcomingEvents.slice(0, 3)
  const extraCount = upcomingEvents.length - 3

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <WikiEditor
        visible={wikiEditorOpen}
        scope={wikiScope}
        existingPage={wikiPage}
        onClose={() => setWikiEditorOpen(false)}
        onSaved={refreshWiki}
      />

      {/* 위키 */}
      <View style={styles.card}>
        <WikiViewer content={wikiPage?.content ?? ''} />
        {isChannelOwner && (
          <Pressable
            onPress={() => setWikiEditorOpen(true)}
            style={({ pressed }) => [styles.editWikiBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="위키 편집"
          >
            <Text style={styles.editWikiBtnText}>
              {wikiPage ? '편집' : '위키 작성 시작'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* 일정 */}
      <View style={styles.card}>
        {/* 섹션 헤더 */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📅  일정</Text>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(app)/channels/[id]/events/list',
                params: { id, channelName: channel?.name },
              })
            }
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="일정 전체 보기"
          >
            <Text style={styles.viewAllLink}>전체 보기</Text>
          </Pressable>
        </View>

        {/* 로딩 */}
        {eventsLoading && (
          <ActivityIndicator size="small" color="#6366f1" style={styles.eventsLoader} />
        )}

        {/* 일정 목록 (최대 3개) */}
        {!eventsLoading && previewEvents.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            onPress={() =>
              router.push({
                pathname: '/(app)/channels/[id]/events/[eventId]/detail',
                params: { id, eventId: event.id },
              })
            }
          />
        ))}

        {/* 3개 초과 알림 */}
        {!eventsLoading && extraCount > 0 && (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(app)/channels/[id]/events/list',
                params: { id, channelName: channel?.name },
              })
            }
            style={styles.extraMore}
          >
            <Text style={styles.extraMoreText}>+ {extraCount}개 더 보기</Text>
          </Pressable>
        )}

        {/* 빈 상태 */}
        {!eventsLoading && upcomingEvents.length === 0 && (
          <Text style={styles.eventsEmpty}>다가오는 일정이 없어요</Text>
        )}

        {/* 일정 추가 버튼 */}
        <Pressable
          style={({ pressed }) => [styles.addEventBtn, pressed && styles.pressed]}
          onPress={() =>
            router.push({
              pathname: '/(app)/channels/[id]/events/create',
              params: { id },
            })
          }
          accessibilityRole="button"
          accessibilityLabel="새 일정 추가"
        >
          <Text style={styles.addEventBtnText}>+ 일정 추가</Text>
        </Pressable>
      </View>

      {/* 채팅 */}
      <Pressable
        style={({ pressed }) => [styles.chatBtn, pressed && styles.pressed]}
        onPress={() =>
          router.push({
            pathname: '/(app)/channels/[id]/chat',
            params: { id, channelName: channel?.name },
          })
        }
        accessibilityRole="button"
        accessibilityLabel="채팅 열기"
      >
        <Text style={styles.chatBtnText}>💬  채팅</Text>
      </Pressable>
    </ScrollView>
  )
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 15, color: '#DC2626', textAlign: 'center' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    gap: 10,
  },

  // 위키 편집 버튼
  editWikiBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  editWikiBtnText: { fontSize: 13, fontWeight: '500', color: '#374151' },

  // 일정 섹션 헤더
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  viewAllLink: { fontSize: 13, color: '#4A90D9', fontWeight: '500' },

  eventsLoader: { marginVertical: 8 },

  // 일정 행
  eventRow: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    overflow: 'hidden',
  },
  eventAccent: { width: 4, backgroundColor: '#6366f1' },
  eventRowContent: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, gap: 3 },
  eventRowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  eventDate: { fontSize: 12, color: '#6B7280' },
  eventLocation: { fontSize: 12, color: '#9CA3AF' },

  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
  },
  statusPillNone: { backgroundColor: '#E5E7EB' },
  statusPillText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF' },
  statusPillTextNone: { color: '#6B7280' },

  eventsEmpty: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 8 },

  extraMore: { alignItems: 'center', paddingVertical: 4 },
  extraMoreText: { fontSize: 13, color: '#4A90D9', fontWeight: '500' },

  // 일정 추가 버튼
  addEventBtn: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  addEventBtnText: { fontSize: 14, fontWeight: '600', color: '#6366f1' },

  // 채팅 버튼
  chatBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  pressed: { opacity: 0.7 },
})
