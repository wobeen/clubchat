import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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

// avatar_emoji 는 생성 타입에 아직 없을 수 있으므로 로컬 인터페이스로 정의
interface ProfileData {
  id: string
  display_name: string
  avatar_url: string | null
  avatar_emoji: string | null
  created_at: string
}

type MemberRole = 'owner' | 'admin' | 'member'

interface ClubItem {
  membershipId: string
  clubId: string
  clubName: string
  role: MemberRole
}

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; clubs: ClubItem[]; profile: ProfileData | null }

const EMOJI_LIST = [
  '😀', '😊', '🥰', '😎', '🤩', '🥳',
  '🐶', '🐱', '🐰', '🦊', '🐻', '🐼',
  '🐨', '🐯', '🦁', '🐸', '🐙', '🦋',
  '🌟', '🌈', '☀️', '🌙', '🔥', '💎',
  '🎯', '🎨', '🎮', '🎵', '🍀', '🌸',
]

function getInitials(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
}

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: '방장',
  admin: '관리자',
  member: '멤버',
}

const ROLE_COLOR: Record<MemberRole, { bg: string; text: string }> = {
  owner: { bg: '#DBEAFE', text: '#1D4ED8' },
  admin: { bg: '#DCFCE7', text: '#15803D' },
  member: { bg: '#F3F4F6', text: '#6B7280' },
}

function RoleBadge({ role }: { role: MemberRole }) {
  const colors = ROLE_COLOR[role] ?? ROLE_COLOR.member
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{ROLE_LABEL[role] ?? role}</Text>
    </View>
  )
}

function ClubListItem({
  item,
  onPress,
  onManage,
}: {
  item: ClubItem
  onPress: () => void
  onManage?: () => void
}) {
  return (
    <View style={styles.clubCard}>
      <Pressable
        style={({ pressed }) => [
          styles.clubCardMain,
          pressed && styles.pressedOpacity,
          Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${item.clubName} 동아리 열기`}
      >
        <View style={styles.clubAvatarPlaceholder}>
          <Text style={styles.clubAvatarText}>{item.clubName[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={styles.clubInfo}>
          <Text style={styles.clubName} numberOfLines={1}>{item.clubName}</Text>
        </View>
        <RoleBadge role={item.role} />
      </Pressable>
      {onManage != null && (
        <Pressable
          style={({ pressed }) => [
            styles.manageButton,
            pressed && styles.pressedOpacity,
            Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
          ]}
          onPress={onManage}
          accessibilityRole="button"
          accessibilityLabel={`${item.clubName} 동아리 관리`}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={styles.manageButtonText}>관리</Text>
        </Pressable>
      )}
    </View>
  )
}

// ─── 아바타 표시 헬퍼 ─────────────────────────────────────────────────────────

function ProfileAvatar({
  profile,
  size,
  initials,
}: {
  profile: ProfileData | null
  size: number
  initials: string
}) {
  const circleStyle = { width: size, height: size, borderRadius: size / 2 }

  if (profile?.avatar_emoji) {
    return (
      <View style={[styles.avatarCircle, circleStyle, { backgroundColor: '#E5E7EB' }]}>
        <Text style={{ fontSize: size * 0.55 }}>{profile.avatar_emoji}</Text>
      </View>
    )
  }
  if (profile?.avatar_url) {
    return (
      <Image
        source={{ uri: profile.avatar_url }}
        style={[circleStyle, { backgroundColor: '#E5E7EB' }]}
        accessibilityLabel={`${profile.display_name}의 프로필 사진`}
      />
    )
  }
  return (
    <View style={[styles.avatarCircle, circleStyle, { backgroundColor: '#4A90D9' }]}>
      <Text style={[styles.avatarInitialsText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  )
}

// ─── 화면 ─────────────────────────────────────────────────────────────────────

export default function ClubListScreen() {
  const { session } = useAuth()
  const router = useRouter()
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [signingOut, setSigningOut] = useState(false)
  const [profileEditVisible, setProfileEditVisible] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmoji, setEditEmoji] = useState('')   // '' = 이니셜 사용
  const [profileSaving, setProfileSaving] = useState(false)

  useFocusEffect(
    useCallback(() => {
      if (!session?.user) return

      let cancelled = false

      async function load() {
        if (!session?.user) return
        setState({ status: 'loading' })

        const [profileResult, membershipsResult] = await Promise.all([
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
        ])

        if (cancelled) return

        if (profileResult.error) {
          console.error('[ClubListScreen] profile error:', profileResult.error)
          setState({ status: 'error', message: '프로필을 불러오는 중 오류가 발생했습니다.' })
          return
        }

        if (membershipsResult.error) {
          console.error('[ClubListScreen] memberships error:', membershipsResult.error)
          setState({ status: 'error', message: '동아리 목록을 불러오는 중 오류가 발생했습니다.' })
          return
        }

        const clubs: ClubItem[] = (membershipsResult.data ?? []).flatMap((m) => {
          const clubData = m.clubs as { id: string; name: string } | null
          if (!clubData) return []
          const role = (m.role as MemberRole) ?? 'member'
          return [{ membershipId: m.id, clubId: clubData.id, clubName: clubData.name, role }]
        })

        setState({
          status: 'ready',
          clubs,
          profile: profileResult.data as ProfileData | null,
        })
      }

      load()
      return () => { cancelled = true }
    }, [session?.user?.id])
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
    setProfileEditVisible(true)
  }

  async function handleSaveProfile() {
    if (!session?.user || !editName.trim()) return
    setProfileSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: editName.trim(),
        avatar_emoji: editEmoji || null,
      })
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
        },
      }
    })
    setProfileEditVisible(false)
  }

  // ── 로딩 / 에러 ──────────────────────────────────────────────────────────────
  if (state.status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    )
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{state.message}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={() => setState({ status: 'loading' })}
          accessibilityRole="button"
          accessibilityLabel="다시 시도"
        >
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    )
  }

  const { clubs, profile } = state
  const displayName = profile?.display_name ?? '사용자'
  const initials = getInitials(displayName)

  // 모달 내 미리보기용
  const previewEmoji = editEmoji
  const previewInitials = getInitials(editName || '?')

  return (
    <View style={styles.container}>
      {/* ── 프로필 편집 모달 ─────────────────────────────────────────────── */}
      <Modal
        visible={profileEditVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setProfileEditVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setProfileEditVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalScroll}
            >
              <Text style={styles.modalTitle}>프로필 편집</Text>

              {/* 미리보기 */}
              <View style={styles.previewRow}>
                <View style={[
                  styles.previewCircle,
                  { backgroundColor: previewEmoji ? '#E5E7EB' : '#4A90D9' },
                ]}>
                  {previewEmoji
                    ? <Text style={styles.previewEmoji}>{previewEmoji}</Text>
                    : <Text style={styles.previewInitials}>{previewInitials}</Text>
                  }
                </View>
                {previewEmoji ? (
                  <Pressable
                    onPress={() => setEditEmoji('')}
                    style={styles.clearEmojiBtn}
                    accessibilityRole="button"
                    accessibilityLabel="이니셜로 돌아가기"
                  >
                    <Text style={styles.clearEmojiBtnText}>이니셜로</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.previewHint}>이모지를 골라보세요</Text>
                )}
              </View>

              {/* 이모지 그리드 */}
              <View style={styles.emojiGrid}>
                {EMOJI_LIST.map((emoji) => (
                  <Pressable
                    key={emoji}
                    onPress={() => setEditEmoji(emoji === editEmoji ? '' : emoji)}
                    style={[
                      styles.emojiCell,
                      editEmoji === emoji && styles.emojiCellSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`이모지 ${emoji} 선택`}
                  >
                    <Text style={styles.emojiCellText}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>

              {/* 이름 입력 */}
              <TextInput
                style={styles.modalInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="표시 이름"
                placeholderTextColor="#9CA3AF"
                maxLength={30}
                returnKeyType="done"
                onSubmitEditing={handleSaveProfile}
              />

              {/* 버튼 */}
              <View style={styles.modalActions}>
                <Pressable
                  style={({ pressed }) => [styles.modalCancelBtn, pressed && styles.pressedOpacity]}
                  onPress={() => setProfileEditVisible(false)}
                >
                  <Text style={styles.modalCancelText}>취소</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.modalSaveBtn,
                    (!editName.trim() || profileSaving) && styles.modalSaveBtnDisabled,
                    pressed && styles.pressedOpacity,
                  ]}
                  onPress={handleSaveProfile}
                  disabled={!editName.trim() || profileSaving}
                >
                  {profileSaving
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Text style={styles.modalSaveText}>저장</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 헤더 ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.headerLeft, pressed && styles.pressedOpacity]}
          onPress={openProfileEdit}
          accessibilityRole="button"
          accessibilityLabel="프로필 편집"
        >
          <ProfileAvatar profile={profile} size={HEADER_AVATAR} initials={initials} />
          <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.signOutButton,
            (pressed || signingOut) && styles.pressedOpacity,
          ]}
          onPress={handleSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          accessibilityLabel="로그아웃"
          accessibilityState={{ disabled: signingOut }}
        >
          {signingOut
            ? <ActivityIndicator size="small" color="#DC2626" />
            : <Text style={styles.signOutText}>로그아웃</Text>
          }
        </Pressable>
      </View>

      {/* ── 동아리 목록 ─────────────────────────────────────────────────── */}
      <FlatList
        data={clubs}
        keyExtractor={(item) => item.membershipId}
        contentContainerStyle={clubs.length === 0 ? styles.emptyContainer : styles.listContent}
        renderItem={({ item }) => (
          <ClubListItem
            item={item}
            onPress={() => router.push({ pathname: '/(app)/clubs/[id]', params: { id: item.clubId } })}
            onManage={item.role === 'owner'
              ? () => router.push({
                  pathname: '/(app)/clubs/manage',
                  params: { clubId: item.clubId, clubName: item.clubName },
                })
              : undefined
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>아직 동아리가 없어요</Text>
            <Text style={styles.emptySubtitle}>동아리를 만들거나 초대 코드로 가입해보세요.</Text>
            <View style={styles.emptyActions}>
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedOpacity]}
                onPress={() => router.push('/(app)/clubs/create')}
                accessibilityRole="button"
                accessibilityLabel="동아리 만들기"
              >
                <Text style={styles.primaryButtonText}>동아리 만들기</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressedOpacity]}
                onPress={() => router.push('/(app)/clubs/join')}
                accessibilityRole="button"
                accessibilityLabel="동아리 가입하기"
              >
                <Text style={styles.secondaryButtonText}>초대 코드로 가입</Text>
              </Pressable>
            </View>
          </View>
        }
      />

      {/* FAB */}
      {clubs.length > 0 && (
        <View style={styles.fab}>
          <Pressable
            style={({ pressed }) => [styles.fabButton, pressed && styles.pressedOpacity]}
            onPress={() => router.push('/(app)/clubs/create')}
            accessibilityRole="button"
            accessibilityLabel="동아리 만들기"
          >
            <Text style={styles.fabText}>+ 만들기</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.fabButtonSecondary, pressed && styles.pressedOpacity]}
            onPress={() => router.push('/(app)/clubs/join')}
            accessibilityRole="button"
            accessibilityLabel="동아리 가입하기"
          >
            <Text style={styles.fabTextSecondary}>가입</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const HEADER_AVATAR = 40

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F3F4F6', paddingHorizontal: 24,
  },

  // 공통 아바타
  avatarCircle: { alignItems: 'center', justifyContent: 'center' },
  avatarInitialsText: { fontWeight: '700', color: '#FFFFFF' },

  // 헤더
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12,
  },
  headerName: { fontSize: 17, fontWeight: '600', color: '#1A1A1A', flex: 1 },
  signOutButton: {
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#DC2626',
    alignItems: 'center', justifyContent: 'center', minWidth: 72,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  signOutText: { fontSize: 13, fontWeight: '600', color: '#DC2626' },

  // 동아리 목록
  listContent: { padding: 16, gap: 10, paddingBottom: 100 },
  emptyContainer: { flex: 1 },

  clubCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  clubCardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  clubAvatarPlaceholder: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#4A90D9', alignItems: 'center', justifyContent: 'center',
  },
  clubAvatarText: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  clubInfo: { flex: 1 },
  clubName: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  manageButton: { paddingVertical: 4, paddingHorizontal: 8, marginLeft: 4 },
  manageButtonText: { fontSize: 13, color: '#6B7280' },

  // 빈 상태
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 20, fontWeight: '700', color: '#1A1A1A',
    marginBottom: 8, textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15, color: '#6B7280', textAlign: 'center',
    marginBottom: 32, lineHeight: 22,
  },
  emptyActions: { width: '100%', maxWidth: 320, gap: 12 },
  primaryButton: {
    height: 52, borderRadius: 14, backgroundColor: '#4A90D9',
    alignItems: 'center', justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  secondaryButton: {
    height: 52, borderRadius: 14, backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: '#4A90D9',
    alignItems: 'center', justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '700', color: '#4A90D9' },

  // FAB
  fab: { position: 'absolute', bottom: 32, right: 20, flexDirection: 'row', gap: 10 },
  fabButton: {
    height: 48, paddingHorizontal: 20, borderRadius: 24,
    backgroundColor: '#4A90D9', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#4A90D9', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  fabText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  fabButtonSecondary: {
    height: 48, paddingHorizontal: 20, borderRadius: 24,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#4A90D9',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  fabTextSecondary: { fontSize: 15, fontWeight: '700', color: '#4A90D9' },

  // 에러
  errorText: { fontSize: 15, color: '#DC2626', textAlign: 'center', marginBottom: 20 },
  retryButton: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, backgroundColor: '#4A90D9' },
  retryButtonText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  pressedOpacity: { opacity: 0.6 },

  // 프로필 모달
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', maxWidth: 360, maxHeight: '85%',
    backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden',
  },
  modalScroll: { padding: 24, gap: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' },

  // 미리보기
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  previewCircle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  previewEmoji: { fontSize: 30 },
  previewInitials: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  previewHint: { fontSize: 13, color: '#9CA3AF' },
  clearEmojiBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB',
  },
  clearEmojiBtnText: { fontSize: 12, color: '#6B7280' },

  // 이모지 그리드
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emojiCell: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  emojiCellSelected: {
    backgroundColor: '#DBEAFE', borderWidth: 2, borderColor: '#4A90D9',
  },
  emojiCellText: { fontSize: 22 },

  // 모달 입력/버튼
  modalInput: {
    height: 48, backgroundColor: '#F3F4F6',
    borderRadius: 12, paddingHorizontal: 16, fontSize: 16, color: '#1A1A1A',
    borderWidth: 1.5, borderColor: '#E5E7EB',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, height: 48, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  modalSaveBtn: {
    flex: 1, height: 48, borderRadius: 12,
    backgroundColor: '#4A90D9', alignItems: 'center', justifyContent: 'center',
  },
  modalSaveBtnDisabled: { backgroundColor: '#93C5FD' },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
})
