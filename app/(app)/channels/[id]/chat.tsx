import { useCallback, useEffect, useRef, useState } from 'react'
import {
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
import { useLocalSearchParams, useNavigation } from 'expo-router'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../../../src/lib/supabase'
import { useAuth } from '../../../../src/features/auth/useAuth'
import { Database } from '../../../../src/types/supabase'

type ProfileRow = Database['public']['Tables']['profiles']['Row']
type SenderInfo = Pick<ProfileRow, 'id' | 'display_name' | 'avatar_url'>

interface ChatMessage {
  id: string
  channelId: string
  senderId: string
  content: string
  createdAt: string
  sender: SenderInfo
}

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' }

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${hh}:${mm}`
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
}

function AvatarPlaceholder({ name, size }: { name: string; size: number }) {
  return (
    <View
      style={[
        styles.avatarPlaceholder,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarInitials, { fontSize: size * 0.4 }]}>
        {getInitials(name)}
      </Text>
    </View>
  )
}

function MyMessageBubble({ msg }: { msg: ChatMessage }) {
  return (
    <View style={styles.myRow}>
      <Text style={styles.myTime}>{formatTime(msg.createdAt)}</Text>
      <View style={styles.myBubble}>
        <Text style={styles.myText}>{msg.content}</Text>
      </View>
    </View>
  )
}

function OtherMessageBubble({ msg }: { msg: ChatMessage }) {
  return (
    <View style={styles.otherRow}>
      <AvatarPlaceholder name={msg.sender.display_name} size={32} />
      <View style={styles.otherContent}>
        <Text style={styles.senderName}>
          {msg.sender.display_name}
          <Text style={styles.otherTime}>  {formatTime(msg.createdAt)}</Text>
        </Text>
        <View style={styles.otherBubble}>
          <Text style={styles.otherText}>{msg.content}</Text>
        </View>
      </View>
    </View>
  )
}

export default function ChatScreen() {
  const { id: channelId, channelName } = useLocalSearchParams<{
    id: string
    channelName: string
  }>()
  const { session } = useAuth()
  const navigation = useNavigation()
  const flatListRef = useRef<FlatList<ChatMessage>>(null)

  const [pageStatus, setPageStatus] = useState<PageState>({ status: 'loading' })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)

  // 보낸 사람 정보 캐시 (Realtime 수신 시 추가 fetch 최소화)
  const profileCacheRef = useRef<Record<string, SenderInfo>>({})
  // 웹 keydown 리스너가 항상 최신 handleSend를 호출하도록 유지
  const handleSendRef = useRef<() => void>(() => {})
  // TextInput DOM 요소 참조 (웹 keydown addEventListener 전용)
  const inputRef = useRef<TextInput>(null)

  useEffect(() => {
    navigation.setOptions({ title: channelName ?? '채팅' })
  }, [channelName])

  // 웹 전용: TextInput의 textarea DOM 요소에 keydown 리스너 직접 부착
  // (React Native Web은 spread prop으로 넘긴 onKeyDown을 DOM에 전달하지 않음)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    if (pageStatus.status !== 'ready') return

    // RNW에서 TextInput ref는 underlying textarea DOM 요소
    const el = inputRef.current as unknown as HTMLTextAreaElement | null
    if (!el?.addEventListener) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSendRef.current()
      }
    }

    el.addEventListener('keydown', onKeyDown)
    return () => el.removeEventListener('keydown', onKeyDown)
  }, [pageStatus.status])

  useEffect(() => {
    if (!channelId || !session?.user) return

    let realtimeChannel: RealtimeChannel | null = null
    let cancelled = false

    async function init() {
      if (!session?.user || !channelId) return

      // ① 초기 메시지 50건 로드 (프로필 join)
      const { data, error } = await supabase
        .from('messages')
        .select(
          `id, channel_id, sender_id, content, type, created_at,
           sender:profiles!messages_sender_id_fkey(id, display_name, avatar_url)`
        )
        .eq('channel_id', channelId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(50)

      if (cancelled) return

      if (error) {
        console.error('[ChatScreen] messages fetch error:', error)
        setPageStatus({ status: 'error', message: '메시지를 불러올 수 없습니다.' })
        return
      }

      const loaded: ChatMessage[] = (data ?? []).map((row) => {
        const sender = row.sender as SenderInfo
        profileCacheRef.current[sender.id] = sender
        return {
          id: row.id,
          channelId: row.channel_id,
          senderId: row.sender_id,
          content: row.content,
          createdAt: row.created_at,
          sender,
        }
      })

      setMessages(loaded)

      if (cancelled) return

      // 내 프로필이 캐시에 없으면 별도 fetch — 빈 채널 첫 입장 시에도 낙관적 업데이트 가능
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

      // ② Realtime 구독
      realtimeChannel = supabase
        .channel(`chat:${channelId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `channel_id=eq.${channelId}`,
          },
          async (payload) => {
            if (cancelled) return
            const row = payload.new as {
              id: string
              channel_id: string
              sender_id: string
              content: string
              created_at: string
            }

            // 프로필 캐시 조회, 없으면 fetch
            let sender = profileCacheRef.current[row.sender_id]
            if (!sender) {
              const { data: pData } = await supabase
                .from('profiles')
                .select('id, display_name, avatar_url')
                .eq('id', row.sender_id)
                .maybeSingle()
              if (pData) {
                sender = pData
                profileCacheRef.current[pData.id] = pData
              } else {
                sender = { id: row.sender_id, display_name: '알 수 없음', avatar_url: null }
              }
            }

            const newMsg: ChatMessage = {
              id: row.id,
              channelId: row.channel_id,
              senderId: row.sender_id,
              content: row.content,
              createdAt: row.created_at,
              sender,
            }

            setMessages((prev) => {
              // 중복 방지 (자신이 보낸 메시지가 Realtime으로 돌아올 때)
              if (prev.some((m) => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })

            // 읽음 포인터 갱신
            if (session?.user) {
              supabase
                .from('channel_reads')
                .upsert(
                  {
                    channel_id: channelId,
                    user_id: session.user.id,
                    last_read_at: new Date().toISOString(),
                  },
                  { onConflict: 'channel_id,user_id' }
                )
                .then(() => {})
            }

            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50)
          }
        )
        .subscribe()

      // ③ 진입 시 읽음 포인터 초기화
      supabase
        .from('channel_reads')
        .upsert(
          {
            channel_id: channelId,
            user_id: session.user.id,
            last_read_at: new Date().toISOString(),
          },
          { onConflict: 'channel_id,user_id' }
        )
        .then(() => {})
    }

    init()

    // ④ cleanup
    return () => {
      cancelled = true
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel)
      }
    }
  }, [channelId, session?.user?.id])

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || !session?.user || !channelId || sending) return

    // 낙관적 업데이트용 임시 ID
    const tempId = `optimistic-${Date.now()}`

    // 내 프로필: 캐시에서 가져오거나 폴백 (빈 채널 등 예외 대비)
    const myProfile: SenderInfo = profileCacheRef.current[session.user.id] ?? {
      id: session.user.id,
      display_name: '나',
      avatar_url: null,
    }

    const optimisticMsg: ChatMessage = {
      id: tempId,
      channelId,
      senderId: session.user.id,
      content: text,
      createdAt: new Date().toISOString(),
      sender: myProfile,
    }

    // 즉시 목록에 추가 + 스크롤
    setMessages((prev) => [...prev, optimisticMsg])
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50)
    setInputText('')
    setSending(true)

    const { data, error } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        sender_id: session.user.id,
        content: text,
        type: 'text',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[ChatScreen] send error | code:', error.code, '| message:', error.message, '| details:', error.details)
      // 롤백: 낙관적 메시지 제거, 입력 복원
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setInputText(text)
      Alert.alert(
        '전송 실패',
        `메시지를 보낼 수 없습니다.\n\n오류: ${error.message ?? error.code}`,
        [{ text: '확인' }]
      )
    } else if (data) {
      // 임시 ID → 실제 DB ID 교체 (Realtime echo 도착 시 중복 방지)
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, id: data.id } : m))
      )
    }

    setSending(false)
  }, [inputText, channelId, session?.user?.id, sending])

  // handleSend가 재생성될 때마다 ref를 최신으로 유지 (정의 뒤에 위치해야 함)
  useEffect(() => {
    handleSendRef.current = handleSend
  }, [handleSend])

  if (pageStatus.status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    )
  }

  if (pageStatus.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{pageStatus.message}</Text>
      </View>
    )
  }

  const myId = session?.user?.id ?? ''

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
          item.senderId === myId ? (
            <MyMessageBubble msg={item} />
          ) : (
            <OtherMessageBubble msg={item} />
          )
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputBar}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="메시지를 입력하세요"
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <Pressable
            style={({ pressed }) => [
              styles.sendButton,
              (!inputText.trim() || sending) && styles.sendButtonDisabled,
              pressed && styles.sendButtonPressed,
              Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="메시지 보내기"
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.sendButtonText}>보내기</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  listContent: {
    padding: 16,
    paddingBottom: 8,
    gap: 12,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },

  // 내 메시지 (오른쪽)
  myRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    gap: 6,
  },
  myTime: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  myBubble: {
    backgroundColor: '#4A90D9',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: '75%',
  },
  myText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 20,
  },

  // 남의 메시지 (왼쪽)
  otherRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  avatarPlaceholder: {
    backgroundColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 18,
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  otherContent: {
    maxWidth: '75%',
    gap: 4,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  otherTime: {
    fontSize: 11,
    fontWeight: '400',
    color: '#9CA3AF',
  },
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
  otherText: {
    fontSize: 15,
    color: '#1A1A1A',
    lineHeight: 20,
  },

  // 입력창
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
  sendButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  sendButtonPressed: {
    opacity: 0.8,
  },
  sendButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  errorText: {
    fontSize: 15,
    color: '#DC2626',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
})
