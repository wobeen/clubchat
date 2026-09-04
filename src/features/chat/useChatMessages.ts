import { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { removeStaleChannels, topics } from '../../lib/realtime'
import { supabase } from '../../lib/supabase'
import { UploadResult } from './useAttachmentUpload'
import { Attachment, ChatMessage, ChatStatus, SenderInfo } from './types'

interface TypingUser {
  userId: string
  name: string
}

interface UseChatMessagesReturn {
  messages: ChatMessage[]
  status: ChatStatus
  error: string | null
  typingUsers: TypingUser[]
  send(text: string): Promise<void>
  editMessage(id: string, text: string): Promise<void>
  deleteMessage(id: string): Promise<void>
  sendAttachment(result: UploadResult): Promise<void>
  setTyping(isTyping: boolean): void
  retry(): void
}

/**
 * 채팅 화면의 데이터 계층. app/(app)/channels/[id]/chat.tsx가 직접 갖고 있던
 * 초기 로드 + Realtime 구독(메시지/프레즌스) + 낙관적 전송/수정/삭제/첨부 로직을 그대로 옮겼다.
 * UI 상태(입력창 텍스트, 수정 모드 여부 등)는 이 훅이 아니라 ChatScreen이 소유한다.
 */
export function useChatMessages(channelId: string, currentUserId: string): UseChatMessagesReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<ChatStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const [retryCounter, setRetryCounter] = useState(0)

  const profileCacheRef = useRef<Record<string, SenderInfo>>({})
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)
  const presenceChannelRef = useRef<RealtimeChannel | null>(null)

  const retry = useCallback(() => {
    setStatus('loading')
    setError(null)
    setRetryCounter((c) => c + 1)
  }, [])

  // ── 초기 로드 + Realtime 구독 ────────────────────────────────────────────
  useEffect(() => {
    if (!channelId || !currentUserId) return

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
      const { data, error: fetchError } = await supabase
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
      if (fetchError) {
        setStatus('error')
        setError('메시지를 불러올 수 없습니다.')
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

      if (!profileCacheRef.current[currentUserId]) {
        const { data: ownProfile } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, avatar_emoji')
          .eq('id', currentUserId)
          .maybeSingle()
        if (ownProfile) profileCacheRef.current[ownProfile.id] = ownProfile
      }

      if (cancelled) return
      setStatus('ready')
      setError(null)

      const myId = currentUserId
      const myName = profileCacheRef.current[myId]?.display_name ?? '나'

      await removeStaleChannels(supabase, topics.chatMessages(channelId), topics.chatPresence(channelId))
      if (cancelled) return

      // ── 메시지 채널: INSERT + UPDATE 구독 ─────────────────────────────────
      realtimeChannel = supabase
        .channel(topics.chatMessages(channelId))
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

            supabase.from('channel_reads').upsert(
              { channel_id: channelId, user_id: currentUserId, last_read_at: new Date().toISOString() },
              { onConflict: 'channel_id,user_id' }
            ).then(() => {})
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
        .channel(topics.chatPresence(channelId))
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
        .subscribe(async (subStatus) => {
          if (subStatus === 'SUBSCRIBED' && !cancelled) {
            await presenceChannel.track({ typing: false, userId: myId, name: myName })
          }
        })

      presenceChannelRef.current = presenceChannel

      supabase.from('channel_reads').upsert(
        { channel_id: channelId, user_id: currentUserId, last_read_at: new Date().toISOString() },
        { onConflict: 'channel_id,user_id' }
      ).then(() => {})
    }

    init()
    return () => {
      cancelled = true
      if (realtimeChannel) supabase.removeChannel(realtimeChannel)
      if (presenceChannelRef.current) supabase.removeChannel(presenceChannelRef.current)
      realtimeChannelRef.current = null
      presenceChannelRef.current = null
    }
  }, [channelId, currentUserId, retryCounter])

  // ── 입력중 Presence 추적 ──────────────────────────────────────────────────
  const setTyping = useCallback(
    (isTyping: boolean) => {
      const ch = presenceChannelRef.current
      if (!ch || !currentUserId) return
      const name = profileCacheRef.current[currentUserId]?.display_name ?? '나'
      ch.track({ typing: isTyping, userId: currentUserId, name }).catch(() => {})
    },
    [currentUserId]
  )

  // ── 텍스트 전송(낙관적) ────────────────────────────────────────────────────
  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !channelId || !currentUserId) return

      const tempId = `optimistic-${Date.now()}`
      const myProfile: SenderInfo = profileCacheRef.current[currentUserId] ?? {
        id: currentUserId, display_name: '나', avatar_url: null, avatar_emoji: null,
      }
      const optimisticMsg: ChatMessage = {
        id: tempId, channelId, senderId: currentUserId,
        content: trimmed, type: 'text', createdAt: new Date().toISOString(),
        editedAt: null, deletedAt: null, sender: myProfile,
      }

      setMessages((prev) => [...prev, optimisticMsg])

      const { data, error: insertError } = await supabase
        .from('messages')
        .insert({ channel_id: channelId, sender_id: currentUserId, content: trimmed, type: 'text' })
        .select('id').single()

      if (insertError) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        throw new Error(insertError.message)
      }

      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: data.id } : m)))
    },
    [channelId, currentUserId]
  )

  // ── 메시지 수정 ────────────────────────────────────────────────────────────
  const editMessage = useCallback(async (id: string, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const editedAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('messages')
      .update({ content: trimmed, edited_at: editedAt })
      .eq('id', id)
    if (updateError) throw new Error(updateError.message)
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: trimmed, editedAt } : m)))
  }, [])

  // ── 메시지 삭제(소프트) ─────────────────────────────────────────────────
  const deleteMessage = useCallback(async (id: string) => {
    const deletedAt = new Date().toISOString()
    const { error: deleteError } = await supabase
      .from('messages')
      .update({ deleted_at: deletedAt })
      .eq('id', id)
    if (deleteError) throw new Error(deleteError.message)
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deletedAt } : m)))
  }, [])

  // ── 첨부 전송 ──────────────────────────────────────────────────────────────
  const sendAttachment = useCallback(
    async (result: UploadResult) => {
      if (!channelId || !currentUserId) return

      const { data: msgData, error: msgError } = await supabase
        .from('messages')
        .insert({
          channel_id: channelId,
          sender_id: currentUserId,
          content: result.fileName,
          type: result.msgType,
        })
        .select('id').single()

      if (msgError || !msgData) {
        throw new Error(msgError?.message ?? '메시지를 보낼 수 없습니다.')
      }

      const { error: attachError } = await supabase.from('attachments').insert({
        message_id: msgData.id,
        storage_path: result.storagePath,
        mime_type: result.mimeType,
        size_bytes: result.sizeBytes,
        width: result.width,
        height: result.height,
      })

      if (attachError) console.error('[useChatMessages] attachments insert error:', attachError)
    },
    [channelId, currentUserId]
  )

  return { messages, status, error, typingUsers, send, editMessage, deleteMessage, sendAttachment, setTyping, retry }
}
