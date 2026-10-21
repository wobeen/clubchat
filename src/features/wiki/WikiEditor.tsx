import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Pressable } from '../ui/Pressable'
import { WikiViewer } from './WikiViewer'
import type { Page, PageScope } from './types'
import { useUpsertPage } from './usePage'
import { useToast } from '../ui/Toast'
import { useBreakpoint } from '../shell/useBreakpoint'
import { colors } from '../ui/theme'

interface WikiEditorProps {
  visible: boolean
  scope: PageScope
  existingPage: Page | null
  onClose: () => void
  onSaved: () => void
}

// Phase 3: 인라인/시트 겸용.
//  - 넓은 화면(!isCompact): 호출부가 렌더링한 위치(위키 카드 안) 그대로 펼쳐지는
//    인라인 편집기. 셸(레일+목록)이 계속 보이는 채로 편집 — 풀스크린으로 컨텍스트를
//    잃지 않는다.
//  - 컴팩트 화면: 기존과 동일한 풀스크린 시트(Modal). 좁은 화면에서는 카드 안 인라인
//    편집이 비현실적이라 그대로 유지.
// 두 모드가 상태/저장 로직(useUpsertPage, content, preview)을 공유하므로 하나의
// 컴포넌트 안에서 분기한다 — 별도 컴포넌트로 쪼개면 그 로직을 통째로 중복하게 된다.
export function WikiEditor({ visible, scope, existingPage, onClose, onSaved }: WikiEditorProps) {
  const { isCompact } = useBreakpoint()
  const [content, setContent] = useState(existingPage?.content ?? '')
  const [preview, setPreview] = useState(false)
  const { saving, savePage } = useUpsertPage()
  const { show: showToast, ToastComponent } = useToast()

  // visible이 true로 바뀔 때 초기값 동기화
  useEffect(() => {
    if (visible) {
      setContent(existingPage?.content ?? '')
      setPreview(false)
    }
  }, [visible, existingPage?.content])

  async function handleSave() {
    const result = await savePage(scope, { content }, existingPage)

    if (result.conflict) {
      showToast('다른 사람이 이미 수정했습니다. 최신 내용을 불러온 뒤 다시 편집해 주세요.')
      onClose()
      return
    }

    if (!result.ok) {
      showToast(result.error ?? '저장에 실패했습니다.')
      return
    }

    onSaved()
    onClose()
  }

  const toolbar = (
    <View style={isCompact ? styles.header : styles.inlineHeader}>
      <Pressable onPress={onClose} disabled={saving} hitSlop={8} accessibilityRole="button" accessibilityLabel="편집 취소">
        <Text style={styles.cancelBtn}>취소</Text>
      </Pressable>

      <Pressable onPress={() => setPreview((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel="미리보기 전환">
        <Text style={styles.toggleBtn}>{preview ? '편집' : '미리보기'}</Text>
      </Pressable>

      <Pressable onPress={handleSave} disabled={saving} hitSlop={8} accessibilityRole="button" accessibilityLabel="위키 저장">
        {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.saveBtn}>저장</Text>}
      </Pressable>
    </View>
  )

  const editorBody = preview ? (
    <WikiViewer content={content} />
  ) : (
    <TextInput
      style={isCompact ? styles.input : styles.inlineInput}
      multiline
      autoFocus
      value={content}
      onChangeText={setContent}
      placeholder={'마크다운으로 작성하세요.\n\n# 제목\n## 소제목\n\n본문 내용...'}
      placeholderTextColor={colors.textSecondary}
      textAlignVertical="top"
    />
  )

  if (isCompact) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ToastComponent />
          {toolbar}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {editorBody}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    )
  }

  // 인라인 모드 — visible이 아니면 렌더링할 게 없다(호출부가 이 자리에 WikiViewer 등
  // 다른 내용을 대신 그린다).
  if (!visible) return null

  return (
    <View style={styles.inlineRoot}>
      <ToastComponent />
      {toolbar}
      <View style={styles.inlineBody}>{editorBody}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  // ── 시트(컴팩트) 모드 ──────────────────────────────────────────────────────
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: Platform.OS === 'ios' ? 52 : 12,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    flexGrow: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
    minHeight: 400,
  },

  // ── 인라인(넓은 화면) 모드 ──────────────────────────────────────────────────
  // 호출부의 카드(padding 있음) 안에 그대로 얹히는 형태라 자체 배경/패딩은 없다.
  inlineRoot: {
    gap: 10,
  },
  inlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  inlineBody: {
    minHeight: 160,
  },
  inlineInput: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
    minHeight: 160,
    padding: 0,
  },

  // ── 공통 툴바 텍스트 ─────────────────────────────────────────────────────
  cancelBtn: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  toggleBtn: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  saveBtn: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '700',
  },
})
