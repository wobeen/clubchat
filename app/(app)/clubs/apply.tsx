import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../../src/lib/supabase'
import { useAuth } from '../../../src/features/auth/useAuth'

interface ClubInfo {
  id: string
  name: string
  description: string | null
  is_public: boolean
  memberCount: number
}

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

export default function ApplyScreen() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>()
  const { session } = useAuth()
  const router = useRouter()

  const [club, setClub] = useState<ClubInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [alreadyApplied, setAlreadyApplied] = useState(false)

  useFocusEffect(
    useCallback(() => {
      if (!clubId || !session?.user) return
      let cancelled = false

      async function load() {
        setLoading(true)
        const [clubResult, countResult, existingResult] = await Promise.all([
          supabase
            .from('clubs')
            .select('id, name, description, is_public')
            .eq('id', clubId)
            .maybeSingle(),
          supabase
            .from('memberships')
            .select('id', { count: 'exact', head: true })
            .eq('club_id', clubId),
          supabase
            .from('join_requests')
            .select('id, status')
            .eq('club_id', clubId)
            .eq('user_id', session!.user.id)
            .eq('status', 'pending')
            .maybeSingle(),
        ])

        if (cancelled) return

        if (clubResult.data) {
          setClub({
            id: clubResult.data.id,
            name: clubResult.data.name,
            description: clubResult.data.description,
            is_public: clubResult.data.is_public,
            memberCount: countResult.count ?? 0,
          })
        }

        setAlreadyApplied(!!existingResult.data)
        setLoading(false)
      }

      load()
      return () => { cancelled = true }
    }, [clubId, session?.user?.id])
  )

  async function handleSubmit() {
    if (!session?.user || !club || !club.is_public) return
    setSubmitting(true)

    const { error } = await supabase.from('join_requests').insert({
      club_id: club.id,
      user_id: session.user.id,
      message: message.trim() || null,
      status: 'pending',
    } as any)

    setSubmitting(false)

    if (error) {
      if (error.code === '23505') {
        Alert.alert('이미 신청했어요', '이미 가입 신청을 보냈어요. 동아리 관리자의 승인을 기다려주세요.')
        setAlreadyApplied(true)
      } else {
        Alert.alert('오류', '가입 신청 중 오류가 발생했습니다.')
      }
      return
    }

    Alert.alert(
      '신청 완료!',
      `${club.name}에 가입 신청을 보냈어요.\n관리자가 승인하면 동아리에 가입돼요.`,
      [{ text: '확인', onPress: () => router.back() }]
    )
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#3B7DD8" /></View>
  }

  if (!club) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>동아리 정보를 불러올 수 없습니다.</Text>
      </View>
    )
  }

  const color = getClubColor(club.id)
  const firstChar = club.name[0]?.toUpperCase() ?? '?'
  const MAX_LEN = 200

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* 동아리 소개 카드 */}
        <View style={styles.clubCard}>
          <View style={[styles.clubBadge, { backgroundColor: color.bg }]}>
            <Text style={[styles.clubBadgeText, { color: color.text }]}>{firstChar}</Text>
          </View>
          <Text style={styles.clubName}>{club.name}</Text>
          <Text style={styles.clubMeta}>멤버 {club.memberCount}명</Text>
          {club.is_public && (
            <View style={styles.recruitPill}>
              <View style={styles.recruitDot} />
              <Text style={styles.recruitText}>신규 부원 모집 중</Text>
            </View>
          )}
          {club.description ? (
            <Text style={styles.clubDesc}>{club.description}</Text>
          ) : null}
        </View>

        {/* 자기소개 입력 */}
        {alreadyApplied ? (
          <View style={styles.appliedCard}>
            <Text style={styles.appliedIcon}>✓</Text>
            <Text style={styles.appliedTitle}>신청이 접수됐어요</Text>
            <Text style={styles.appliedDesc}>동아리 관리자의 승인을 기다리고 있어요.</Text>
          </View>
        ) : (
          <View style={styles.messageCard}>
            <Text style={styles.messageTitle}>자기소개 한마디</Text>
            <TextInput
              style={styles.messageInput}
              value={message}
              onChangeText={(v) => setMessage(v.slice(0, MAX_LEN))}
              placeholder="자기소개나 지원 동기를 써주세요 (선택)"
              placeholderTextColor="#A9B1BA"
              multiline
              textAlignVertical="top"
              returnKeyType="default"
            />
            <Text style={styles.charCount}>{message.length} / {MAX_LEN}</Text>
          </View>
        )}

        {/* 안내 */}
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>ⓘ</Text>
          <Text style={styles.infoText}>부장이 승인하면 동아리에 가입돼요. 결과는 알림으로 알려드려요.</Text>
        </View>

      </ScrollView>

      {/* 하단 버튼 */}
      {!alreadyApplied && (
        <View style={styles.bottomBar}>
          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              (submitting || !club.is_public) && styles.submitBtnDisabled,
              pressed && styles.pressed,
            ]}
            onPress={handleSubmit}
            disabled={submitting || !club.is_public}
          >
            {submitting
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={styles.submitBtnText}>가입 신청 보내기</Text>}
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
  content: { padding: 16, gap: 12, paddingBottom: 100 },

  clubCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24,
    alignItems: 'center', gap: 14,
    shadowColor: 'rgba(25,31,40,1)', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  clubBadge: {
    width: 68, height: 68, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  clubBadgeText: { fontSize: 30, fontWeight: '800' },
  clubName: { fontSize: 20, fontWeight: '800', color: '#191F28' },
  clubMeta: { fontSize: 13, color: '#8B95A1' },
  recruitPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E8F7EE', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 14,
  },
  recruitDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#1FA65A' },
  recruitText: { fontSize: 13, fontWeight: '700', color: '#1FA65A' },
  clubDesc: { fontSize: 14, color: '#4E5968', lineHeight: 22, textAlign: 'center' },

  messageCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, gap: 10,
    shadowColor: 'rgba(25,31,40,1)', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  messageTitle: { fontSize: 14, fontWeight: '700', color: '#191F28' },
  messageInput: {
    minHeight: 88, backgroundColor: '#F2F4F6', borderRadius: 14,
    padding: 14, fontSize: 14, color: '#191F28', lineHeight: 21,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  charCount: { fontSize: 12, color: '#A9B1BA', textAlign: 'right' },

  appliedCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 32, alignItems: 'center', gap: 8,
    shadowColor: 'rgba(25,31,40,1)', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  appliedIcon: { fontSize: 32, color: '#1FA65A' },
  appliedTitle: { fontSize: 17, fontWeight: '700', color: '#191F28' },
  appliedDesc: { fontSize: 14, color: '#8B95A1', textAlign: 'center' },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 4 },
  infoIcon: { fontSize: 13, color: '#8B95A1' },
  infoText: { flex: 1, fontSize: 12, color: '#8B95A1', lineHeight: 17 },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    backgroundColor: '#F7F8FA',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EDEFF2',
  },
  submitBtn: {
    height: 54, borderRadius: 18, backgroundColor: '#3B7DD8',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#3B7DD8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
  },
  submitBtnDisabled: { backgroundColor: '#A8C4ED' },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  pressed: { opacity: 0.65 },
  errorText: { fontSize: 15, color: '#E5484D', textAlign: 'center' },
})
