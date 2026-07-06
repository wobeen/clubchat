import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { useAuth } from '../../src/features/auth/useAuth'
import { ClubListSkeleton } from '../../src/features/ui/Skeleton'
import { useToast } from '../../src/features/ui/Toast'

interface ProfileData {
  id: string
  display_name: string
  avatar_url: string | null
  avatar_emoji: string | null
  grade: string | null
  birth_year: number | null
  gender: string | null
  created_at: string
}

type MemberRole = 'owner' | 'admin' | 'member'

interface ClubItem {
  membershipId: string
  clubId: string
  clubName: string
  role: MemberRole
  memberCount: number
  channelCount: number
  unreadCount: number
}

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; clubs: ClubItem[]; profile: ProfileData | null }

type JoinState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'joined'; clubName: string }

const JOIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_code: '유효하지 않은 코드입니다.',
  already_member: '이미 가입된 동아리입니다.',
}

const EMOJI_LIST = [
  '😀', '😊', '🥰', '😎', '🤩', '🥳',
  '🐶', '🐱', '🐰', '🦊', '🐻', '🐼',
  '🐨', '🐯', '🦁', '🐸', '🐙', '🦋',
  '🌟', '🌈', '☀️', '🌙', '🔥', '💎',
  '🎯', '🎨', '🎮', '🎵', '🍀', '🌸',
]

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

function getInitials(displayName: string): string {
  return displayName.trim().split(/\s+/).map((p) => p[0]?.toUpperCase() ?? '').slice(0, 2).join('')
}

const ROLE_LABEL: Record<MemberRole, string> = { owner: '방장', admin: '관리자', member: '멤버' }
const ROLE_COLOR: Record<MemberRole, { bg: string; text: string }> = {
  owner: { bg: '#E7EFFF', text: '#3B7DD8' },
  admin: { bg: '#E8F7EE', text: '#1FA65A' },
  member: { bg: '#F2F4F6', text: '#6B7684' },
}

function RoleBadge({ role }: { role: MemberRole }) {
  const c = ROLE_COLOR[role] ?? ROLE_COLOR.member
  return (
    <View style={[styles.roleBadge, { backgroundColor: c.bg }]}>
      <Text style={[styles.roleBadgeText, { color: c.text }]}>{ROLE_LABEL[role] ?? role}</Text>
    </View>
  )
}

function ClubCard({ item, onPress }: { item: ClubItem; onPress: () => void }) {
  const color = getClubColor(item.clubId)
  const firstChar = item.clubName[0]?.toUpperCase() ?? '?'
  return (
    <Pressable
      style={({ pressed }) => [styles.clubCard, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.clubName} 동아리 열기`}
    >
      <View style={[styles.clubBadge, { backgroundColor: color.bg }]}>
        <Text style={[styles.clubBadgeText, { color: color.text }]}>{firstChar}</Text>
      </View>
      <View style={styles.clubInfo}>
        <View style={styles.clubNameRow}>
          <Text style={styles.clubName} numberOfLines={1}>{item.clubName}</Text>
          <RoleBadge role={item.role} />
        </View>
        <Text style={styles.clubSub}>
          방 {item.channelCount}개 · 멤버 {item.memberCount}명
        </Text>
      </View>
      {item.unreadCount > 0 ? (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>
            {item.unreadCount > 99 ? '99+' : String(item.unreadCount)}
          </Text>
        </View>
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  )
}

function UserAvatar({ profile, size }: { profile: ProfileData | null; size: number }) {
  const circleStyle = { width: size, height: size, borderRadius: size / 2 }
  if (profile?.avatar_emoji) {
    return (
      <View style={[styles.avatarCircle, circleStyle, { backgroundColor: '#FFF3E0' }]}>
        <Text style={{ fontSize: size * 0.55 }}>{profile.avatar_emoji}</Text>
      </View>
    )
  }
  const initials = getInitials(profile?.display_name ?? '?')
  return (
    <View style={[styles.avatarCircle, circleStyle, { backgroundColor: '#3B7DD8' }]}>
      <Text style={[styles.avatarInitials, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  )
}

export default function ClubListScreen() {
  const { session } = useAuth()
  const router = useRouter()
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [signingOut, setSigningOut] = useState(false)
  const [profileEditVisible, setProfileEditVisible] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [editGrade, setEditGrade] = useState('')
  const [editBirthYear, setEditBirthYear] = useState('')
  const [editGender, setEditGender] = useState<'female' | 'male' | 'private' | ''>('')
  const [profileSaving, setProfileSaving] = useState(false)
  const { show: showToast, ToastComponent } = useToast()

  const [joinModalVisible, setJoinModalVisible] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinState, setJoinState] = useState<JoinState>({ status: 'idle' })
  const [refreshCounter, setRefreshCounter] = useState(0)

  async function handleJoinByCode() {
    const trimmed = joinCode.trim().toUpperCase()
    if (!trimmed) {
      setJoinState({ status: 'error', message: '초대 코드를 입력해주세요.' })
      return
    }
    setJoinState({ status: 'loading' })
    const { data, error } = await supabase.rpc('join_club_by_invite_code', { p_code: trimmed })
    if (error) {
      setJoinState({ status: 'error', message: '가입 중 오류가 발생했습니다.' })
      return
    }
    const result = data as { success?: boolean; error?: string; club_name?: string }
    if (result?.error) {
      setJoinState({ status: 'error', message: JOIN_ERROR_MESSAGES[result.error] ?? '가입에 실패했습니다.' })
      return
    }
    if (result?.success) {
      setJoinState({ status: 'joined', clubName: result.club_name ?? '' })
      setTimeout(() => {
        setJoinModalVisible(false)
        setJoinCode('')
        setJoinState({ status: 'idle' })
        setRefreshCounter((c) => c + 1)
        showToast(`${result.club_name} 동아리에 가입했어요 ✓`)
      }, 1200)
    } else {
      setJoinState({ status: 'error', message: '가입에 실패했습니다.' })
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (!session?.user) return
      let cancelled = false

      async function load() {
        if (!session?.user) return
        setState({ status: 'loading' })

        const [profileResult, membershipsResult, myChannelsResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, display_name, avatar_url, avatar_emoji, created_at')
            .eq('id', session.user.id)
            .maybeSingle(),
          supabase
            .from('memberships')
            .select('id, role, club_id, clubs(id, name)')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('channel_members')
            .select('channel_id, channels!inner(club_id)')
            .eq('user_id', session.user.id),
        ])

        if (cancelled) return

        if (profileResult.error || membershipsResult.error) {
          setState({ status: 'error', message: '정보를 불러오는 중 오류가 발생했습니다.' })
          return
        }

        const clubs: Array<Omit<ClubItem, 'memberCount' | 'channelCount' | 'unreadCount'>> =
          (membershipsResult.data ?? []).flatMap((m) => {
            const clubData = m.clubs as { id: string; name: string } | null
            if (!clubData) return []
            return [{ membershipId: m.id, clubId: clubData.id, clubName: clubData.name, role: (m.role as MemberRole) ?? 'member' }]
          })

        const clubIds = clubs.map((c) => c.clubId)

        // Fetch member counts, channel counts, and unread counts in parallel
        const channelEntries = (myChannelsResult.data ?? []) as Array<{ channel_id: string; channels: { club_id: string } }>
        const channelIds = channelEntries.map((cm) => cm.channel_id)

        const [allMembersResult, allChannelsResult] = await Promise.all([
          clubIds.length > 0
            ? supabase.from('memberships').select('club_id').in('club_id', clubIds)
            : Promise.resolve({ data: [] }),
          clubIds.length > 0
            ? supabase.from('channels').select('club_id').in('club_id', clubIds)
            : Promise.resolve({ data: [] }),
        ])

        if (cancelled) return

        const memberCounts: Record<string, number> = {}
        for (const m of (allMembersResult as { data: Array<{ club_id: string }> | null }).data ?? []) {
          memberCounts[m.club_id] = (memberCounts[m.club_id] ?? 0) + 1
        }

        const channelCounts: Record<string, number> = {}
        for (const c of (allChannelsResult as { data: Array<{ club_id: string | null }> | null }).data ?? []) {
          if (c.club_id) channelCounts[c.club_id] = (channelCounts[c.club_id] ?? 0) + 1
        }

        let clubUnreads: Record<string, number> = {}
        if (channelIds.length > 0) {
          const { data: unreadData } = await (supabase as any).rpc('get_unread_counts', { p_channel_ids: channelIds })
          const channelToClub: Record<string, string> = {}
          for (const cm of channelEntries) {
            channelToClub[cm.channel_id] = cm.channels.club_id
          }
          for (const row of (unreadData ?? []) as Array<{ channel_id: string; unread_count: number }>) {
            const cid = channelToClub[row.channel_id]
            if (cid) clubUnreads[cid] = (clubUnreads[cid] ?? 0) + Number(row.unread_count)
          }
        }

        if (cancelled) return

        const clubsWithStats: ClubItem[] = clubs.map((c) => ({
          ...c,
          memberCount: memberCounts[c.clubId] ?? 0,
          channelCount: channelCounts[c.clubId] ?? 0,
          unreadCount: clubUnreads[c.clubId] ?? 0,
        }))

        setState({ status: 'ready', clubs: clubsWithStats, profile: profileResult.data as ProfileData | null })
      }

      load()
      return () => { cancelled = true }
    }, [session?.user?.id, refreshCounter])
  )

  async function handleSignOut() {
    setSigningOut(true)
    const { error } = await supabase.auth.signOut()
    if (error) console.error('[ClubListScreen] signOut error:', error)
    setSigningOut(false)
  }

  function openProfileEdit() {
    if (state.status !== 'ready') return
    setEditName(state.profile?.display_name ?? '')
    setEditEmoji(state.profile?.avatar_emoji ?? '')
    setEditGrade(state.profile?.grade ?? '')
    setEditBirthYear(state.profile?.birth_year ? String(state.profile.birth_year) : '')
    setEditGender((state.profile?.gender as 'female' | 'male' | 'private' | '') ?? '')
    setProfileEditVisible(true)
  }

  async function handleSaveProfile() {
    if (!session?.user || !editName.trim()) return
    setProfileSaving(true)
    const birthYearNum = editBirthYear ? parseInt(editBirthYear, 10) : null
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: editName.trim(),
        avatar_emoji: editEmoji || null,
        grade: editGrade.trim() || null,
        birth_year: birthYearNum,
        gender: editGender || null,
      } as any)
      .eq('id', session.user.id)
    setProfileSaving(false)
    if (error) {
      Alert.alert('오류', '프로필을 변경할 수 없습니다.')
      return
    }
    setState((prev) => {
      if (prev.status !== 'ready' || !prev.profile) return prev
      return {
        ...prev,
        profile: {
          ...prev.profile,
          display_name: editName.trim(),
          avatar_emoji: editEmoji || null,
          grade: editGrade.trim() || null,
          birth_year: birthYearNum,
          gender: editGender || null,
        },
      }
    })
    setProfileEditVisible(false)
    showToast('프로필이 저장됐어요 ✓')
  }

  if (state.status === 'loading') return <ClubListSkeleton />

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

  const { clubs, profile } = state
  const displayName = profile?.display_name ?? '사용자'

  return (
    <View style={styles.container}>
      <ToastComponent />

      {/* ── 프로필 편집 모달 ─────────────────────────────────────────────── */}
      <Modal visible={profileEditVisible} animationType="slide" transparent onRequestClose={() => setProfileEditVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setProfileEditVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetScroll}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>프로필 편집</Text>
                <Pressable onPress={() => setProfileEditVisible(false)} hitSlop={8}>
                  <Text style={styles.sheetClose}>✕</Text>
                </Pressable>
              </View>

              <View style={styles.previewRow}>
                <View style={[styles.previewCircle, { backgroundColor: editEmoji ? '#FFF3E0' : '#3B7DD8' }]}>
                  {editEmoji
                    ? <Text style={{ fontSize: 38 }}>{editEmoji}</Text>
                    : <Text style={styles.previewInitials}>{getInitials(editName || '?')}</Text>}
                </View>
                <View>
                  <Text style={styles.previewName}>{editName || '이름 없음'}</Text>
                  <Text style={styles.previewHint}>아래에서 이모지를 골라보세요</Text>
                </View>
              </View>

              <View style={styles.emojiRow}>
                {EMOJI_LIST.slice(0, 6).map((emoji) => (
                  <Pressable
                    key={emoji}
                    onPress={() => setEditEmoji(emoji === editEmoji ? '' : emoji)}
                    style={[styles.emojiCell, editEmoji === emoji && styles.emojiCellSelected]}
                  >
                    <Text style={styles.emojiCellText}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>표시 이름</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="표시 이름"
                  placeholderTextColor="#A9B1BA"
                  maxLength={30}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldRow}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>학번</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={editGrade}
                    onChangeText={setEditGrade}
                    placeholder="예: 21학번"
                    placeholderTextColor="#A9B1BA"
                    maxLength={10}
                    returnKeyType="next"
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>출생년도</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={editBirthYear}
                    onChangeText={(v) => setEditBirthYear(v.replace(/[^0-9]/g, ''))}
                    placeholder="예: 2002"
                    placeholderTextColor="#A9B1BA"
                    maxLength={4}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    onSubmitEditing={handleSaveProfile}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>성별</Text>
                <View style={styles.genderPicker}>
                  {(['female', 'male', 'private'] as const).map((g) => {
                    const label = g === 'female' ? '여성' : g === 'male' ? '남성' : '비공개'
                    const selected = editGender === g
                    return (
                      <Pressable
                        key={g}
                        style={[styles.genderOption, selected && styles.genderOptionSelected]}
                        onPress={() => setEditGender(selected ? '' : g)}
                      >
                        <Text style={[styles.genderOptionText, selected && styles.genderOptionTextSelected]}>
                          {label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>

              <View style={styles.sheetActions}>
                <Pressable
                  style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
                  onPress={() => setProfileEditVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>취소</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.saveBtn,
                    (!editName.trim() || profileSaving) && styles.saveBtnDisabled,
                    pressed && styles.pressed,
                  ]}
                  onPress={handleSaveProfile}
                  disabled={!editName.trim() || profileSaving}
                >
                  {profileSaving
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Text style={styles.saveBtnText}>저장</Text>}
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [styles.signOutInSheet, (pressed || signingOut) && styles.pressed]}
                onPress={handleSignOut}
                disabled={signingOut}
              >
                {signingOut
                  ? <ActivityIndicator size="small" color="#8B95A1" />
                  : <Text style={styles.signOutInSheetText}>로그아웃</Text>}
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 동아리 가입 모달 ─────────────────────────────────────────────── */}
      <Modal
        visible={joinModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setJoinModalVisible(false); setJoinCode(''); setJoinState({ status: 'idle' }) }}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => { setJoinModalVisible(false); setJoinCode(''); setJoinState({ status: 'idle' }) }}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            {joinState.status === 'joined' ? (
              <View style={styles.joinSuccess}>
                <View style={styles.joinSuccessIcon}>
                  <Text style={styles.joinSuccessIconText}>✓</Text>
                </View>
                <Text style={styles.joinSuccessText}>{joinState.clubName} 동아리에{'\n'}가입했어요!</Text>
                <ActivityIndicator size="small" color="#3B7DD8" style={{ marginTop: 16 }} />
              </View>
            ) : (
              <View style={styles.joinContent}>
                <Text style={styles.sheetTitle}>동아리 가입</Text>
                <Text style={styles.joinSubtitle}>관리자에게 받은 8자리 초대 코드를 입력하세요.</Text>
                {joinState.status === 'error' && (
                  <Text style={styles.joinErrorText}>{joinState.message}</Text>
                )}
                <TextInput
                  style={styles.joinCodeInput}
                  value={joinCode}
                  onChangeText={(v) => { setJoinCode(v.toUpperCase()); if (joinState.status === 'error') setJoinState({ status: 'idle' }) }}
                  placeholder="8자리 초대 코드"
                  placeholderTextColor="#A9B1BA"
                  maxLength={8}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleJoinByCode}
                  editable={joinState.status !== 'loading'}
                />
                <View style={styles.sheetActions}>
                  <Pressable
                    style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
                    onPress={() => { setJoinModalVisible(false); setJoinCode(''); setJoinState({ status: 'idle' }) }}
                  >
                    <Text style={styles.cancelBtnText}>취소</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.saveBtn,
                      (joinState.status === 'loading' || !joinCode.trim()) && styles.saveBtnDisabled,
                      pressed && styles.pressed,
                    ]}
                    onPress={handleJoinByCode}
                    disabled={joinState.status === 'loading' || !joinCode.trim()}
                  >
                    {joinState.status === 'loading'
                      ? <ActivityIndicator size="small" color="#FFFFFF" />
                      : <Text style={styles.saveBtnText}>가입하기</Text>}
                  </Pressable>
                </View>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 목록 ─────────────────────────────────────────────────────────── */}
      <FlatList
        data={clubs}
        keyExtractor={(item) => item.membershipId}
        contentContainerStyle={clubs.length === 0 ? styles.emptyContainer : styles.listContent}
        ListHeaderComponent={
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>내 동아리</Text>
            <Pressable
              onPress={openProfileEdit}
              style={styles.headerRight}
              accessibilityRole="button"
              accessibilityLabel="프로필 편집"
            >
              <Text style={styles.headerUserName} numberOfLines={1}>{displayName}</Text>
              <UserAvatar profile={profile} size={40} />
            </Pressable>
          </View>
        }
        renderItem={({ item, index }) => (
          <>
            {index === 0 && (
              <Text style={styles.sectionLabel}>가입한 동아리 {clubs.length}</Text>
            )}
            <ClubCard
              item={item}
              onPress={() => router.push({ pathname: '/(app)/clubs/[id]', params: { id: item.clubId } })}
            />
          </>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>아직 동아리가 없어요</Text>
            <Text style={styles.emptySubtitle}>동아리를 만들거나 초대 코드로 가입해보세요.</Text>
          </View>
        }
      />

      {/* ── 하단 버튼 ─────────────────────────────────────────────────────── */}
      <View style={styles.bottomButtons}>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          onPress={() => router.push('/(app)/clubs/create')}
          accessibilityRole="button"
          accessibilityLabel="동아리 만들기"
        >
          <Text style={styles.primaryBtnText}>+ 동아리 만들기</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.outlineBtn, pressed && styles.pressed]}
          onPress={() => { setJoinCode(''); setJoinState({ status: 'idle' }); setJoinModalVisible(true) }}
          accessibilityRole="button"
          accessibilityLabel="초대 코드로 가입"
        >
          <Text style={styles.outlineBtnText}>초대 코드로 가입</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA', paddingHorizontal: 24 },

  // 아바타
  avatarCircle: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontWeight: '700', color: '#FFFFFF' },

  // 페이지 헤더
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  pageTitle: { fontSize: 26, fontWeight: '800', color: '#191F28', letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerUserName: { fontSize: 14, fontWeight: '600', color: '#4E5968', maxWidth: 80 },

  // 섹션 라벨
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#8B95A1', paddingHorizontal: 20, paddingBottom: 8 },

  // 목록
  listContent: { paddingHorizontal: 20, paddingBottom: 120, gap: 10 },
  emptyContainer: { flex: 1 },

  // 동아리 카드
  clubCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: 'rgba(25,31,40,1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  clubBadge: {
    width: 50, height: 50, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  clubBadgeText: { fontSize: 22, fontWeight: '800' },
  clubInfo: { flex: 1, gap: 3 },
  clubNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  clubName: { fontSize: 16, fontWeight: '700', color: '#191F28' },
  clubSub: { fontSize: 13, color: '#8B95A1' },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  unreadBadge: {
    minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#3B7DD8',
    paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
  },
  unreadBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  chevron: { fontSize: 18, color: '#C4CAD2', fontWeight: '300' },

  // 빈 상태
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#191F28', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 15, color: '#8B95A1', textAlign: 'center', lineHeight: 22 },

  // 하단 버튼
  bottomButtons: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    backgroundColor: '#F7F8FA',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EDEFF2',
  },
  primaryBtn: {
    flex: 1, height: 50, borderRadius: 16, backgroundColor: '#3B7DD8',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#3B7DD8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 12, elevation: 6,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  outlineBtn: {
    flex: 1, height: 50, borderRadius: 16, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E5E8EB', alignItems: 'center', justifyContent: 'center',
  },
  outlineBtnText: { fontSize: 15, fontWeight: '700', color: '#3B7DD8' },

  // 에러
  errorText: { fontSize: 15, color: '#DC2626', textAlign: 'center', marginBottom: 20 },
  retryBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, backgroundColor: '#3B7DD8' },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  pressed: { opacity: 0.65 },

  // 모달 공통
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(25,31,40,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '85%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E8EB', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  sheetScroll: { padding: 24, gap: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: '#191F28' },
  sheetClose: { fontSize: 15, color: '#8B95A1', padding: 4 },

  // 프로필 편집
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  previewCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  previewInitials: { fontSize: 28, fontWeight: '700', color: '#FFFFFF' },
  previewName: { fontSize: 16, fontWeight: '700', color: '#191F28' },
  previewHint: { fontSize: 13, color: '#8B95A1', marginTop: 2 },
  emojiRow: { flexDirection: 'row', gap: 8 },
  emojiCell: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F4F6' },
  emojiCellSelected: { backgroundColor: '#E7EFFF', borderWidth: 2, borderColor: '#3B7DD8' },
  emojiCellText: { fontSize: 23 },
  fieldGroup: { gap: 6 },
  fieldRow: { flexDirection: 'row', gap: 10 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#8B95A1' },
  fieldInput: {
    height: 48, backgroundColor: '#F2F4F6', borderRadius: 14,
    paddingHorizontal: 16, fontSize: 15, fontWeight: '600', color: '#191F28',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  genderPicker: {
    height: 48, backgroundColor: '#F2F4F6', borderRadius: 14,
    padding: 4, flexDirection: 'row', gap: 4,
  },
  genderOption: {
    flex: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
  },
  genderOptionSelected: {
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgba(25,31,40,1)', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  genderOptionText: { fontSize: 14, fontWeight: '600', color: '#8B95A1' },
  genderOptionTextSelected: { fontWeight: '700', color: '#191F28' },
  sheetActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, height: 52, borderRadius: 16, backgroundColor: '#F2F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#6B7684' },
  saveBtn: {
    flex: 2, height: 52, borderRadius: 16, backgroundColor: '#3B7DD8',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#3B7DD8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 12,
  },
  saveBtnDisabled: { backgroundColor: '#A8C4ED' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  signOutInSheet: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 20 },
  signOutInSheetText: { fontSize: 13, color: '#8B95A1', fontWeight: '600' },

  // 가입 모달
  joinContent: { padding: 24, gap: 12 },
  joinSubtitle: { fontSize: 13, color: '#8B95A1', lineHeight: 18 },
  joinErrorText: { fontSize: 13, color: '#E5484D', textAlign: 'center' },
  joinCodeInput: {
    height: 56, backgroundColor: '#F2F4F6', borderRadius: 14,
    paddingHorizontal: 16, fontSize: 24, fontWeight: '700', color: '#191F28',
    letterSpacing: 6, textAlign: 'center',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  joinSuccess: { padding: 40, alignItems: 'center', gap: 12 },
  joinSuccessIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#3B7DD8', alignItems: 'center', justifyContent: 'center' },
  joinSuccessIconText: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  joinSuccessText: { fontSize: 18, fontWeight: '700', color: '#191F28', textAlign: 'center', lineHeight: 28 },
})
