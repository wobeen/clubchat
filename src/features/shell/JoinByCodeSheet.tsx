// ─── 초대 코드로 가입 바텀시트 ───────────────────────────────────────────────────
// app/(app)/index.tsx가 인라인으로 갖고 있던 "동아리 가입" 모달을 그대로 옮긴 것.
// RPC 호출(join_club_by_invite_code)과 에러 메시지 매핑, 성공 애니메이션 상태까지
// 원본과 동일하게 유지한다.

import { useState } from 'react'
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native'
import { Pressable } from '../ui/Pressable'
import { supabase } from '../../lib/supabase'

type JoinState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'joined'; clubName: string }

const JOIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_code: '유효하지 않은 코드입니다.',
  already_member: '이미 가입된 동아리입니다.',
}

interface JoinByCodeSheetProps {
  visible: boolean
  onClose: () => void
  onJoined: (clubName: string) => void
}

export function JoinByCodeSheet({ visible, onClose, onJoined }: JoinByCodeSheetProps) {
  const [joinCode, setJoinCode] = useState('')
  const [joinState, setJoinState] = useState<JoinState>({ status: 'idle' })

  function handleClose() {
    onClose()
    setJoinCode('')
    setJoinState({ status: 'idle' })
  }

  async function handleJoin() {
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
        onClose()
        setJoinCode('')
        setJoinState({ status: 'idle' })
        onJoined(result.club_name ?? '')
      }, 1200)
    } else {
      setJoinState({ status: 'error', message: '가입에 실패했습니다.' })
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.modalBackdrop} onPress={handleClose} animated={false}>
        <Pressable style={styles.modalSheet} onPress={() => {}} animated={false}>
          <View style={styles.sheetHandle} />
          {joinState.status === 'joined' ? (
            <View style={styles.joinSuccess}>
              <View style={styles.joinSuccessIcon}>
                <Text style={styles.joinSuccessIconText}>✓</Text>
              </View>
              <Text style={styles.joinSuccessText}>{joinState.clubName} 동아리에{'\n'}가입했어요!</Text>
              <ActivityIndicator size="small" color="#417029" style={{ marginTop: 16 }} />
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
                onSubmitEditing={handleJoin}
                editable={joinState.status !== 'loading'}
              />
              <View style={styles.sheetActions}>
                <Pressable style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]} onPress={handleClose}>
                  <Text style={styles.cancelBtnText}>취소</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.saveBtn,
                    (joinState.status === 'loading' || !joinCode.trim()) && styles.saveBtnDisabled,
                    pressed && styles.pressed,
                  ]}
                  onPress={handleJoin}
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
  )
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(25,31,40,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '85%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E9EFE8', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: '#191F28' },
  sheetActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, height: 52, borderRadius: 16, backgroundColor: '#F4F5F6', alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#6B7684' },
  saveBtn: {
    flex: 2, height: 52, borderRadius: 16, backgroundColor: '#417029',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#417029', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 12,
  },
  saveBtnDisabled: { backgroundColor: '#A8C4ED' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },

  joinContent: { padding: 24, gap: 12 },
  joinSubtitle: { fontSize: 13, color: '#5C7A6E', lineHeight: 18 },
  joinErrorText: { fontSize: 13, color: '#E5484D', textAlign: 'center' },
  joinCodeInput: {
    height: 56, backgroundColor: '#F4F5F6', borderRadius: 14,
    paddingHorizontal: 16, fontSize: 24, fontWeight: '700', color: '#191F28',
    letterSpacing: 6, textAlign: 'center',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  joinSuccess: { padding: 40, alignItems: 'center', gap: 12 },
  joinSuccessIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#417029', alignItems: 'center', justifyContent: 'center' },
  joinSuccessIconText: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  joinSuccessText: { fontSize: 18, fontWeight: '700', color: '#191F28', textAlign: 'center', lineHeight: 28 },
})
