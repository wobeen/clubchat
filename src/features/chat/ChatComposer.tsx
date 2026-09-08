import { useEffect, useRef, useState } from 'react'
import {
  ActionSheetIOS,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Pressable } from '../ui/Pressable'

interface Props {
  value: string
  onChangeText: (text: string) => void
  onSend: () => void
  sending: boolean
  uploading: boolean
  editingMessageId: string | null
  editingContent: string
  onCancelEdit: () => void
  onPickImage: () => void
  onPickFile: () => void
}

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  sending,
  uploading,
  editingMessageId,
  editingContent,
  onCancelEdit,
  onPickImage,
  onPickFile,
}: Props) {
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const inputRef = useRef<TextInput>(null)

  // 웹 전용 keydown 리스너가 항상 최신 onSend를 호출하도록, ref로 값을 추적한다
  // (effect를 onSend가 바뀔 때마다 재구독하지 않기 위함 — 원본 chat.tsx의 handleSendRef 패턴).
  const onSendRef = useRef(onSend)
  useEffect(() => {
    onSendRef.current = onSend
  }, [onSend])

  // 수정 모드로 들어가면(부모가 editingMessageId를 세팅하면) 입력창에 포커스를 준다.
  useEffect(() => {
    if (editingMessageId) {
      const t = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [editingMessageId])

  // ── 웹 전용 Enter 키 전송 ────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const el = inputRef.current as unknown as HTMLTextAreaElement | null
    if (!el?.addEventListener) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSendRef.current()
      }
    }
    el.addEventListener('keydown', onKeyDown)
    return () => el.removeEventListener('keydown', onKeyDown)
  }, [])

  const openAttachMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['취소', '이미지', '파일'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) onPickImage()
          if (idx === 2) onPickFile()
        }
      )
    } else {
      setShowAttachMenu((v) => !v)
    }
  }

  const isBusy = sending || uploading

  return (
    <View>
      {/* Android/Web 첨부 메뉴 */}
      {showAttachMenu && (
        <View style={styles.attachMenu}>
          <Pressable
            style={styles.attachMenuItem}
            onPress={() => {
              setShowAttachMenu(false)
              onPickImage()
            }}
          >
            <Text style={styles.attachMenuIcon}>🖼️</Text>
            <Text style={styles.attachMenuText}>이미지</Text>
          </Pressable>
          <Pressable
            style={styles.attachMenuItem}
            onPress={() => {
              setShowAttachMenu(false)
              onPickFile()
            }}
          >
            <Text style={styles.attachMenuIcon}>📄</Text>
            <Text style={styles.attachMenuText}>파일</Text>
          </Pressable>
        </View>
      )}

      {/* 수정 모드 배너 */}
      {editingMessageId && (
        <View style={styles.editBanner}>
          <Text style={styles.editBannerLabel} numberOfLines={1}>
            수정 중: {editingContent}
          </Text>
          <Pressable
            onPress={onCancelEdit}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="수정 취소"
          >
            <Text style={styles.editBannerCancel}>✕</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.inputBar}>
        {/* 첨부 버튼 — 수정 모드에서 숨김 */}
        {!editingMessageId && (
          <Pressable
            style={({ pressed }) => [styles.attachButton, pressed && { opacity: 0.7 }]}
            onPress={openAttachMenu}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="파일 첨부"
          >
            {uploading
              ? <ActivityIndicator size="small" color="#4A90D9" />
              : <Text style={styles.attachButtonText}>📎</Text>}
          </Pressable>
        )}

        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder="메시지를 입력하세요"
          placeholderTextColor="#9CA3AF"
          multiline
          maxLength={2000}
          returnKeyType="default"
        />
        <Pressable
          style={({ pressed }) => [
            styles.sendButton,
            (!value.trim() || isBusy) && styles.sendButtonDisabled,
            pressed && styles.sendButtonPressed,
            Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
          ]}
          onPress={onSend}
          disabled={!value.trim() || isBusy}
          accessibilityRole="button"
          accessibilityLabel={editingMessageId ? '수정 저장' : '메시지 보내기'}
        >
          {sending
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <Text style={styles.sendButtonText}>{editingMessageId ? '✓' : '↑'}</Text>}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  attachMenu: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F4F5F6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 16,
  },
  attachMenuItem: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F4F5F6',
  },
  attachMenuIcon: { fontSize: 24 },
  attachMenuText: { fontSize: 11, color: '#4E5968', fontWeight: '600' },

  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#BAE2FE',
    borderTopWidth: 1,
    borderTopColor: '#B3CEED',
    gap: 8,
  },
  editBannerLabel: { flex: 1, fontSize: 13, color: '#417029' },
  editBannerCancel: { fontSize: 16, color: '#5C7A6E', fontWeight: '600' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F4F5F6',
  },
  attachButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#F4F5F6',
  },
  attachButtonText: { fontSize: 18 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#F4F5F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    color: '#191F28',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#417029',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#A8C4ED' },
  sendButtonPressed: { opacity: 0.8 },
  sendButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
})
