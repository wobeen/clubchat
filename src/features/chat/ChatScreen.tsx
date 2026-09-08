import { useCallback, useRef, useState } from 'react'
import {
  ActionSheetIOS,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Pressable } from '../ui/Pressable'
import { supabase } from '../../lib/supabase'
import { useBreakpoint } from '../shell/useBreakpoint'
import { MemberProfileCard, MemberProfile } from '../club/MemberProfileCard'
import { useToast } from '../ui/Toast'
import { useConfirm } from '../ui/ConfirmDialog'
import { useActionSheet } from '../ui/ActionSheet'
import { ChatComposer } from './ChatComposer'
import { ChatMessageList } from './ChatMessageList'
import { useAttachmentUpload } from './useAttachmentUpload'
import { useChatMessages } from './useChatMessages'
import { ChatMessage, SenderInfo } from './types'

interface Props {
  channelId: string
  channelName: string
  currentUserId: string
  onPressSearch?: () => void
  onPressEvents?: () => void
  /** 헤더에 뒤로가기 버튼을 그리기 위한 콜백. showHeader가 true일 때만 쓰인다. */
  onPressBack?: () => void
  showHeader?: boolean
  keyboardAvoiding?: boolean
}

/**
 * 채팅 화면 본체. app/(app)/channels/[id]/chat.tsx의 로직을 그대로 옮겨왔다.
 * useNavigation/useRouter/useLocalSearchParams는 절대 호출하지 않는다 — 모든 것은 props로 받는다.
 * 이렇게 해야 나중에 3-pane 셸의 한 pane으로도, 지금처럼 풀스크린 라우트로도 그대로 재사용할 수 있다.
 */
export function ChatScreen({
  channelId,
  channelName,
  currentUserId,
  onPressSearch,
  onPressEvents,
  onPressBack,
  showHeader,
  keyboardAvoiding,
}: Props) {
  const { isCompact } = useBreakpoint()
  const resolvedShowHeader = showHeader ?? isCompact
  const resolvedKeyboardAvoiding = keyboardAvoiding ?? isCompact
  const insets = useSafeAreaInsets()

  const { messages, status, error, typingUsers, send, editMessage, deleteMessage, sendAttachment, setTyping, retry } =
    useChatMessages(channelId, currentUserId)
  const { uploading, pickImage, pickFile } = useAttachmentUpload()

  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [profileCard, setProfileCard] = useState<MemberProfile | null>(null)

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { show: showToast, ToastComponent } = useToast()
  const { confirm, ConfirmComponent } = useConfirm()
  const { showActionSheet, ActionSheetComponent } = useActionSheet()

  // ── 멤버 프로필 카드 ──────────────────────────────────────────────────────
  async function handleAvatarPress(sender: SenderInfo) {
    const { data: cm } = await supabase
      .from('channel_members')
      .select('joined_at')
      .eq('channel_id', channelId)
      .eq('user_id', sender.id)
      .maybeSingle()
    setProfileCard({
      id: sender.id,
      display_name: sender.display_name,
      avatar_emoji: sender.avatar_emoji ?? null,
      grade: sender.grade ?? null,
      birth_year: sender.birth_year ?? null,
      gender: sender.gender ?? null,
      joined_at: cm?.joined_at ?? new Date().toISOString(),
    })
  }

  // ── 입력중 Presence 추적(디바운스) ──────────────────────────────────────────
  const handleInputChange = useCallback((text: string) => {
    setInputText(text)
    if (!text.trim()) {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      setTyping(false)
      return
    }
    setTyping(true)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => setTyping(false), 3000)
  }, [setTyping])

  // ── 수정 시작/취소 ────────────────────────────────────────────────────────
  const startEdit = useCallback((msg: ChatMessage) => {
    setEditingMessageId(msg.id)
    setEditingContent(msg.content)
    setInputText(msg.content)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingMessageId(null)
    setEditingContent('')
    setInputText('')
  }, [])

  // ── 메시지 삭제(확인 다이얼로그 포함) ─────────────────────────────────────
  const handleDeleteMessage = useCallback(async (messageId: string) => {
    try {
      await deleteMessage(messageId)
    } catch {
      showToast('메시지를 삭제할 수 없습니다.')
    }
  }, [deleteMessage, showToast])

  // ── 메시지 액션 시트(길게 누르기) ───────────────────────────────────────────
  const openMessageActions = useCallback((msg: ChatMessage) => {
    const confirmDelete = () =>
      confirm({
        title: '메시지 삭제',
        message: '이 메시지를 삭제할까요?',
        confirmText: '삭제',
        destructive: true,
        onConfirm: () => handleDeleteMessage(msg.id),
      })

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['취소', '수정', '삭제'], cancelButtonIndex: 0, destructiveButtonIndex: 2 },
        (idx) => {
          if (idx === 1) startEdit(msg)
          if (idx === 2) confirmDelete()
        }
      )
    } else {
      showActionSheet({
        options: [
          { label: '수정', onPress: () => startEdit(msg) },
          { label: '삭제', style: 'destructive', onPress: confirmDelete },
          { label: '취소', style: 'cancel' },
        ],
      })
    }
  }, [startEdit, handleDeleteMessage, confirm, showActionSheet])

  // ── 텍스트 전송 / 수정 저장 ──────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || sending) return

    if (editingMessageId) {
      setSending(true)
      try {
        await editMessage(editingMessageId, text)
        setEditingMessageId(null)
        setEditingContent('')
        setInputText('')
      } catch {
        showToast('메시지를 수정할 수 없습니다.')
      } finally {
        setSending(false)
      }
      return
    }

    setInputText('')
    setSending(true)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    setTyping(false)

    try {
      await send(text)
    } catch (err: any) {
      setInputText(text)
      showToast(`전송 실패: ${err?.message ?? '메시지를 보낼 수 없습니다.'}`)
    } finally {
      setSending(false)
    }
  }, [inputText, sending, editingMessageId, editMessage, send, setTyping, showToast])

  // ── 첨부 전송 ──────────────────────────────────────────────────────────────
  const handlePickImage = useCallback(async () => {
    const result = await pickImage(channelId)
    if (!result) return
    try {
      await sendAttachment(result)
    } catch (err: any) {
      showToast(`전송 실패: ${err?.message ?? '메시지를 보낼 수 없습니다.'}`)
    }
  }, [pickImage, channelId, sendAttachment, showToast])

  const handlePickFile = useCallback(async () => {
    const result = await pickFile(channelId)
    if (!result) return
    try {
      await sendAttachment(result)
    } catch (err: any) {
      showToast(`전송 실패: ${err?.message ?? '메시지를 보낼 수 없습니다.'}`)
    }
  }, [pickFile, channelId, sendAttachment, showToast])

  // ── 로딩 / 에러 ────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#417029" /></View>
  }
  if (status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? '메시지를 불러올 수 없습니다.'}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel="다시 시도"
        >
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    )
  }

  const header = resolvedShowHeader ? (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerLeft}>
        {onPressBack && (
          <Pressable
            onPress={onPressBack}
            style={styles.backButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="뒤로"
          >
            <Text style={styles.backButtonText}>‹</Text>
          </Pressable>
        )}
        <Text style={styles.headerTitle} numberOfLines={1}>{channelName || '채팅'}</Text>
      </View>
      <View style={styles.headerActions}>
        {onPressSearch && (
          <Pressable
            onPress={onPressSearch}
            style={styles.headerIconButton}
            accessibilityRole="button"
            accessibilityLabel="메시지 검색"
          >
            <Text style={styles.headerIconText}>🔍</Text>
          </Pressable>
        )}
        {onPressEvents && (
          <Pressable
            onPress={onPressEvents}
            style={styles.headerEventsButton}
            accessibilityRole="button"
            accessibilityLabel="일정 보기"
          >
            <Text style={styles.headerEventsText}>일정</Text>
          </Pressable>
        )}
      </View>
    </View>
  ) : null

  const body = (
    <>
      <ChatMessageList
        messages={messages}
        currentUserId={currentUserId}
        onLongPressMessage={openMessageActions}
        onAvatarPress={handleAvatarPress}
        typingUsers={typingUsers}
      />
      <ChatComposer
        value={inputText}
        onChangeText={handleInputChange}
        onSend={handleSend}
        sending={sending}
        uploading={uploading}
        editingMessageId={editingMessageId}
        editingContent={editingContent}
        onCancelEdit={cancelEdit}
        onPickImage={handlePickImage}
        onPickFile={handlePickFile}
      />
    </>
  )

  const content = resolvedKeyboardAvoiding ? (
    <KeyboardAvoidingView
      style={styles.flexOne}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {body}
    </KeyboardAvoidingView>
  ) : (
    <View style={styles.flexOne}>{body}</View>
  )

  return (
    <SafeAreaView style={styles.container} edges={resolvedShowHeader ? ['top', 'bottom'] : ['bottom']}>
      <ToastComponent />
      <ConfirmComponent />
      <ActionSheetComponent />
      <MemberProfileCard profile={profileCard} onClose={() => setProfileCard(null)} />
      {header}
      {content}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FA' },
  flexOne: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F7FA' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EBF0F0',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 2 },
  backButton: { paddingHorizontal: 8, paddingVertical: 4 },
  backButtonText: { fontSize: 28, color: '#417029', fontWeight: '400', marginTop: -2 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#191F28', flexShrink: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerIconButton: { paddingHorizontal: 10, paddingVertical: 8 },
  headerIconText: { fontSize: 18 },
  headerEventsButton: { paddingHorizontal: 12, paddingVertical: 8 },
  headerEventsText: { color: '#417029', fontSize: 15, fontWeight: '600' },

  errorText: { fontSize: 15, color: '#E5484D', textAlign: 'center', paddingHorizontal: 24, marginBottom: 20 },
  retryButton: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, backgroundColor: '#417029' },
  retryButtonText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
})
