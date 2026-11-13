import { Modal, StyleSheet, Text, View } from 'react-native'
import { Pressable } from '../ui/Pressable'

export interface MemberProfile {
  id: string
  display_name: string
  avatar_emoji: string | null
  grade: string | null
  birth_year: number | null
  gender: string | null
  joined_at: string
  role?: 'owner' | 'admin' | 'member'
  channelName?: string
}

interface Props {
  profile: MemberProfile | null
  onClose: () => void
}

const AVATAR_COLORS = [
  { bg: '#FFFFFF', text: '#0863BF' },
  { bg: '#EBEBEB', text: '#1A1A1A' },
  { bg: '#EBEBEB', text: '#1A1A1A' },
  { bg: '#EBEBEB', text: '#0863BF' },
  { bg: '#5A5A5A', text: '#1A1A1A' },
]

function getAvatarColor(name: string) {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

const ROLE_LABEL: Record<string, string> = { owner: '방장', admin: '관리자', member: '멤버' }
const ROLE_COLOR: Record<string, { bg: string; text: string }> = {
  owner: { bg: '#FFFFFF', text: '#0863BF' },
  admin: { bg: '#EBEBEB', text: '#1A1A1A' },
  member: { bg: '#F4F4F4', text: '#5F5F5F' },
}
const GENDER_LABEL: Record<string, string> = { female: '여성', male: '남성', private: '비공개' }

function formatJoinedAt(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}

function calcAge(birthYear: number) {
  const currentYear = new Date().getFullYear()
  return currentYear - birthYear + 1
}

export function MemberProfileCard({ profile, onClose }: Props) {
  if (!profile) return null

  const color = getAvatarColor(profile.display_name)
  const initials = profile.display_name.slice(0, 2)
  const roleKey = profile.role ?? 'member'
  const roleColor = ROLE_COLOR[roleKey] ?? ROLE_COLOR.member

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} animated={false}>
        <Pressable style={styles.card} onPress={() => {}} animated={false}>
          <View style={[styles.avatarLarge, { backgroundColor: profile.avatar_emoji ? '#EBEBEB' : color.bg }]}>
            {profile.avatar_emoji
              ? <Text style={styles.avatarEmoji}>{profile.avatar_emoji}</Text>
              : <Text style={[styles.avatarInitials, { color: color.text }]}>{initials}</Text>}
          </View>

          <Text style={styles.name}>{profile.display_name}</Text>

          <View style={styles.badgeRow}>
            {profile.role && (
              <View style={[styles.badge, { backgroundColor: roleColor.bg }]}>
                <Text style={[styles.badgeText, { color: roleColor.text }]}>{ROLE_LABEL[roleKey]}</Text>
              </View>
            )}
            {profile.channelName && (
              <View style={[styles.badge, { backgroundColor: '#FFFFFF' }]}>
                <Text style={[styles.badgeText, { color: '#0863BF' }]}>{profile.channelName}</Text>
              </View>
            )}
          </View>

          <View style={styles.infoBox}>
            {profile.grade ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>학번</Text>
                <Text style={styles.infoValue}>{profile.grade}</Text>
              </View>
            ) : null}
            {profile.birth_year ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>나이</Text>
                <Text style={styles.infoValue}>{calcAge(profile.birth_year)}세 ({profile.birth_year})</Text>
              </View>
            ) : null}
            {profile.gender ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>성별</Text>
                <Text style={styles.infoValue}>{GENDER_LABEL[profile.gender] ?? profile.gender}</Text>
              </View>
            ) : null}
            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.infoLabel}>가입일</Text>
              <Text style={styles.infoValue}>{formatJoinedAt(profile.joined_at)}</Text>
            </View>
          </View>

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>닫기</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(25,31,40,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 16,
    shadowColor: 'rgba(25,31,40,1)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 40,
    elevation: 20,
  },
  avatarLarge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 40 },
  avatarInitials: { fontSize: 30, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  badgeRow: { flexDirection: 'row', gap: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  infoBox: {
    width: '100%',
    backgroundColor: '#F2F2F2',
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E8E8',
  },
  infoLabel: { fontSize: 14, color: '#5A5A5A' },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  closeBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F4F4F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, fontWeight: '700', color: '#5F5F5F' },
})
