// depth 1 — 동아리 선택. 본문 = 동아리 정보 카드 + 위키 + 일정 미리보기 + 방 목록.
// app/(app)/clubs/[id].tsx의 카드 섹션들을 그대로 재사용한다(로직은 WorkspaceProvider로
// 이전됨). 넓은 화면: 레일 + 320px 동아리 목록(현재 동아리 강조) + 본문.
// 컴팩트 화면: PaneHeader(뒤로 → 동아리 목록) + 본문.
import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import { colors, radius, shadows } from '@/features/ui/theme'
import { useToast } from '@/features/ui/Toast'
import { ClubDetailSkeleton } from '@/features/ui/Skeleton'
import { usePage } from '@/features/wiki/usePage'
import { WikiViewer } from '@/features/wiki/WikiViewer'
import { WikiEditor } from '@/features/wiki/WikiEditor'
import { useEvents, EventPreviewRow } from '@/features/schedule'
import {
  ClubListPane,
  EntityAvatar,
  IconRail,
  JoinByCodeSheet,
  Pane,
  PaneGroup,
  PaneHeader,
  RoomListPane,
  getClubColor,
  useBreakpoint,
  useWorkspaceData,
  useWorkspaceNavigation,
} from '@/features/shell'

type MemberRole = 'owner' | 'admin' | 'member'
const ROLE_LABEL: Record<MemberRole, string> = { owner: '방장', admin: '관리자', member: '멤버' }

export default function WorkspaceClubScreen() {
  const { isCompact } = useBreakpoint()
  const router = useRouter()
  const { clubId, openClub, openRoom, goToClubList } = useWorkspaceNavigation()
  const { clubs, clubsLoading, activeClub, rooms, roomsLoading, setActiveClubId } = useWorkspaceData()

  // WorkspaceProvider는 Stack보다 위에서 한 번만 마운트되기 때문에 자체적으로는
  // clubId param 변경(동아리 A -> B로 push)을 제때 못 읽는다(useWorkspaceData.tsx
  // 주석 참고). 이 화면 자신의 clubId(Stack 바로 아래라 항상 fresh함)를 매 렌더마다
  // Provider에 동기화해서 activeClub/rooms가 항상 올바른 동아리 것을 가리키게 한다.
  useEffect(() => {
    setActiveClubId(clubId)
  }, [clubId, setActiveClubId])

  const [wikiEditorOpen, setWikiEditorOpen] = useState(false)
  const [joinVisible, setJoinVisible] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const { show: showToast, ToastComponent } = useToast()

  const wikiScope = clubId ? { type: 'club' as const, clubId } : { type: 'club' as const, clubId: '' }
  const { page: wikiPage, loading: wikiLoading, error: wikiError, refresh: refreshWiki } = usePage(wikiScope)
  const { events: upcomingEvents, loading: eventsLoading, refresh: refreshEvents } = useEvents({ clubId: clubId ?? '' })

  useFocusEffect(
    useCallback(() => {
      if (clubId) refreshEvents()
    }, [clubId, refreshEvents])
  )

  // 초대 코드는 WorkspaceClub에 포함돼 있지 않아 여기서 가볍게 별도 조회한다.
  useFocusEffect(
    useCallback(() => {
      if (!clubId) return
      let cancelled = false
      supabase
        .from('clubs')
        .select('invite_code')
        .eq('id', clubId)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setInviteCode((data as { invite_code?: string | null } | null)?.invite_code ?? null)
        })
      return () => {
        cancelled = true
      }
    }, [clubId])
  )

  if (!clubId) return null

  const isOwner = activeClub?.role === 'owner'
  const canEdit = activeClub?.role === 'owner' || activeClub?.role === 'admin'
  const color = getClubColor(clubId)
  const firstChar = (activeClub?.name ?? '?')[0]?.toUpperCase() ?? '?'
  const previewEvents = upcomingEvents.slice(0, 3)
  const extraEventCount = upcomingEvents.length - 3

  function handleOpenRoom(roomId: string) {
    openRoom(clubId as string, roomId)
  }

  function handleJoinRoom(roomId: string) {
    const room = rooms.find((r) => r.id === roomId)
    router.push({
      pathname: '/(app)/channels/[id]/join',
      params: { id: roomId, hasPassword: room?.hasPassword ? '1' : '0', channelName: room?.name },
    })
  }

  const mainContent = !activeClub ? (
    <ClubDetailSkeleton />
  ) : (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* ── 동아리 정보 카드 ─────────────────────────────────────────────── */}
      <View style={[styles.card, styles.rowCard]}>
        <EntityAvatar label={firstChar} color={color} size={54} radius={18} textStyle={styles.clubBadgeText} />
        <View style={styles.clubInfoBlock}>
          <Text style={styles.clubNameLarge}>{activeClub.name}</Text>
          <Pressable
            onPress={() => router.push({
              pathname: '/(app)/clubs/members' as any,
              params: { clubId, clubName: activeClub.name, myRole: activeClub.role },
            })}
            hitSlop={4}
          >
            <Text style={[styles.clubMeta, styles.clubMetaLink]}>멤버 {activeClub.memberCount}명</Text>
          </Pressable>
          <Text style={styles.clubMeta}>내 역할 {ROLE_LABEL[activeClub.role]}</Text>
        </View>
        {inviteCode && (
          <Pressable
            style={({ pressed }) => [styles.inviteCodeBtn, pressed && styles.pressed]}
            onPress={() => {
              if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
                navigator.clipboard?.writeText(inviteCode).catch(() => {})
              }
              showToast('초대 코드가 복사됐어요 ✓')
            }}
            accessibilityRole="button"
            accessibilityLabel="초대 코드 복사"
          >
            <Text style={styles.inviteCodeBtnText}>초대 코드</Text>
          </Pressable>
        )}
      </View>

      {/* ── 동아리 위키 ─────────────────────────────────────────────────── */}
      <View style={[styles.card, styles.colCard]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>📌 동아리 위키</Text>
          {canEdit && !wikiEditorOpen && (
            <Pressable onPress={() => setWikiEditorOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="위키 편집">
              <Text style={styles.editLink}>{wikiPage ? '편집' : '작성 시작'}</Text>
            </Pressable>
          )}
        </View>
        {wikiEditorOpen ? (
          <WikiEditor
            visible={wikiEditorOpen}
            scope={wikiScope}
            existingPage={wikiPage}
            onClose={() => setWikiEditorOpen(false)}
            onSaved={() => { refreshWiki(); showToast('위키가 저장됐어요 ✓') }}
          />
        ) : wikiLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : wikiError ? (
          <Pressable onPress={refreshWiki} accessibilityRole="button" accessibilityLabel="위키 다시 불러오기">
            <Text style={styles.wikiError}>{wikiError} 다시 시도</Text>
          </Pressable>
        ) : wikiPage?.content ? (
          <WikiViewer content={wikiPage.content} />
        ) : (
          <Text style={styles.wikiEmpty}>동아리 소개를 작성해보세요.</Text>
        )}
      </View>

      {/* ── 동아리 일정 ─────────────────────────────────────────────────── */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>📅 동아리 일정</Text>
        <View style={styles.sectionActions}>
          {canEdit && (
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/clubs/eventcreate' as any, params: { clubId, clubName: activeClub.name } })}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="일정 추가"
            >
              <Text style={styles.sectionAction}>+ 추가</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push({ pathname: '/(app)/clubs/eventslist' as any, params: { clubId, clubName: activeClub.name } })}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="일정 목록 보기"
          >
            <Text style={styles.sectionAction}>목록 보기</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.eventCard}>
        {eventsLoading ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.eventsLoader} />
        ) : previewEvents.length === 0 ? (
          <View style={styles.eventsEmpty}>
            <Text style={styles.eventsEmptyText}>다가오는 일정이 없어요</Text>
          </View>
        ) : (
          <>
            {previewEvents.map((event) => (
              <EventPreviewRow
                key={event.id}
                event={event}
                onPress={() => router.push({ pathname: '/(app)/clubs/eventdetail' as any, params: { clubId, eventId: event.id } })}
              />
            ))}
            {extraEventCount > 0 && (
              <Pressable
                onPress={() => router.push({ pathname: '/(app)/clubs/eventslist' as any, params: { clubId, clubName: activeClub.name } })}
                style={styles.extraMore}
              >
                <Text style={styles.extraMoreText}>+ {extraEventCount}개 더 보기</Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      {/* ── 방 목록 ─────────────────────────────────────────────────────── */}
      <RoomListPane
        rooms={rooms}
        loading={roomsLoading}
        onOpenRoom={handleOpenRoom}
        onJoinRoom={handleJoinRoom}
        onCreateRoom={() => router.push({ pathname: '/(app)/channels/create', params: { clubId, clubName: activeClub.name } })}
        canCreateRoom={isOwner}
      />
    </ScrollView>
  )

  if (isCompact) {
    return (
      <View style={styles.fill}>
        <ToastComponent />
        <PaneHeader title={activeClub?.name ?? '동아리'} onPressBack={goToClubList} />
        {mainContent}
      </View>
    )
  }

  return (
    <View style={styles.fill}>
      <ToastComponent />
      <JoinByCodeSheet
        visible={joinVisible}
        onClose={() => setJoinVisible(false)}
        onJoined={(name) => showToast(`${name} 동아리에 가입했어요 ✓`)}
      />
      <PaneGroup>
        <IconRail />
        <Pane width={320}>
          <ClubListPane
            clubs={clubs}
            loading={clubsLoading}
            onPressClub={openClub}
            onPressCreateClub={() => router.push('/(app)/clubs/create')}
            onPressJoin={() => setJoinVisible(true)}
            activeClubId={clubId}
          />
        </Pane>
        <View style={styles.fill}>{mainContent}</View>
      </PaneGroup>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: 20, gap: 12, paddingBottom: 48 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 18,
    ...shadows.card,
  },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  colCard: { flexDirection: 'column', gap: 0 },

  clubBadgeText: { fontSize: 24, fontWeight: '800' },
  clubInfoBlock: { gap: 3 },
  clubNameLarge: { fontSize: 17, fontWeight: '800', color: colors.text },
  clubMeta: { fontSize: 13, color: colors.textSecondary },
  clubMetaLink: { color: colors.primary, fontWeight: '600', textDecorationLine: 'underline' },
  inviteCodeBtn: {
    height: 34, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 5,
  },
  inviteCodeBtnText: { fontSize: 13, fontWeight: '700', color: '#4E5968' },

  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  editLink: { fontSize: 13, fontWeight: '600', color: colors.primary },
  wikiEmpty: { fontSize: 13, color: '#A9B1BA', lineHeight: 20 },
  wikiError: { fontSize: 13, color: colors.danger, lineHeight: 20 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  sectionAction: { fontSize: 13, fontWeight: '700', color: colors.primary },

  eventCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    gap: 12,
    ...shadows.card,
  },
  eventsLoader: { marginVertical: 4 },
  eventsEmpty: { paddingVertical: 16, alignItems: 'center' },
  eventsEmptyText: { fontSize: 13, color: '#A9B1BA' },
  extraMore: { alignItems: 'center', paddingVertical: 2 },
  extraMoreText: { fontSize: 13, color: colors.primary, fontWeight: '500' },

  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
})
