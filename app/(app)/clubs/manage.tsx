import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../../src/lib/supabase'

interface ClubInfo {
  invite_code: string
  is_public: boolean
}

interface JoinRequest {
  id: string
  message: string | null
  status: string
  created_at: string
  profiles: {
    id: string
    display_name: string
    avatar_emoji: string | null
    grade: string | null
  }
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; club: ClubInfo; requests: JoinRequest[] }

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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  const hr = Math.floor(diff / 3600000)
  const day = Math.floor(diff / 86400000)
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  if (hr < 24) return `${hr}시간 전`
  if (day < 2) return '어제'
  return `${day}일 전`
}

export default function ManageClubScreen() {
  const { clubId, clubName } = useLocalSearchParams<{ clubId: string; clubName: string }>()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [toggling, setToggling] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      if (!clubId) return
      let cancelled = false

      async function load() {
        setState({ status: 'loading' })

        const [codeResult, clubResult, requestsResult] = await Promise.all([
          supabase.rpc('get_club_invite', { p_club_id: clubId }),
          supabase.from('clubs').select('is_public').eq('id', clubId).maybeSingle(),
          supabase
            .from('join_requests')
            .select('id, message, status, created_at, profiles(id, display_name, avatar_emoji, grade)')
            .eq('club_id', clubId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false }),
        ])

        if (cancelled) return

        const codeData = codeResult.data as { invite_code?: string; error?: string } | null
        if (codeResult.error || !codeData?.invite_code) {
          setState({ status: 'error', message: '정보를 불러오지 못했습니다.' })
          return
        }

        setState({
          status: 'ready',
          club: {
            invite_code: codeData.invite_code,
            is_public: clubResult.data?.is_public ?? false,
          },
          requests: (requestsResult.data ?? []) as JoinRequest[],
        })
      }

      load()
      return () => { cancelled = true }
    }, [clubId])
  )

  async function handleTogglePublic(value: boolean) {
    if (state.status !== 'ready') return
    setToggling(true)
    const { error } = await supabase
      .from('clubs')
      .update({ is_public: value } as any)
      .eq('id', clubId)
    setToggling(false)
    if (error) {
      Alert.alert('오류', '공개 설정을 변경할 수 없습니다.')
      return
    }
    setState((prev) => prev.status === 'ready' ? { ...prev, club: { ...prev.club, is_public: value } } : prev)
  }

  async function handleRequest(requestId: string, approve: boolean) {
    if (state.status !== 'ready') return
    setProcessingId(requestId)

    const newStatus = approve ? 'approved' : 'rejected'
    const { error: updateErr } = await supabase
      .from('join_requests')
      .update({ status: newStatus, reviewed_at: new Date().toISOString() } as any)
      .eq('id', requestId)

    if (updateErr) {
      setProcessingId(null)
      Alert.alert('오류', '처리 중 오류가 발생했습니다.')
      return
    }

    if (approve) {
      const req = state.requests.find((r) => r.id === requestId)
      if (req) {
        await supabase.from('memberships').insert({
          club_id: clubId,
          user_id: req.profiles.id,
          role: 'member',
        } as any)
      }
    }

    setProcessingId(null)
    setState((prev) =>
      prev.status === 'ready'
        ? { ...prev, requests: prev.requests.filter((r) => r.id !== requestId) }
        : prev
    )
  }

  async function handleCopy(code: string) {
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(code)
        Alert.alert('복사 완료', '초대 코드가 복사됐어요.')
      } catch {
        Alert.alert('복사 실패', '코드를 직접 선택해 복사해 주세요.')
      }
    } else {
      Alert.alert('초대 코드', code, [{ text: '닫기' }])
    }
  }

  function confirmRegenerate() {
    Alert.alert('새 코드 발급', '기존 초대 코드가 즉시 만료됩니다. 계속할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '발급', style: 'destructive', onPress: handleRegenerate },
    ])
  }

  async function handleRegenerate() {
    if (state.status !== 'ready') return
    setRegenerating(true)
    const { data, error } = await supabase.rpc('regenerate_club_invite', { p_club_id: clubId })
    setRegenerating(false)
    if (error) { Alert.alert('오류', '코드 재생성 중 오류가 발생했습니다.'); return }
    const result = data as { invite_code?: string; error?: string } | null
    if (!result?.invite_code) { Alert.alert('오류', '코드 재생성 중 오류가 발생했습니다.'); return }
    setState((prev) =>
      prev.status === 'ready' ? { ...prev, club: { ...prev.club, invite_code: result.invite_code! } } : prev
    )
  }

  if (state.status === 'loading') {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#3B7DD8" /></View>
  }

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

  const { club, requests } = state

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* 공개 토글 카드 */}
      <View style={styles.card}>
        <View style={styles.publicRow}>
          <View style={styles.publicInfo}>
            <Text style={styles.publicTitle}>동아리 공개</Text>
            <Text style={styles.publicDesc}>
              공개하면 검색에 노출되고 누구나 가입 신청을 보낼 수 있어요.
            </Text>
          </View>
          <Switch
            value={club.is_public}
            onValueChange={handleTogglePublic}
            disabled={toggling}
            trackColor={{ false: '#EDEFF2', true: '#3B7DD8' }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#EDEFF2"
          />
        </View>
        {club.is_public && (
          <View style={styles.publicPill}>
            <View style={styles.publicDot} />
            <Text style={styles.publicPillText}>신규 부원 모집 중 · 공개 상태</Text>
          </View>
        )}
      </View>

      {/* 가입 신청 */}
      {club.is_public && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>가입 신청 {requests.length}건</Text>
          </View>

          {requests.length === 0 ? (
            <View style={styles.emptyRequests}>
              <Text style={styles.emptyText}>대기 중인 신청이 없어요</Text>
            </View>
          ) : (
            requests.map((req) => {
              const color = getAvatarColor(req.profiles.display_name)
              const initials = req.profiles.display_name.slice(0, 2)
              const isProcessing = processingId === req.id

              return (
                <View key={req.id} style={styles.card}>
                  <View style={styles.requestHeader}>
                    <View style={[styles.reqAvatar, { backgroundColor: req.profiles.avatar_emoji ? '#FFF3E0' : color.bg }]}>
                      {req.profiles.avatar_emoji
                        ? <Text style={{ fontSize: 18 }}>{req.profiles.avatar_emoji}</Text>
                        : <Text style={[styles.reqAvatarText, { color: color.text }]}>{initials}</Text>}
                    </View>
                    <View style={styles.reqMeta}>
                      <View style={styles.reqNameRow}>
                        <Text style={styles.reqName}>{req.profiles.display_name}</Text>
                        <Text style={styles.reqTime}>
                          {req.profiles.grade ? `${req.profiles.grade} · ` : ''}{timeAgo(req.created_at)}
                        </Text>
                      </View>
                      {req.message ? (
                        <View style={styles.reqMessage}>
                          <Text style={styles.reqMessageText} numberOfLines={3}>"{req.message}"</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.reqActions}>
                    {isProcessing ? (
                      <ActivityIndicator size="small" color="#3B7DD8" style={{ flex: 1 }} />
                    ) : (
                      <>
                        <Pressable
                          style={({ pressed }) => [styles.approveBtn, pressed && styles.pressed]}
                          onPress={() => handleRequest(req.id, true)}
                        >
                          <Text style={styles.approveBtnText}>승인</Text>
                        </Pressable>
                        <Pressable
                          style={({ pressed }) => [styles.rejectBtn, pressed && styles.pressed]}
                          onPress={() => handleRequest(req.id, false)}
                        >
                          <Text style={styles.rejectBtnText}>거절</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              )
            })
          )}
        </>
      )}

      {/* 초대 코드 */}
      <View style={[styles.card, styles.codeCard]}>
        <View style={styles.codeInfo}>
          <Text style={styles.codeLabel}>초대 코드</Text>
          <Text style={styles.codeValue}>{club.invite_code}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.codeBtn, pressed && styles.pressed]}
          onPress={() => handleCopy(club.invite_code)}
        >
          <Text style={styles.codeBtnText}>복사</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.codeBtn, pressed && styles.pressed, regenerating && styles.codeBtnDisabled]}
          onPress={confirmRegenerate}
          disabled={regenerating}
        >
          {regenerating
            ? <ActivityIndicator size="small" color="#4E5968" />
            : <Text style={styles.codeBtnText}>재발급</Text>}
        </Pressable>
      </View>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA', paddingHorizontal: 24 },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18,
    shadowColor: 'rgba(25,31,40,1)', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    gap: 14,
  },

  // 공개 토글
  publicRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  publicInfo: { flex: 1, gap: 3 },
  publicTitle: { fontSize: 15, fontWeight: '800', color: '#191F28' },
  publicDesc: { fontSize: 13, color: '#8B95A1', lineHeight: 18 },
  publicPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#E7EFFF', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
  },
  publicDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B7DD8' },
  publicPillText: { fontSize: 13, fontWeight: '600', color: '#3B7DD8' },

  // 섹션 헤더
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#8B95A1' },

  // 신청 없음
  emptyRequests: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28, alignItems: 'center',
    shadowColor: 'rgba(25,31,40,1)', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  emptyText: { fontSize: 14, color: '#8B95A1' },

  // 가입 신청 카드
  requestHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  reqAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  reqAvatarText: { fontSize: 15, fontWeight: '700' },
  reqMeta: { flex: 1, gap: 4 },
  reqNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  reqName: { fontSize: 15, fontWeight: '700', color: '#191F28' },
  reqTime: { fontSize: 12, color: '#8B95A1' },
  reqMessage: { backgroundColor: '#F7F8FA', borderRadius: 10, padding: 10 },
  reqMessageText: { fontSize: 13, color: '#4E5968', lineHeight: 18 },
  reqActions: { flexDirection: 'row', gap: 8, paddingLeft: 54 },
  approveBtn: {
    flex: 1, height: 40, borderRadius: 12, backgroundColor: '#3B7DD8',
    alignItems: 'center', justifyContent: 'center',
  },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  rejectBtn: {
    flex: 1, height: 40, borderRadius: 12, backgroundColor: '#F2F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: '#6B7684' },

  // 초대 코드
  codeCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  codeInfo: { flex: 1, gap: 2 },
  codeLabel: { fontSize: 14, fontWeight: '700', color: '#191F28' },
  codeValue: { fontSize: 16, fontWeight: '800', color: '#3B7DD8', letterSpacing: 2 },
  codeBtn: {
    height: 34, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#F2F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  codeBtnText: { fontSize: 13, fontWeight: '700', color: '#4E5968' },
  codeBtnDisabled: { opacity: 0.5 },

  pressed: { opacity: 0.65 },
  errorText: { fontSize: 15, color: '#E5484D', textAlign: 'center', marginBottom: 20 },
  retryBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, backgroundColor: '#3B7DD8' },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
})
