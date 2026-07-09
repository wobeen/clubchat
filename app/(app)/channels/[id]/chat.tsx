import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionSheetIOS,
  ActivityIndicator,
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
import { MemberProfileCard, MemberProfile } from '../../../../src/features/club/MemberProfileCard'
import { useToast } from '../../../../src/features/ui/Toast'
import { useConfirm } from '../../../../src/features/ui/ConfirmDialog'
import { useActionSheet } from '../../../../src/features/ui/ActionSheet'

// ─── 타입 ────────────────────────────────────────────────────────────────────

type ProfileRow = Database['public']['Tables']['profiles']['Row']
type SenderInfo = Pick<ProfileRow, 'id' | 'display_name' | 'avatar_url'> & {
  avatar_emoji?: string | null
  grade?: string | null
  birth_year?: number | null
  gender?: string | null
}

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
  editedAt: string | null
  deletedAt: string | null
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

const AVATAR_COLORS = [
  { bg: '#E8F7EE', text: '#1FA65A' },
  { bg: '#FDF0E7', text: '#E07A2E' },
  { bg: '#F0EAFB', text: '#7B5CD6' },
  { bg: '#E7F5FB', text: '#2493C6' },
  { bg: '#FBEFF3', text: '#D6588A' },
  { bg: '#EDEFF2', text: '#6B7684' },
]

function getAvatarColor(name: string) {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function AvatarPlaceholder({ name, emoji, size }: { name: string; emoji?: string | null; size: number }) {
  const circleStyle = { width: size, height: size, borderRadius: size / 2 }
  if (emoji) {
    return (
      <View style={[styles.avatarPlaceholder, circleStyle, { backgroundColor: '#FFF3E0' }]}>
        <Text style={{ fontSize: size * 0.55 }}>{emoji}</Text>
      </View>
    )
  }
  const color = getAvatarColor(name)
  return (
    <View style={[styles.avatarPlaceholder, circleStyle, { backgroundColor: color.bg }]}>
      <Text style={[styles.avatarInitials, { fontSize: size * 0.38, color: color.text }]}>{getInitials(name)}</Text>
    </View>
  )
}

function MyMessageBubble({ msg, onLongPress }: { msg: ChatMessage; onLongPress?: () => void }) {
  const hasAttachment = !!msg.attachment && msg.type !== 'text'

  if (msg.deletedAt) {
    return (
      <View style={styles.myRow}>
        <View style={[styles.myBubble, styles.deletedBubble]}>
          <Text style={styles.deletedText}>삭제된 메시지입니다</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.myRow}>
      <Text style={styles.myTime}>{formatTime(msg.createdAt)}</Text>
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={300}
        style={[styles.myBubble, hasAttachment && styles.mediaBubble]}
      >
        {hasAttachment ? (
          <AttachmentMessage fileName={msg.content} attachment={msg.attachment!} tint="blue" />
        ) : (
          <>
            <Text style={styles.myText}>{msg.content}</Text>
            {msg.editedAt && <Text style={styles.editedMark}>(수정됨)</Text>}
          </>
        )}
      </Pressable>
    </View>
  )
}

function OtherMessageBubble({ msg, onAvatarPress }: { msg: ChatMessage; onAvatarPress?: () => void }) {
  const hasAttachment = !!msg.attachment && msg.type !== 'text'

  if (msg.deletedAt) {
    return (
      <View style={styles.otherRow}>
        <Pressable onPress={onAvatarPress} hitSlop={4}>
          <AvatarPlaceholder name={msg.sender.display_name} emoji={msg.sender.avatar_emoji} size={32} />
        </Pressable>
        <View style={styles.otherContent}>
          <Text style={styles.senderName}>{msg.sender.display_name}</Text>
          <View style={[styles.otherBubble, styles.deletedBubble]}>
            <Text style={styles.deletedText}>삭제된 메시지입니다</Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.otherRow}>
      <Pressable onPress={onAvatarPress} style={styles.avatarPressable} hitSlop={4}>
        <AvatarPlaceholder name={msg.sender.display_name} emoji={msg.sender.avatar_emoji} size={32} />
      </Pressable>
      <View style={styles.otherContent}>
        <Text style={styles.senderName}>
          {msg.sender.display_name}
          <Text style={styles.otherTime}>  {formatTime(msg.createdAt)}</Text>
        </Text>
        <View style={[styles.otherBubble, hasAttachment && styles.mediaBubble]}>
          {hasAttachment ? (
            <AttachmentMessage fileName={msg.content} attachment={msg.attachment!} tint="white" />
          ) : (
            <>
              <Text style={styles.otherText}>{msg.content}</Text>
              {msg.editedAt && <Text style={styles.editedMarkOther}>(수정됨)</Text>}
            </>
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

  const [pageStatus, setPageStatus] = useState<PageState>({ status: 'loading' })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')

  const profileCacheRef = useRef<Record<string, SenderInfo>>({})
  const handleSendRef = useRef<() => void>(() => {})
  const inputRef = useRef<TextInput>(null)
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)
  const presenceChannelRef = useRef<RealtimeChannel | null>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [typingUsers, setTypingUsers] = useState<{ userId: string; name: string }[]>([])
  const [profileCard, setProfileCard] = useState<MemberProfile | null>(null)
  const { show: showToast, ToastComponent } = useToast()
  const { confirm, ConfirmComponent } = useConfirm()
  const { showActionSheet, ActionSheetComponent } = useActionSheet()

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
            <Text style={{ color: '#3B7DD8', fontSize: 15, fontWeight: '600' }}>일정</Text>
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

    async function fetchAttachmentForMsg(messageId: string): Promise<Attachment | undefined> {
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
          `id, channel_id, sender_id, content, type, created_at, edited_at,
           sender:profiles!messages_sender_id_fkey(id, display_name, avatar_url, avatar_emoji, grade, birth_year, gender),
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
          editedAt: row.edited_at ?? null,
          deletedAt: null,
          sender,
          attachment,
        }
      })

      setMessages(loaded)
      if (cancelled) return

      if (!profileCacheRef.current[session.user.id]) {
        const { data: ownProfile } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, avatar_emoji')
          .eq('id', session.user.id)
          .maybeSingle()
        if (ownProfile) profileCacheRef.current[ownProfile.id] = ownProfile
      }

      if (cancelled) return
      setPageStatus({ status: 'ready' })

      const myId = session.user.id
      const myName = profileCacheRef.current[myId]?.display_name ?? '나'

      const msgsTopicName = `realtime:chat:msgs:${channelId}`
      const presenceTopicName = `realtime:chat:presence:${channelId}`
      const stale = supabase.getChannels().filter(
        (ch) => ch.topic === msgsTopicName || ch.topic === presenceTopicName,
      )
      await Promise.all(stale.map((ch) => supabase.removeChannel(ch)))

      if (cancelled) return

      // ── 메시지 채널: INSERT + UPDATE 구독 ─────────────────────────────────
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
                .from('profiles').select('id, display_name, avatar_url, avatar_emoji').eq('id', row.sender_id).maybeSingle()
              sender = pData ?? { id: row.sender_id, display_name: '알 수 없음', avatar_url: null, avatar_emoji: null }
              if (pData) profileCacheRef.current[pData.id] = pData
            }

            const msgType = row.type as ChatMessage['type']
            const attachment =
              msgType === 'image' || msgType === 'file'
                ? await fetchAttachmentForMsg(row.id)
                : undefined

            const newMsg: ChatMessage = {
              id: row.id, channelId: row.channel_id, senderId: row.sender_id,
              content: row.content, type: msgType, createdAt: row.created_at,
              editedAt: null, deletedAt: null, sender, attachment,
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

          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
          (payload) => {
            if (cancelled) return
            const row = payload.new as {
              id: string; content: string; edited_at: string | null; deleted_at: string | null
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === row.id
                  ? { ...m, content: row.content, editedAt: row.edited_at, deletedAt: row.deleted_at }
                  : m
              )
            )
          }
        )
        .subscribe()

      realtimeChannelRef.current = realtimeChannel

      // ── 프레즌스 채널 ────────────────────────────────────────────────────────
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

  // ── 메시지 삭제 (소프트) ─────────────────────────────────────────────────
  const deleteMessage = useCallback(async (messageId: string) => {
    const { error } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId)
    if (error) {
      showToast('메시지를 삭제할 수 없습니다.')
      return
    }
    setMessages((prev) =>
      prev.map((m) => m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m)
    )
  }, [showToast])

  // ── 수정 시작/취소 ────────────────────────────────────────────────────────
  const startEdit = useCallback((msg: ChatMessage) => {
    setEditingMessageId(msg.id)
    setEditingContent(msg.content)
    setInputText(msg.content)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingMessageId(null)
    setEditingContent('')
    setInputText('')
  }, [])

  // ── 메시지 액션 시트 ─────────────────────────────────────────────────────
  const openMessageActions = useCallback((msg: ChatMessage) => {
    const confirmDelete = () =>
      confirm({
        title: '메시지 삭제',
        message: '이 메시지를 삭제할까요?',
        confirmText: '삭제',
        destructive: true,
        onConfirm: () => deleteMessage(msg.id),
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
  }, [startEdit, deleteMessage, confirm, showActionSheet])

  // ── 텍스트 전송 / 수정 저장 ──────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || !session?.user || !channelId || sending) return

    // 수정 모드
    if (editingMessageId) {
      setSending(true)
      const { error } = await supabase
        .from('messages')
        .update({ content: text, edited_at: new Date().toISOString() })
        .eq('id', editingMessageId)
      if (error) {
        showToast('메시지를 수정할 수 없습니다.')
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === editingMessageId
              ? { ...m, content: text, editedAt: new Date().toISOString() }
              : m
          )
        )
        setEditingMessageId(null)
        setEditingContent('')
        setInputText('')
      }
      setSending(false)
      return
    }

    // 일반 전송
    const tempId = `optimistic-${Date.now()}`
    const myProfile: SenderInfo = profileCacheRef.current[session.user.id] ?? {
      id: session.user.id, display_name: '나', avatar_url: null, avatar_emoji: null,
    }
    const optimisticMsg: ChatMessage = {
      id: tempId, channelId, senderId: session.user.id,
      content: text, type: 'text', createdAt: new Date().toISOString(),
      editedAt: null, deletedAt: null, sender: myProfile,
    }

    setMessages((prev) => [...prev, optimisticMsg])
    setInputText('')
    setSending(true)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    trackTyping(false)

    const { data, error } = await supabase
      .from('messages')
      .insert({ channel_id: channelId, sender_id: session.user.id, content: text, type: 'text' })
      .select('id').single()

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setInputText(text)
      showToast(`전송 실패: ${error.message}`)
    } else if (data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: data.id } : m)))
    }

    setSending(false)
  }, [inputText, channelId, session?.user?.id, sending, editingMessageId, trackTyping, showToast])

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
        showToast(`전송 실패: ${msgError?.message ?? '메시지를 보낼 수 없습니다.'}`)
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
    [channelId, session?.user?.id, showToast]
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
      setShowAttachMenu((v) => !v)
    }
  }, [channelId, pickImage, pickFile, handleAttachSend])

  // 리스트를 inverted로 렌더링(최신 메시지가 항상 하단에 고정)하기 위해 역순으로 뒤집는다.
  // 이렇게 하면 새 메시지가 와도 스크롤 위치가 자동으로 하단에 붙고, 내가 보낼 때도
  // 수동 scrollToEnd 호출 없이 자연스럽게 반영돼 화면이 튀지 않는다.
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages])

  // ── 로딩 / 에러 ────────────────────────────────────────────────────────────
  if (pageStatus.status === 'loading') {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#3B7DD8" /></View>
  }
  if (pageStatus.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{pageStatus.message}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={() => setPageStatus({ status: 'loading' })}
          accessibilityRole="button"
          accessibilityLabel="다시 시도"
        >
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    )
  }

  const myId = session?.user?.id ?? ''
  const isBusy = sending || uploading

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ToastComponent />
      <ConfirmComponent />
      <ActionSheetComponent />
      <MemberProfileCard profile={profileCard} onClose={() => setProfileCard(null)} />

      {/* 리스트+입력창을 함께 감싸야 키보드가 올라올 때 전송 버튼이 그 위로 따라 올라간다.
          windowSoftInputMode를 adjustPan으로 바꿔서(app.json) 네이티브 리사이즈를 끄고
          KeyboardAvoidingView가 단독으로 레이아웃을 담당하게 했다 — 전에는 adjustResize와
          'height' behavior가 동시에 적용돼 입력창이 찌그러지고 화면이 튀는 문제가 있었다. */}
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          data={invertedMessages}
          inverted
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={[styles.emptyState, styles.invertedFlip]}>
              <Text style={styles.emptyText}>아직 메시지가 없어요. 첫 메시지를 보내보세요!</Text>
            </View>
          }
          renderItem={({ item }) =>
            item.senderId === myId
              ? <MyMessageBubble msg={item} onLongPress={() => openMessageActions(item)} />
              : <OtherMessageBubble msg={item} onAvatarPress={() => handleAvatarPress(item.sender)} />
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
              {typingUsers.map((u) => u.name).join(', ')}님이 입력 중...
            </Text>
          </View>
        )}

        {/* 수정 모드 배너 */}
        {editingMessageId && (
          <View style={styles.editBanner}>
            <Text style={styles.editBannerLabel} numberOfLines={1}>
              수정 중: {editingContent}
            </Text>
            <Pressable
              onPress={cancelEdit}
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
            accessibilityLabel={editingMessageId ? '수정 저장' : '메시지 보내기'}
          >
            {sending
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={styles.sendButtonText}>{editingMessageId ? '✓' : '↑'}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  flexOne: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
  // inverted 리스트라 top/bottom padding이 시각적으로 뒤바뀐다 (아래쪽 여백 16, 위쪽 여백 8을 만들려면 반대로 지정).
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 14, flexGrow: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  // ListEmptyComponent는 리스트 셀과 달리 자동으로 뒤집히지 않으므로 직접 역상쇄한다.
  invertedFlip: { transform: [{ scaleY: -1 }] },
  emptyText: { fontSize: 14, color: '#8B95A1', textAlign: 'center' },

  myRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 6 },
  myTime: { fontSize: 11, color: '#A9B1BA', marginBottom: 2 },
  myBubble: {
    backgroundColor: '#3B7DD8',
    borderRadius: 18,
    borderTopRightRadius: 4,
    paddingVertical: 11,
    paddingHorizontal: 15,
    maxWidth: '75%',
  },
  myText: { fontSize: 15, color: '#FFFFFF', lineHeight: 22 },
  editedMark: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2, textAlign: 'right' },
  editedMarkOther: { fontSize: 11, color: '#A9B1BA', marginTop: 2 },

  deletedBubble: { backgroundColor: '#F2F4F6', borderWidth: StyleSheet.hairlineWidth, borderColor: '#EDEFF2' },
  deletedText: { fontSize: 14, color: '#A9B1BA', fontStyle: 'italic' },

  otherRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  avatarPressable: { alignSelf: 'flex-start' },
  avatarPlaceholder: {
    backgroundColor: '#6B7684',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 18,
  },
  avatarInitials: { color: '#FFFFFF', fontWeight: '700' },
  otherContent: { maxWidth: '75%', gap: 4 },
  senderName: { fontSize: 12, fontWeight: '600', color: '#4E5968' },
  otherTime: { fontSize: 11, fontWeight: '400', color: '#A9B1BA' },
  otherBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderTopLeftRadius: 4,
    paddingVertical: 11,
    paddingHorizontal: 15,
    shadowColor: 'rgba(25,31,40,1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  otherText: { fontSize: 15, color: '#191F28', lineHeight: 22 },

  mediaBubble: { padding: 8 },

  attachMenu: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F2F4F6',
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
    backgroundColor: '#F2F4F6',
  },
  attachMenuIcon: { fontSize: 24 },
  attachMenuText: { fontSize: 11, color: '#4E5968', fontWeight: '600' },

  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#E7EFFF',
    borderTopWidth: 1,
    borderTopColor: '#B3CEED',
    gap: 8,
  },
  editBannerLabel: { flex: 1, fontSize: 13, color: '#3B7DD8' },
  editBannerCancel: { fontSize: 16, color: '#8B95A1', fontWeight: '600' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F2F4F6',
  },
  attachButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#F2F4F6',
  },
  attachButtonText: { fontSize: 18 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#F2F4F6',
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
    backgroundColor: '#3B7DD8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#A8C4ED' },
  sendButtonPressed: { opacity: 0.8 },
  sendButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  errorText: { fontSize: 15, color: '#E5484D', textAlign: 'center', paddingHorizontal: 24, marginBottom: 20 },
  retryButton: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, backgroundColor: '#3B7DD8' },
  retryButtonText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  typingBar: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F2F4F6',
  },
  typingText: { fontSize: 12, color: '#A9B1BA', fontStyle: 'italic' },
})
