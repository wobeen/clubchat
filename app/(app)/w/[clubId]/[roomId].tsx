// depth 2 — 방 선택. 본문 = 방 위키 + 다가오는 일정 + "채팅 열기" 버튼
// (app/(app)/channels/[id]/home.tsx와 동일한 패턴; 채팅 버튼은 여전히 기존
// channels/[id]/chat.tsx 어댑터 경로로 이동한다 — 메인 패널로 채팅을 통합하는 건
// Phase 2 범위).
// 넓은 화면: 레일 + 300px 방 목록(현재 방 강조) + 본문. 컴팩트: PaneHeader(뒤로 → 방 목록) + 본문.
import { useCallback, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/features/auth/useAuth'
import { colors, radius, shadows } from '@/features/ui/theme'
import { useToast } from '@/features/ui/Toast'
import { ChannelHomeSkeleton } from '@/features/ui/Skeleton'
import { usePage } from '@/features/wiki/usePage'
import { WikiViewer } from '@/features/wiki/WikiViewer'
import { WikiEditor } from '@/features/wiki/WikiEditor'
import { useEvents, EventPreviewRow } from '@/features/schedule'
import {
  IconRail,
  Pane,
  PaneGroup,
  PaneHeader,
  RoomListPane,
  useBreakpoint,
  useWorkspaceData,
  useWorkspaceNavigation,
} from '@/features/shell'

export default function WorkspaceRoomScreen() {
  const { isCompact } = useBreakpoint()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { clubId, roomId, openRoom, goUp } = useWorkspaceNavigation()
  const { rooms, roomsLoading, activeClub } = useWorkspaceData()
  const { show: showToast, ToastComponent } = useToast()
  const [wikiEditorOpen, setWikiEditorOpen] = useState(false)

  const room = rooms.find((r) => r.id === roomId) ?? null
  const isRoomOwner = !!user && !!room && room.ownerId === user.id

  const wikiScope = clubId && roomId
    ? { type: 'room' as const, clubId, roomId }
    : { type: 'room' as const, clubId: '', roomId: '' }
  const { page: wikiPage, loading: wikiLoading, error: wikiError, refresh: refreshWiki } = usePage(wikiScope)
  const { events: upcomingEvents, loading: eventsLoading, refresh: refreshEvents } = useEvents({ channelId: roomId ?? '' })

  useFocusEffect(
    useCallback(() => {
      if (roomId) refreshEvents()
    }, [roomId, refreshEvents])
  )

  if (!clubId || !roomId) return null

  const previewEvents = upcomingEvents.slice(0, 3)
  const extraCount = upcomingEvents.length - 3

  function handleOpenRoom(rid: string) {
    openRoom(clubId as string, rid)
  }

  function handleJoinRoom(rid: string) {
    const r = rooms.find((x) => x.id === rid)
    router.push({
      pathname: '/(app)/channels/[id]/join',
      params: { id: rid, hasPassword: r?.hasPassword ? '1' : '0', channelName: r?.name },
    })
  }

  const wikiEditor = (
    <WikiEditor
      visible={wikiEditorOpen}
      scope={wikiScope}
      existingPage={wikiPage}
      onClose={() => setWikiEditorOpen(false)}
      onSaved={() => { refreshWiki(); showToast('위키가 저장됐어요 ✓') }}
    />
  )

  const mainContent = !room && roomsLoading ? (
    <ChannelHomeSkeleton />
  ) : (
    <View style={styles.fill}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 위키 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>📌 방 위키</Text>
            {isRoomOwner && (
              <Pressable onPress={() => setWikiEditorOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="위키 편집">
                <Text style={styles.editLink}>{wikiPage ? '편집' : '작성 시작'}</Text>
              </Pressable>
            )}
          </View>
          {wikiLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : wikiError ? (
            <Pressable onPress={refreshWiki} accessibilityRole="button" accessibilityLabel="위키 다시 불러오기">
              <Text style={styles.wikiError}>{wikiError} 다시 시도</Text>
            </Pressable>
          ) : wikiPage?.content ? (
            <WikiViewer content={wikiPage.content} />
          ) : (
            <Text style={styles.wikiEmpty}>방 소개를 작성해보세요.</Text>
          )}
        </View>

        {/* 일정 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>다가오는 일정</Text>
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/channels/[id]/events/list', params: { id: roomId, channelName: room?.name } })}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="일정 전체 보기"
            >
              <Text style={styles.editLink}>전체 보기</Text>
            </Pressable>
          </View>

          {eventsLoading && <ActivityIndicator size="small" color={colors.primary} style={styles.eventsLoader} />}

          {!eventsLoading && previewEvents.map((event) => (
            <EventPreviewRow
              key={event.id}
              event={event}
              onPress={() => router.push({ pathname: '/(app)/channels/[id]/events/[eventId]/detail', params: { id: roomId, eventId: event.id } })}
            />
          ))}

          {!eventsLoading && extraCount > 0 && (
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/channels/[id]/events/list', params: { id: roomId, channelName: room?.name } })}
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
            onPress={() => router.push({ pathname: '/(app)/channels/[id]/events/create', params: { id: roomId } })}
            accessibilityRole="button"
            accessibilityLabel="새 일정 추가"
          >
            <Text style={styles.addEventBtnText}>+ 일정 추가</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* 채팅 버튼 (고정) */}
      <View style={[styles.chatBar, { paddingBottom: 12 + insets.bottom }]}>
        <Pressable
          style={({ pressed }) => [styles.chatBtn, pressed && styles.pressed]}
          onPress={() => router.push({ pathname: '/(app)/channels/[id]/chat', params: { id: roomId, channelName: room?.name } })}
          accessibilityRole="button"
          accessibilityLabel="채팅 열기"
        >
          <Text style={styles.chatBtnText}>💬  채팅 열기</Text>
          {room && room.unreadCount > 0 && (
            <View style={styles.chatUnreadBadge}>
              <Text style={styles.chatUnreadText}>{room.unreadCount > 99 ? '99+' : String(room.unreadCount)}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  )

  if (isCompact) {
    return (
      <View style={styles.fill}>
        <ToastComponent />
        {wikiEditor}
        <PaneHeader title={room?.name ?? '방'} onPressBack={goUp} />
        {mainContent}
      </View>
    )
  }

  return (
    <View style={styles.fill}>
      <ToastComponent />
      {wikiEditor}
      <PaneGroup>
        <IconRail />
        <Pane width={300}>
          <ScrollView style={styles.fill} contentContainerStyle={styles.listScrollContent} showsVerticalScrollIndicator={false}>
            <RoomListPane
              rooms={rooms}
              loading={roomsLoading}
              onOpenRoom={handleOpenRoom}
              onJoinRoom={handleJoinRoom}
              onCreateRoom={() => router.push({ pathname: '/(app)/channels/create', params: { clubId, clubName: activeClub?.name } })}
              canCreateRoom={activeClub?.role === 'owner'}
              activeRoomId={roomId}
            />
          </ScrollView>
        </Pane>
        <View style={styles.fill}>{mainContent}</View>
      </PaneGroup>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 24 },
  listScrollContent: { padding: 16, gap: 10, backgroundColor: colors.background },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 18,
    gap: 12,
    ...shadows.card,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  editLink: { fontSize: 13, fontWeight: '600', color: colors.primary },
  wikiEmpty: { fontSize: 13, color: '#A9B1BA', lineHeight: 20 },
  wikiError: { fontSize: 13, color: colors.danger, lineHeight: 20 },

  eventsLoader: { marginVertical: 8 },
  eventsEmpty: { fontSize: 13, color: '#A9B1BA', textAlign: 'center', paddingVertical: 8 },
  extraMore: { alignItems: 'center', paddingVertical: 4 },
  extraMoreText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  addEventBtn: {
    height: 40, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  addEventBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },

  chatBar: {
    padding: 12,
    paddingHorizontal: 20,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  chatBtn: {
    height: 54, borderRadius: 18, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
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
