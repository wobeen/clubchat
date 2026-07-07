import React, { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { WikiViewer } from './WikiViewer'
import type { Page, PageScope } from './types'
import { useUpsertPage } from './usePage'
import { useToast } from '../ui/Toast'

interface WikiEditorProps {
  visible: boolean
  scope: PageScope
  existingPage: Page | null
  onClose: () => void
  onSaved: () => void
}

export function WikiEditor({ visible, scope, existingPage, onClose, onSaved }: WikiEditorProps) {
  const [content, setContent] = useState(existingPage?.content ?? '')
  const [preview, setPreview] = useState(false)
  const { saving, savePage } = useUpsertPage()
  const { show: showToast, ToastComponent } = useToast()

  // visible이 true로 바뀔 때 초기값 동기화
  React.useEffect(() => {
    if (visible) {
      setContent(existingPage?.content ?? '')
      setPreview(false)
    }
  }, [visible, existingPage?.content])

  const handleSave = async () => {
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

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ToastComponent />
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} disabled={saving}>
            <Text style={styles.cancelBtn}>취소</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setPreview((v) => !v)}>
            <Text style={styles.toggleBtn}>{preview ? '편집' : '미리보기'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#6366f1" />
            ) : (
              <Text style={styles.saveBtn}>저장</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 본문 */}
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          {preview ? (
            <WikiViewer content={content} />
          ) : (
            <TextInput
              style={styles.input}
              multiline
              autoFocus
              value={content}
              onChangeText={setContent}
              placeholder={'마크다운으로 작성하세요.\n\n# 제목\n## 소제목\n\n본문 내용...'}
              placeholderTextColor="#9ca3af"
              textAlignVertical="top"
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingTop: Platform.OS === 'ios' ? 52 : 12,
  },
  cancelBtn: {
    fontSize: 16,
    color: '#6b7280',
  },
  toggleBtn: {
    fontSize: 15,
    color: '#6366f1',
    fontWeight: '500',
  },
  saveBtn: {
    fontSize: 16,
    color: '#6366f1',
    fontWeight: '700',
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
    color: '#111827',
    minHeight: 400,
  },
})
