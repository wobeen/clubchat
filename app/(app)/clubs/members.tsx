import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../../src/lib/supabase'
import { MemberProfileCard, MemberProfile } from '../../../src/features/club/MemberProfileCard'
import { useAuth } from '../../../src/features/auth/useAuth'
import { useToast } from '../../../src/features/ui/Toast'
import { useConfirm } from '../../../src/features/ui/ConfirmDialog'

interface MemberRow {
  id: string
  role: string
  member_type: string
  graduation_year: number | null
  joined_at: string
  profiles: {
    id: string
    display_name: string
    avatar_emoji: string | null
    grade: string | null
    birth_year: number | null
    gender: string | null
  }
}

interface ProcessedMember {
  membershipId: string
  profileId: string
  display_name: string
  avatar_emoji: string | null
  grade: string | null
  birth_year: number | null
  gender: string | null
  role: 'owner' | 'admin' | 'member'
  member_type: string
  graduation_year: number | null
  joined_at: string
}

type Tab = 'active' | 'ob'

const AVATAR_COLORS = [
  { bg: '#E7EFFF', text: '#3B7DD8' },
  { bg: '#E8F7EE', text: '#1FA65A' },
  { bg: '#FDF0E7', text: '#E07A2E' },
  { bg: '#F0EAFB', text: '#7B5CD6' },
  { bg: '#E7F5FB', text: '#2493C6' },
  { bg: '#FBEFF3', text: '#D6588A' },
]

function getAvatarColor(name: string) {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

const ROLE_LABEL: Record<string, string> = { owner: '방장', admin: '관리자', member: '멤버' }
const ROLE_COLOR: Record<string, { bg: string; text: string }> = {
  owner: { bg: '#E7EFFF', text: '#3B7DD8' },
  admin: { bg: '#E8F7EE', text: '#1FA65A' },
}

function MemberAvatar({ member, size }: { member: ProcessedMember; size: number }) {
  const color = getAvatarColor(member.display_name)
  const isOb = member.member_type === 'ob'
  const avatarBg = isOb ? '#EDEFF2' : (member.avatar_emoji ? '#FFF3E0' : color.bg)
  const avatarTextColor = isOb ? '#6B7684' : color.text

  return (
    <View style={[styles.avatarCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarBg }]}>
      {member.avatar_emoji && !isOb
        ? <Text style={{ fontSize: size * 0.5 }}>{member.avatar_emoji}</Text>
        : <Text style={[styles.avatarInitials, { color: avatarTextColor, fontSize: size * 0.38 }]}>
            {member.display_name.slice(0, 2)}
          </Text>
      }
    </View>
  )
}

export default function MembersScreen() {
  const { clubId, clubName, myRole } = useLocalSearchParams<{
    clubId: string
    clubName: string
    myRole: string
  }>()
  const { session } = useAuth()

  const [members, setMembers] = useState<ProcessedMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('active')
  const [selectedProfile, setSelectedProfile] = useState<MemberProfile | null>(null)
  const [actionMemberId, setActionMemberId] = useState<string | null>(null)
  const { show: showToast, ToastComponent } = useToast()
  const { confirm, ConfirmComponent } = useConfirm()

  const isAdmin = myRole === 'owner' || myRole === 'admin'

  useFocusEffect(
    useCallback(() => {
      if (!clubId) return
      let cancelled = false

      async function load() {
        setLoading(true)
        setError(null)

        const { data, error: err } = await supabase
          .from('memberships')
          .select('id, role, member_type, graduation_year, created_at, profiles(id, display_name, avatar_emoji, grade, birth_year, gender)')
          .eq('club_id', clubId)
          .order('created_at', { ascending: true })

        if (cancelled) return

        if (err) {
          setError('멤버 목록을 불러오지 못했습니다.')
          setLoading(false)
          return
        }

        const processed: ProcessedMember[] = (data ?? []).flatMap((row) => {
          const p = (row as unknown as MemberRow).profiles
          if (!p) return []
          return [{
            membershipId: row.id,
            profileId: p.id,
            display_name: p.display_name,
            avatar_emoji: p.avatar_emoji,
            grade: p.grade,
            birth_year: p.birth_year,
            gender: p.gender,
            role: (row.role as 'owner' | 'admin' | 'member') ?? 'member',
            member_type: row.member_type ?? 'active',
            graduation_year: row.graduation_year,
            joined_at: row.created_at,
          }]
        })

        setMembers(processed)
        setLoading(false)
      }

      load()
      return () => { cancelled = true }
    }, [clubId])
  )

  async function handleToggleMemberType(member: ProcessedMember) {
    if (!isAdmin) return
    const newType = member.member_type === 'ob' ? 'active' : 'ob'
    const label = newType === 'ob' ? 'OB로 전환' : '현역으로 전환'

    confirm({
      title: label,
      message: `${member.display_name}님을 ${label}하시겠어요?`,
      confirmText: label,
      destructive: true,
      onConfirm: async () => {
        setActionMemberId(member.membershipId)
        const { error: err } = await supabase
          .from('memberships')
          .update({ member_type: newType } as any)
          .eq('id', member.membershipId)
        setActionMemberId(null)
        if (err) {
          showToast('변경에 실패했습니다.')
          return
        }
        setMembers((prev) =>
          prev.map((m) => m.membershipId === member.membershipId ? { ...m, member_type: newType } : m)
        )
      },
    })
  }

  function openProfile(member: ProcessedMember) {
    setSelectedProfile({
      id: member.profileId,
      display_name: member.display_name,
      avatar_emoji: member.avatar_emoji,
      grade: member.grade,
      birth_year: member.birth_year,
      gender: member.gender,
      joined_at: member.joined_at,
      role: member.role,
    })
  }

  const activeMembers = members.filter((m) => m.member_type !== 'ob')
  const obMembers = members.filter((m) => m.member_type === 'ob')

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3B7DD8" />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    )
  }

  const displayed = tab === 'active' ? activeMembers : obMembers

  return (
    <View style={styles.container}>
      <ToastComponent />
      <ConfirmComponent />
      <MemberProfileCard
        profile={selectedProfile}
        onClose={() => setSelectedProfile(null)}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* 세그먼트 탭 */}
        <View style={styles.segmentControl}>
          <Pressable
            style={[styles.segmentOption, tab === 'active' && styles.segmentOptionActive]}
            onPress={() => setTab('active')}
          >
            <Text style={[styles.segmentText, tab === 'active' && styles.segmentTextActive]}>
              현역 {activeMembers.length}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segmentOption, tab === 'ob' && styles.segmentOptionActive]}
            onPress={() => setTab('ob')}
          >
            <Text style={[styles.segmentText, tab === 'ob' && styles.segmentTextActive]}>
              OB · 졸업생 {obMembers.length}
            </Text>
          </Pressable>
        </View>

        {/* 멤버 목록 */}
        <View style={styles.memberList}>
          {displayed.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {tab === 'ob' ? '졸업생 멤버가 없어요' : '현역 멤버가 없어요'}
              </Text>
            </View>
          )}
          {displayed.map((member, idx) => {
            const isLast = idx === displayed.length - 1
            const isMe = member.profileId === session?.user?.id
            const roleColor = ROLE_COLOR[member.role]
            const isActioning = actionMemberId === member.membershipId

            return (
              <Pressable
                key={member.membershipId}
                style={[styles.memberRow, !isLast && styles.memberRowBorder]}
                onPress={() => openProfile(member)}
              >
                <MemberAvatar member={member} size={42} />
                <View style={styles.memberInfo}>
                  <View style={styles.memberNameRow}>
                    <Text style={styles.memberName}>{member.display_name}</Text>
                    {roleColor && (
                      <View style={[styles.roleBadge, { backgroundColor: roleColor.bg }]}>
                        <Text style={[styles.roleBadgeText, { color: roleColor.text }]}>
                          {ROLE_LABEL[member.role]}
                        </Text>
                      </View>
                    )}
                    {member.member_type === 'ob' && (
                      <View style={styles.obBadge}>
                        <Text style={styles.obBadgeText}>OB</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.memberSub}>
                    {[member.grade, isMe ? '나' : null, member.graduation_year ? `${member.graduation_year}년 졸업` : null]
                      .filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {isAdmin && member.role !== 'owner' && (
                  isActioning
                    ? <ActivityIndicator size="small" color="#8B95A1" />
                    : (
                      <Pressable
                        onPress={() => handleToggleMemberType(member)}
                        hitSlop={8}
                        style={({ pressed }) => [pressed && { opacity: 0.5 }]}
                      >
                        <Text style={styles.toggleText}>
                          {member.member_type === 'ob' ? '현역 전환' : 'OB 전환'}
                        </Text>
                      </Pressable>
                    )
                )}
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },

  segmentControl: {
    height: 44, borderRadius: 14, backgroundColor: '#EDEFF2',
    padding: 4, flexDirection: 'row', gap: 4,
  },
  segmentOption: {
    flex: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
  },
  segmentOptionActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgba(25,31,40,1)', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  segmentText: { fontSize: 14, fontWeight: '600', color: '#8B95A1' },
  segmentTextActive: { fontWeight: '700', color: '#191F28' },

  memberList: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    shadowColor: 'rgba(25,31,40,1)', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  memberRow: {
    paddingVertical: 14, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  memberRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F2F4F6',
  },

  avatarCircle: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarInitials: { fontWeight: '700' },

  memberInfo: { flex: 1, gap: 2 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  memberName: { fontSize: 15, fontWeight: '700', color: '#191F28' },
  memberSub: { fontSize: 12, color: '#8B95A1' },

  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  obBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: '#EDEFF2' },
  obBadgeText: { fontSize: 11, fontWeight: '700', color: '#6B7684' },

  toggleText: { fontSize: 13, fontWeight: '600', color: '#8B95A1' },

  emptyState: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#8B95A1' },

  errorText: { fontSize: 15, color: '#E5484D', textAlign: 'center' },
})
