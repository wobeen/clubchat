import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { supabase } from '../../../src/lib/supabase'
import { useAuth } from '../../../src/features/auth/useAuth'
import { usePage } from '../../../src/features/wiki/usePage'
import { WikiViewer } from '../../../src/features/wiki/WikiViewer'
import { WikiEditor } from '../../../src/features/wiki/WikiEditor'
import { ClubDetailSkeleton } from '../../../src/features/ui/Skeleton'
import { useToast } from '../../../src/features/ui/Toast'

type MemberRole = 'owner' | 'admin' | 'member'

interface ChannelItem {
  id: string
  name: string
  hasPassword: boolean
  ownerId: string
  joined: boolean
  unreadCount: number
}

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; clubName: string; inviteCode: string | null; memberCount: number; channels: ChannelItem[]; myRole: MemberRole | null }

const CLUB_COLORS = [
  { bg: '#E7EFFF', text: '#3B7DD8' },
  { bg: '#E8F7EE', text: '#1FA65A' },
  { bg: '#FDF0E7', text: '#E07A2E' },
  { bg: '#F0EAFB', text: '#7B5CD6' },
  { bg: '#E7F5FB', text: '#2493C6' },
  { bg: '#FBEFF3', text: '#D6588A' },
]

function getClubColor(id: string) {
  let hash = 0
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return CLUB_COLORS[hash % CLUB_COLORS.length]
}

function ChannelRow({
  item,
  isLast,
  onOpen,
  onJoin,
}: {
  item: ChannelItem
  isLast: boolean
  onOpen: () => void
  onJoin: () => void
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.channelRow, !isLast && styles.channelRowBorder, pressed && styles.pressed]}
      onPress={item.joined ? onOpen : onJoin}
      accessibilityRole="button"
      accessibilityLabel={`${item.name} ${item.joined ? '열기' : '입장'}`}
    >
      <View style={[styles.channelIcon, item.hasPassword && styles.channelIconLock]}>
        {item.hasPassword ? (
          <Text style={styles.channelIconLockText}>🔒</Text>
        ) : (
          <Text style={styles.channelIconHash}>#</Text>
        )}
      </View>
      <View style={styles.channelRowInfo}>
        <Text style={styles.channelRowName} numberOfLines={1}>{item.name}</Text>
        {!item.joined && (
          <Text style={styles.channelRowSub}>아직 입장하지 않은 방</Text>
        )}
      </View>
      {item.joined && item.unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>
            {item.unreadCount > 99 ? '99+' : String(item.unreadCount)}
          </Text>
        </View>
      )}
      {!item.joined && (
        <View style={styles.joinBtn}>
          <Text style={styles.joinBtnText}>입장</Text>
        </View>
      )}
    </Pressable>
  )
}

export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuth()
  const router = useRouter()
  const navigation = useNavigation()
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [wikiEditorOpen, setWikiEditorOpen] = useState(false)

  const wikiScope = id ? { type: 'club' as const, clubId: id } : { type: 'club' as const, clubId: '' }
  const { page: wikiPage, refresh: refreshWiki } = usePage(wikiScope)
  const { show: showToast, ToastComponent } = useToast()

  const handleLeave = useCallback(async () => {
    if (!id || !session?.user) return
    Alert.alert('동아리 탈퇴', '이 동아리에서 탈퇴할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '탈퇴', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('memberships').delete()
            .eq('club_id', id).eq('user_id', session.user.id)
          if (error) Alert.alert('오류', '탈퇴할 수 없습니다.')
          else router.replace('/(app)')
        },
      },
    ])
  }, [id, session?.user?.id, router])

  useEffect(() => {
    if (state.status !== 'ready') return
    const { myRole, clubName } = state

    navigation.setOptions({
      title: clubName,
      headerRight: myRole === 'owner' || myRole === 'admin'
        ? () => (
            <Pressable
              onPress={() => router.push({
                pathname: '/(app)/clubs/manage' as any,
                params: { clubId: id, clubName },
              })}
              style={{ paddingHorizontal: 16, paddingVertical: 8 }}
              accessibilityRole="button"
              accessibilityLabel="동아리 관리"
            >
              <Text style={{ color: '#8B95A1', fontSize: 15, fontWeight: '700' }}>관리</Text>
            </Pressable>
          )
        : myRole === 'member'
          ? () => (
              <Pressable
                onPress={handleLeave}
                style={{ paddingHorizontal: 16, paddingVertical: 8 }}
                accessibilityRole="button"
                accessibilityLabel="동아리 탈퇴"
              >
                <Text style={{ color: '#E5484D', fontSize: 14, fontWeight: '500' }}>탈퇴</Text>
              </Pressable>
            )
          : undefined,
    })
  }, [state, handleLeave])

  useFocusEffect(
    useCallback(() => {
      if (!session?.user || !id) return
      let cancelled = false

      async function load() {
        if (!session?.user || !id) return
        setState({ status: 'loading' })

        const [membershipResult, clubResult, channelsResult, myChannelsResult, memberCountResult] = await Promise.all([
          supabase.from('memberships').select('role').eq('club_id', id).eq('user_id', session.user.id).maybeSingle(),
          supabase.from('clubs').select('id, name, invite_code').eq('id', id).single(),
          supabase.from('channels').select('id, name, type, is_password_protected, owner_id, created_at')
            .eq('club_id', id).order('created_at', { ascending: true }),
          supabase.from('channel_members').select('channel_id').eq('user_id', session.user.id),
          supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('club_id', id),
        ])

        if (cancelled) return

        if (clubResult.error || channelsResult.error) {
          setState({ status: 'error', message: '정보를 불러오는 중 오류가 발생했습니다.' })
          return
        }

        const clubData = clubResult.data as { id: string; name: string; invite_code?: string | null }
        const clubName = clubData.name
        const inviteCode = (clubData as any).invite_code ?? null
        const memberCount = memberCountResult.count ?? 0

        const joinedIds = new Set((myChannelsResult.data ?? []).map((cm) => cm.channel_id))
        const myRole = membershipResult.data ? (membershipResult.data.role as MemberRole) : null

        const channelIds = (channelsResult.data ?? []).filter((ch) => joinedIds.has(ch.id)).map((ch) => ch.id)
        let unreadMap: Record<string, number> = {}
        if (channelIds.length > 0) {
          const { data: unreadData } = await (supabase as any).rpc('get_unread_counts', { p_channel_ids: channelIds })
          for (const row of (unreadData ?? []) as Array<{ channel_id: string; unread_count: number }>) {
            unreadMap[row.channel_id] = Number(row.unread_count)
          }
        }

        if (cancelled) return

        const channels: ChannelItem[] = (channelsResult.data ?? []).map((ch) => ({
          id: ch.id,
          name: ch.name,
          hasPassword: ch.is_password_protected ?? false,
          ownerId: ch.owner_id,
          joined: joinedIds.has(ch.id),
          unreadCount: unreadMap[ch.id] ?? 0,
        }))

        setState({ status: 'ready', clubName, inviteCode, memberCount, channels, myRole })

        // Realtime unread badge update
        const rt = supabase.channel('club-unread-' + id)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
            const row = payload.new as { channel_id: string; sender_id: string }
            if (row.sender_id === session?.user?.id) return
            setState((prev) => {
              if (prev.status !== 'ready') return prev
              return {
                ...prev,
                channels: prev.channels.map((ch) =>
                  ch.id === row.channel_id ? { ...ch, unreadCount: ch.unreadCount + 1 } : ch
                ),
              }
            })
          })
          .subscribe()

        return () => { supabase.removeChannel(rt) }
      }

      const cleanup = load()
      return () => {
        cancelled = true
        cleanup?.then((fn) => fn?.())
      }
    }, [id, session?.user?.id])
  )

  function handleOpenChannel(channel: ChannelItem) {
    router.push({
      pathname: '/(app)/channels/[id]/home',
      params: { id: channel.id, channelName: channel.name, clubId: id },
    })
  }

  function handleJoinChannel(channel: ChannelItem) {
    router.push({
      pathname: '/(app)/channels/[id]/join',
      params: { id: channel.id, hasPassword: channel.hasPassword ? '1' : '0', channelName: channel.name },
    })
  }

  if (state.status === 'loading') return <ClubDetailSkeleton />

  if (state.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{state.message}</Text>
        <Pressable style={styles.retryBtn} onPress={() => setState({ status: 'loading' })}>
          <Text style={styles.retryBtnText}>다시 시도</Text>
        </Pressable>
      </View>
    )
  }

  const { clubName, inviteCode, memberCount, channels, myRole } = state
  const isOwner = myRole === 'owner'
  const canEdit = myRole === 'owner' || myRole === 'admin'
  const color = getClubColor(id ?? '')
  const firstChar = clubName[0]?.toUpperCase() ?? '?'

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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── 동아리 정보 카드 ─────────────────────────────────────────────── */}
        <View style={[styles.card, styles.rowCard]}>
          <View style={[styles.clubBadge, { backgroundColor: color.bg }]}>
            <Text style={[styles.clubBadgeText, { color: color.text }]}>{firstChar}</Text>
          </View>
          <View style={styles.clubInfoBlock}>
            <Text style={styles.clubNameLarge}>{clubName}</Text>
            <Pressable
              onPress={() => router.push({
                pathname: '/(app)/clubs/members' as any,
                params: { clubId: id, clubName, myRole: myRole ?? 'member' },
              })}
              hitSlop={4}
            >
              <Text style={[styles.clubMeta, styles.clubMetaLink]}>멤버 {memberCount}명</Text>
            </Pressable>
            <Text style={styles.clubMeta}>내 역할 {ROLE_LABEL[myRole ?? 'member']}</Text>
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
            {canEdit && (
              <Pressable
                onPress={() => setWikiEditorOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="위키 편집"
              >
                <Text style={styles.editLink}>{wikiPage ? '편집' : '작성 시작'}</Text>
              </Pressable>
            )}
          </View>
          {wikiPage?.content
            ? <WikiViewer content={wikiPage.content} />
            : <Text style={styles.wikiEmpty}>동아리 소개를 작성해보세요.</Text>}
        </View>

        {/* ── 동아리 일정 ─────────────────────────────────────────────────── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>📅 동아리 일정</Text>
          <View style={styles.sectionActions}>
            {canEdit && (
              <Pressable
                onPress={() => router.push({
                  pathname: '/(app)/clubs/eventcreate' as any,
                  params: { clubId: id, clubName },
                })}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="일정 추가"
              >
                <Text style={styles.sectionAction}>+ 추가</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push({
                pathname: '/(app)/clubs/eventslist' as any,
                params: { clubId: id, clubName },
              })}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="일정 목록 보기"
            >
              <Text style={styles.sectionAction}>목록 보기</Text>
            </Pressable>
          </View>
        </View>

        {/* ── 방 목록 ─────────────────────────────────────────────────────── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>방 {channels.length}개</Text>
          {isOwner && (
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/channels/create', params: { clubId: id, clubName } })}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="방 만들기"
            >
              <Text style={styles.sectionAction}>+ 방 만들기</Text>
            </Pressable>
          )}
        </View>

        {channels.length === 0 ? (
          <View style={styles.emptyRooms}>
            <Text style={styles.emptyRoomsText}>
              {isOwner ? '아래에서 첫 번째 방을 만들어보세요.' : '방장이 방을 만들면 여기에 표시됩니다.'}
            </Text>
          </View>
        ) : (
          <View style={styles.channelContainer}>
            {channels.map((ch, index) => (
              <ChannelRow
                key={ch.id}
                item={ch}
                isLast={index === channels.length - 1}
                onOpen={() => handleOpenChannel(ch)}
                onJoin={() => handleJoinChannel(ch)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const ROLE_LABEL: Record<MemberRole, string> = { owner: '방장', admin: '관리자', member: '멤버' }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA', paddingHorizontal: 24 },
  scrollContent: { padding: 20, gap: 12, paddingBottom: 48 },

  // 카드 공통
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: 'rgba(25,31,40,1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  colCard: { flexDirection: 'column', gap: 0 },

  // 동아리 정보 카드
  clubBadge: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  clubBadgeText: { fontSize: 24, fontWeight: '800' },
  clubInfoBlock: { gap: 3 },
  clubNameLarge: { fontSize: 17, fontWeight: '800', color: '#191F28' },
  clubMeta: { fontSize: 13, color: '#8B95A1' },
  clubMetaLink: { color: '#3B7DD8', fontWeight: '600', textDecorationLine: 'underline' },
  inviteCodeBtn: {
    height: 34, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: '#F2F4F6', alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 5,
  },
  inviteCodeBtnText: { fontSize: 13, fontWeight: '700', color: '#4E5968' },

  // 위키 카드
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#191F28' },
  editLink: { fontSize: 13, fontWeight: '600', color: '#3B7DD8' },
  wikiEmpty: { fontSize: 13, color: '#A9B1BA', lineHeight: 20 },

  // 섹션 헤더
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#8B95A1' },
  sectionAction: { fontSize: 13, fontWeight: '700', color: '#3B7DD8' },

  // 방 컨테이너
  channelContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: 'rgba(25,31,40,1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, paddingHorizontal: 16 },
  channelRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F2F4F6' },
  channelIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#E7EFFF', alignItems: 'center', justifyContent: 'center',
  },
  channelIconLock: { backgroundColor: '#F2F4F6' },
  channelIconHash: { fontSize: 16, fontWeight: '800', color: '#3B7DD8' },
  channelIconLockText: { fontSize: 14 },
  channelRowInfo: { flex: 1, gap: 2 },
  channelRowName: { fontSize: 15, fontWeight: '700', color: '#191F28' },
  channelRowSub: { fontSize: 12, color: '#8B95A1' },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#3B7DD8',
    paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
  },
  unreadBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  joinBtn: {
    height: 32, paddingHorizontal: 16, borderRadius: 12,
    backgroundColor: '#E7EFFF', alignItems: 'center', justifyContent: 'center',
  },
  joinBtnText: { fontSize: 13, fontWeight: '700', color: '#3B7DD8' },

  // 빈 방 상태
  emptyRooms: { paddingVertical: 20, paddingHorizontal: 4 },
  emptyRoomsText: { fontSize: 14, color: '#8B95A1', textAlign: 'center' },

  // 에러
  errorText: { fontSize: 15, color: '#E5484D', textAlign: 'center', marginBottom: 20 },
  retryBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, backgroundColor: '#3B7DD8' },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
})
