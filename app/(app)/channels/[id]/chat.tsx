import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../../../src/lib/supabase'
import { useAuth } from '../../../../src/features/auth/useAuth'
import { useAttachmentUpload } from '../../../../src/features/chat/useAttachmentUpload'
import { AttachmentMessage } from '../../../../src/features/chat/AttachmentMessage'
import { Database } from '../../../../src/types/supabase'

// ─── 타입 ────────────────────────────────────────────────────────────────────

type ProfileRow = Database['public']['Tables']['profiles']['Row']
type SenderInfo = Pick<ProfileRow, 'id' | 'display_name' | 'avatar_url'>

interface Attachment {
  id: string
  storagePath: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
}

interface ChatMessage {
  id: string
  channelId: string
  senderId: string
  content: string
  type: 'text' | 'file' | 'image' | 'system'
  createdAt: string
  sender: SenderInfo
  attachment?: Attachment
}

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' }

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map((p) => p[0]?.toUpperCase() ?? '').slice(0, 2).join('')
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function AvatarPlaceholder({ name, size }: { name: string; size: number }) {
  return (
    <View style={[styles.avatarPlaceholder, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarInitials, { fontSize: size * 0.4 }]}>{getInitials(name)}</Text>
    </View>
  )
}

function MyMessageBubble({ msg }: { msg: ChatMessage }) {
  const hasAttachment = !!msg.attachment && msg.type !== 'text'
  return (
    <View style={styles.myRow}>
      <Text style={styles.myTime}>{formatTime(msg.createdAt)}</Text>
      <View style={[styles.myBubble, hasAttachment && styles.mediaBubble]}>
        {hasAttachment ? (
          <AttachmentMessage
            fileName={msg.content}
            attachment={msg.attachment!}
            tint="blue"
          />
        ) : (
          <Text style={styles.myText}>{msg.content}</Text>
        )}
      </View>
    </View>
  )
}

function OtherMessageBubble({ msg }: { msg: ChatMessage }) {
  const hasAttachment = !!msg.attachment && msg.type !== 'text'
  return (
    <View style={styles.otherRow}>
      <AvatarPlaceholder name={msg.sender.display_name} size={32} />
      <View style={styles.otherContent}>
        <Text style={styles.senderName}>
          {msg.sender.display_name}
          <Text style={styles.otherTime}>  {formatTime(msg.createdAt)}</Text>
        </Text>
        <View style={[styles.otherBubble, hasAttachment && styles.mediaBubble]}>
          {hasAttachment ? (
            <AttachmentMessage
              fileName={msg.content}
              attachment={msg.attachment!}
              tint="white"
            />
          ) : (
            <Text style={styles.otherText}>{msg.content}</Text>
          )}
        </View>
      </View>
    </View>
  )
}

// ─── 화면 ─────────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { id: channelId, channelName } = useLocalSearchParams<{
    id: string
    channelName: string
  }>()
  const { session } = useAuth()
  const navigation = useNavigation()
  const router = useRouter()
  const flatListRef = useRef<FlatList<ChatMessage>>(null)

  const [pageStatus, setPageStatus] = useState<PageState>({ status: 'loading' })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)

  const profileCacheRef = useRef<Record<string, SenderInfo>>({})
  const handleSendRef = useRef<() => void>(() => {})
  const inputRef = useRef<TextInput>(null)
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)
  const presenceChannelRef = useRef<RealtimeChannel | null>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [typingUsers, setTypingUsers] = useState<{ userId: string; name: string }[]>([])

  const { uploading, pickImage, pickFile } = useAttachmentUpload()

  // ── 헤더 설정 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    navigation.setOptions({
      title: channelName ?? '채팅',
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/(app)/channels/[id]/search', params: { id: channelId } })
            }
            style={{ paddingHorizontal: 10, paddingVertical: 8 }}
            accessibilityRole="button"
            accessibilityLabel="메시지 검색"
          >
            <Text style={{ fontSize: 18 }}>🔍</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/(app)/channels/[id]/events/list', params: { id: channelId } })
            }
            style={{ paddingHorizontal: 12, paddingVertical: 8 }}
            accessibilityRole="button"
            accessibilityLabel="일정 보기"
          >
            <Text style={{ color: '#4A90D9', fontSize: 15, fontWeight: '600' }}>일정</Text>
          </Pressable>
        </View>
      ),
    })
  }, [channelName, channelId])

  // ── 웹 전용 Enter 키 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return
    if (pageStatus.status !== 'ready') return
    const el = inputRef.current as unknown as HTMLTextAreaElement | null
    if (!el?.addEventListener) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendRef.current() }
    }
    el.addEventListener('keydown', onKeyDown)
    return () => el.removeEventListener('keydown', onKeyDown)
  }, [pageStatus.status])

  // ── 초기 로드 + Realtime ────────────────────────────────────────────────────
  useEffect(() => {
    if (!channelId || !session?.user) return

    let realtimeChannel: RealtimeChannel | null = null
    let cancelled = false

    async function fetchAttachmentForMsg(
      messageId: string,
    ): Promise<Attachment | undefined> {
      const { data } = await supabase
        .from('attachments')
        .select('id, storage_path, mime_type, size_bytes, width, height')
        .eq('message_id', messageId)
        .maybeSingle()
      if (!data) return undefined
      return {
        id: data.id,
        storagePath: data.storage_path,
        mimeType: data.mime_type,
        sizeBytes: data.size_bytes,
        width: data.width,
        height: data.height,
      }
    }

    async function init() {
      if (!session?.user || !channelId) return

      const { data, error } = await supabase
        .from('messages')
        .select(
          `id, channel_id, sender_id, content, type, created_at,
           sender:profiles!messages_sender_id_fkey(id, display_name, avatar_url),
           attachments(id, storage_path, mime_type, size_bytes, width, height)`
        )
        .eq('channel_id', channelId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(50)

      if (cancelled) return
      if (error) {
        setPageStatus({ status: 'error', message: '메시지를 불러올 수 없습니다.' })
        return
      }

      const loaded: ChatMessage[] = (data ?? []).map((row) => {
        const sender = row.sender as SenderInfo
        profileCacheRef.current[sender.id] = sender
        const attachRow = (row.attachments as any[])?.[0]
        const attachment: Attachment | undefined = attachRow
          ? {
              id: attachRow.id,
              storagePath: attachRow.storage_path,
              mimeType: attachRow.mime_type,
              sizeBytes: attachRow.size_bytes,
              width: attachRow.width,
              height: attachRow.height,
            }
          : undefined
        return {
          id: row.id,
          channelId: row.channel_id,
          senderId: row.sender_id,
          content: row.content,
          type: row.type as ChatMessage['type'],
          createdAt: row.created_at,
          sender,
          attachment,
        }
      })

      setMessages(loaded)
      if (cancelled) return

      if (!profileCacheRef.current[session.user.id]) {
        const { data: ownProfile } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .eq('id', session.user.id)
          .maybeSingle()
        if (ownProfile) profileCacheRef.current[ownProfile.id] = ownProfile
      }

      if (cancelled) return
      setPageStatus({ status: 'ready' })

      const myId = session.user.id
      const myName = profileCacheRef.current[myId]?.display_name ?? '나'

      // Supabase 클라이언트는 같은 이름의 채널을 재사용하므로
      // 구독 전에 기존 stale 채널을 먼저 제거한다
      const msgsTopicName = `realtime:chat:msgs:${channelId}`
      const presenceTopicName = `realtime:chat:presence:${channelId}`
      const stale = supabase.getChannels().filter(
        (ch) => ch.topic === msgsTopicName || ch.topic === presenceTopicName,
      )
      await Promise.all(stale.map((ch) => supabase.removeChannel(ch)))

      if (cancelled) return

      // ── 메시지 채널: postgres_changes 전용 ─────────────────────────────
      realtimeChannel = supabase
        .channel(`chat:msgs:${channelId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
          async (payload) => {
            if (cancelled) return
            const row = payload.new as {
              id: string; channel_id: string; sender_id: string
              content: string; type: string; created_at: string
            }

            let sender = profileCacheRef.current[row.sender_id]
            if (!sender) {
              const { data: pData } = await supabase
                .from('profiles').select('id, display_name, avatar_url').eq('id', row.sender_id).maybeSingle()
              sender = pData ?? { id: row.sender_id, display_name: '알 수 없음', avatar_url: null }
              if (pData) profileCacheRef.current[pData.id] = pData
            }

            const msgType = row.type as ChatMessage['type']
            const attachment =
              msgType === 'image' || msgType === 'file'
                ? await fetchAttachmentForMsg(row.id)
                : undefined

            const newMsg: ChatMessage = {
              id: row.id, channelId: row.channel_id, senderId: row.sender_id,
              content: row.content, type: msgType, createdAt: row.created_at, sender, attachment,
            }

            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })

            if (session?.user) {
              supabase.from('channel_reads').upsert(
                { channel_id: channelId, user_id: session.user.id, last_read_at: new Date().toISOString() },
                { onConflict: 'channel_id,user_id' }
              ).then(() => {})
            }

            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50)
          }
        )
        .subscribe()

      realtimeChannelRef.current = realtimeChannel

      // ── 프레즌스 채널: 입력중 표시 전용 ────────────────────────────────
      const presenceChannel = supabase
        .channel(`chat:presence:${channelId}`)
        .on('presence', { event: 'sync' }, () => {
          if (cancelled) return
          const state = presenceChannel.presenceState<{
            typing: boolean; userId: string; name: string
          }>()
          const others = Object.values(state)
            .flat()
            .filter((p) => p.typing && p.userId !== myId)
            .map((p) => ({ userId: p.userId, name: p.name }))
          setTypingUsers(others)
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && !cancelled) {
            await presenceChannel.track({ typing: false, userId: myId, name: myName })
          }
        })

      presenceChannelRef.current = presenceChannel

      supabase.from('channel_reads').upsert(
        { channel_id: channelId, user_id: session.user.id, last_read_at: new Date().toISOString() },
        { onConflict: 'channel_id,user_id' }
      ).then(() => {})
    }

    init()
    return () => {
      cancelled = true
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      if (realtimeChannel) supabase.removeChannel(realtimeChannel)
      if (presenceChannelRef.current) supabase.removeChannel(presenceChannelRef.current)
      realtimeChannelRef.current = null
      presenceChannelRef.current = null
    }
  }, [channelId, session?.user?.id])

  // ── 입력중 Presence 추적 ──────────────────────────────────────────────────
  const trackTyping = useCallback(async (isTyping: boolean) => {
    const ch = presenceChannelRef.current
    if (!ch || !session?.user) return
    const myId = session.user.id
    const name = profileCacheRef.current[myId]?.display_name ?? '나'
    await ch.track({ typing: isTyping, userId: myId, name })
  }, [session?.user?.id])

  const handleInputChange = useCallback((text: string) => {
    setInputText(text)
    if (!text.trim()) {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      trackTyping(false)
      return
    }
    trackTyping(true)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => trackTyping(false), 3000)
  }, [trackTyping])

  // ── 텍스트 전송 ────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || !session?.user || !channelId || sending) return

    const tempId = `optimistic-${Date.now()}`
    const myProfile: SenderInfo = profileCacheRef.current[session.user.id] ?? {
      id: session.user.id, display_name: '나', avatar_url: null,
    }
    const optimisticMsg: ChatMessage = {
      id: tempId, channelId, senderId: session.user.id,
      content: text, type: 'text', createdAt: new Date().toISOString(), sender: myProfile,
    }

    setMessages((prev) => [...prev, optimisticMsg])
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50)
    setInputText('')
    setSending(true)
    // 전송 즉시 입력중 표시 해제
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    trackTyping(false)

    const { data, error } = await supabase
      .from('messages')
      .insert({ channel_id: channelId, sender_id: session.user.id, content: text, type: 'text' })
      .select('id').single()

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setInputText(text)
      Alert.alert('전송 실패', error.message)
    } else if (data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: data.id } : m)))
    }

    setSending(false)
  }, [inputText, channelId, session?.user?.id, sending])

  useEffect(() => { handleSendRef.current = handleSend }, [handleSend])

  // ── 첨부 전송 ──────────────────────────────────────────────────────────────
  const handleAttachSend = useCallback(
    async (result: Awaited<ReturnType<typeof pickImage>>) => {
      if (!result || !session?.user || !channelId) return

      const { data: msgData, error: msgError } = await supabase
        .from('messages')
        .insert({
          channel_id: channelId,
          sender_id: session.user.id,
          content: result.fileName,
          type: result.msgType,
        })
        .select('id').single()

      if (msgError || !msgData) {
        Alert.alert('전송 실패', msgError?.message ?? '메시지를 보낼 수 없습니다.')
        return
      }

      const { error: attachError } = await supabase.from('attachments').insert({
        message_id: msgData.id,
        storage_path: result.storagePath,
        mime_type: result.mimeType,
        size_bytes: result.sizeBytes,
        width: result.width,
        height: result.height,
      })

      if (attachError) console.error('[chat] attachments insert error:', attachError)
    },
    [channelId, session?.user?.id]
  )

  // ── 첨부 메뉴 ──────────────────────────────────────────────────────────────
  const openAttachMenu = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['취소', '이미지', '파일'], cancelButtonIndex: 0 },
        async (idx) => {
          if (idx === 1) handleAttachSend(await pickImage(channelId!))
          if (idx === 2) handleAttachSend(await pickFile(channelId!))
        }
      )
    } else {
      // Android / Web: 직접 메뉴 토글
      setShowAttachMenu((v) => !v)
    }
  }, [channelId, pickImage, pickFile, handleAttachSend])

  // ── 로딩 / 에러 ────────────────────────────────────────────────────────────
  if (pageStatus.status === 'loading') {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#4A90D9" /></View>
  }
  if (pageStatus.status === 'error') {
    return <View style={styles.centered}><Text style={styles.errorText}>{pageStatus.message}</Text></View>
  }

  const myId = session?.user?.id ?? ''
  const isBusy = sending || uploading

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>아직 메시지가 없어요. 첫 메시지를 보내보세요!</Text>
          </View>
        }
        renderItem={({ item }) =>
          item.senderId === myId
            ? <MyMessageBubble msg={item} />
            : <OtherMessageBubble msg={item} />
        }
      />

      {/* Android/Web 첨부 메뉴 */}
      {showAttachMenu && (
        <View style={styles.attachMenu}>
          <Pressable
            style={styles.attachMenuItem}
            onPress={async () => {
              setShowAttachMenu(false)
              handleAttachSend(await pickImage(channelId!))
            }}
          >
            <Text style={styles.attachMenuIcon}>🖼️</Text>
            <Text style={styles.attachMenuText}>이미지</Text>
          </Pressable>
          <Pressable
            style={styles.attachMenuItem}
            onPress={async () => {
              setShowAttachMenu(false)
              handleAttachSend(await pickFile(channelId!))
            }}
          >
            <Text style={styles.attachMenuIcon}>📄</Text>
            <Text style={styles.attachMenuText}>파일</Text>
          </Pressable>
        </View>
      )}

      {/* 입력중 표시 */}
      {typingUsers.length > 0 && (
        <View style={styles.typingBar}>
          <Text style={styles.typingText}>
            {typingUsers.map((u) => u.name).join(', ')}
            {typingUsers.length === 1 ? '님이 입력 중...' : '님이 입력 중...'}
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputBar}>
          {/* 첨부 버튼 */}
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

          <TextInput
            ref={inputRef}
            style={styles.input}
            value={inputText}
            onChangeText={handleInputChange}
            placeholder="메시지를 입력하세요"
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <Pressable
            style={({ pressed }) => [
              styles.sendButton,
              (!inputText.trim() || isBusy) && styles.sendButtonDisabled,
              pressed && styles.sendButtonPressed,
              Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || isBusy}
            accessibilityRole="button"
            accessibilityLabel="메시지 보내기"
          >
            {sending
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={styles.sendButtonText}>보내기</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  listContent: { padding: 16, paddingBottom: 8, gap: 12, flexGrow: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },

  myRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 6 },
  myTime: { fontSize: 11, color: '#9CA3AF', marginBottom: 2 },
  myBubble: {
    backgroundColor: '#4A90D9',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: '75%',
  },
  myText: { fontSize: 15, color: '#FFFFFF', lineHeight: 20 },

  otherRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  avatarPlaceholder: {
    backgroundColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 18,
  },
  avatarInitials: { color: '#FFFFFF', fontWeight: '700' },
  otherContent: { maxWidth: '75%', gap: 4 },
  senderName: { fontSize: 12, fontWeight: '600', color: '#374151' },
  otherTime: { fontSize: 11, fontWeight: '400', color: '#9CA3AF' },
  otherBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  otherText: { fontSize: 15, color: '#1A1A1A', lineHeight: 20 },

  mediaBubble: { padding: 6 },

  attachMenu: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
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
    backgroundColor: '#F3F4F6',
  },
  attachMenuIcon: { fontSize: 24 },
  attachMenuText: { fontSize: 11, color: '#374151', fontWeight: '600' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  attachButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  attachButtonText: { fontSize: 20 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    color: '#1A1A1A',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  sendButton: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  sendButtonDisabled: { backgroundColor: '#93C5FD' },
  sendButtonPressed: { opacity: 0.8 },
  sendButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  errorText: { fontSize: 15, color: '#DC2626', textAlign: 'center', paddingHorizontal: 24 },

  typingBar: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#F9FAFB',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  typingText: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' },
})
