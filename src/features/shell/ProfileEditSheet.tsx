// ─── 프로필 편집 바텀시트 ────────────────────────────────────────────────────────
// app/(app)/index.tsx가 인라인으로 갖고 있던 프로필 편집 모달을 그대로 옮긴 것.
// 필드 구성(이모지 6개·표시이름·학번·출생년도·성별)과 유효성 검사는 원본과 동일하다.
// 저장은 useProfile()의 update()를 재사용한다(원본은 supabase.from('profiles').update를
// 직접 호출했는데, useProfile.update가 정확히 같은 쿼리를 감싸고 있어 여기서는 이걸 쓴다).

import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useProfile, ProfileRow } from '../auth/useProfile'
import { useAuth } from '../auth/useAuth'
import { useToast } from '../ui/Toast'
import { getInitials } from './shellUtils'
import { supabase } from '../../lib/supabase'

const EMOJI_LIST = [
  '😀', '😊', '🥰', '😎', '🤩', '🥳',
  '🐶', '🐱', '🐰', '🦊', '🐻', '🐼',
  '🐨', '🐯', '🦁', '🐸', '🐙', '🦋',
  '🌟', '🌈', '☀️', '🌙', '🔥', '💎',
  '🎯', '🎨', '🎮', '🎵', '🍀', '🌸',
]

interface ProfileEditSheetProps {
  visible: boolean
  profile: ProfileRow | null
  onClose: () => void
  onSaved: (updatedProfile: ProfileRow) => void
}

export function ProfileEditSheet({ visible, profile, onClose, onSaved }: ProfileEditSheetProps) {
  const { user } = useAuth()
  const { update } = useProfile(user?.id)
  const { show: showToast, ToastComponent } = useToast()

  const [editName, setEditName] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [editGrade, setEditGrade] = useState('')
  const [editBirthYear, setEditBirthYear] = useState('')
  const [editGender, setEditGender] = useState<'female' | 'male' | 'private' | ''>('')
  const [saving, setSaving] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  // visible이 true로 바뀔 때 현재 프로필 값으로 편집 필드를 동기화한다.
  useEffect(() => {
    if (!visible) return
    setEditName(profile?.display_name ?? '')
    setEditEmoji(profile?.avatar_emoji ?? '')
    setEditGrade(profile?.grade ?? '')
    setEditBirthYear(profile?.birth_year ? String(profile.birth_year) : '')
    setEditGender((profile?.gender as 'female' | 'male' | 'private' | '') ?? '')
  }, [visible, profile])

  async function handleSave() {
    if (!editName.trim()) return
    setSaving(true)
    const birthYearNum = editBirthYear ? parseInt(editBirthYear, 10) : null
    const patch: Partial<ProfileRow> = {
      display_name: editName.trim(),
      avatar_emoji: editEmoji || null,
      grade: editGrade.trim() || null,
      birth_year: birthYearNum,
      gender: editGender || null,
    }
    const result = await update(patch)
    setSaving(false)
    if (!result.ok) {
      showToast(result.error ?? '프로필을 변경할 수 없습니다.')
      return
    }
    onSaved({ ...(profile as ProfileRow), ...patch })
    onClose()
    showToast('프로필이 저장됐어요 ✓')
  }

  async function handleSignOut() {
    setSigningOut(true)
    const { error } = await supabase.auth.signOut()
    if (error) console.error('[ProfileEditSheet] signOut error:', error)
    setSigningOut(false)
  }

  return (
    <>
      {/* Modal이 닫히면 내부 트리는 화면에 보이지 않으므로, 저장 완료 토스트가
          닫힘 이후에도 보이도록 Modal 형제로 렌더링한다. */}
      <ToastComponent />
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetScroll}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>프로필 편집</Text>
              <Pressable onPress={onClose} hitSlop={8}>
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
                  onSubmitEditing={handleSave}
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
              <Pressable style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]} onPress={onClose}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.saveBtn,
                  (!editName.trim() || saving) && styles.saveBtnDisabled,
                  pressed && styles.pressed,
                ]}
                onPress={handleSave}
                disabled={!editName.trim() || saving}
              >
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.saveBtnText}>저장</Text>}
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
    </>
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
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E8EB', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  sheetScroll: { padding: 24, gap: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: '#191F28' },
  sheetClose: { fontSize: 15, color: '#8B95A1', padding: 4 },

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
  genderOption: { flex: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  genderOptionSelected: {
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgba(25,31,40,1)', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  genderOptionText: { fontSize: 14, fontWeight: '600', color: '#8B95A1' },
  genderOptionTextSelected: { fontWeight: '700', color: '#191F28' },
  sheetActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, height: 52, borderRadius: 16, backgroundColor: '#F2F4F6', alignItems: 'center', justifyContent: 'center' },
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

  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
})
