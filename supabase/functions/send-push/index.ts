// Supabase Edge Function: send-push
// 트리거: Supabase Database Webhook (messages 테이블 INSERT)
// 설정 위치: Supabase Dashboard → Database → Webhooks
//   - Table: messages, Event: INSERT
//   - URL: https://<project-ref>.supabase.co/functions/v1/send-push
//   - Header: Authorization: Bearer <service_role_key>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: {
    id: string
    channel_id: string
    sender_id: string
    content: string
    type: 'text' | 'file' | 'image' | 'system'
    deleted_at: string | null
  }
  old_record: null | Record<string, unknown>
}

interface ExpoPushMessage {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: 'default' | null
  badge?: number
}

Deno.serve(async (req) => {
  try {
    const payload: WebhookPayload = await req.json()
    const msg = payload.record

    // system 메시지와 삭제된 메시지는 알림 스킵
    if (msg.type === 'system' || msg.deleted_at) {
      return new Response('skipped', { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 채널 멤버 조회 (발신자 제외)
    const { data: members, error: membersErr } = await supabase
      .from('channel_members')
      .select('user_id')
      .eq('channel_id', msg.channel_id)
      .neq('user_id', msg.sender_id)

    if (membersErr || !members?.length) {
      return new Response('no recipients', { status: 200 })
    }

    const recipientIds = members.map((m) => m.user_id)

    // 푸시 토큰 조회
    const { data: tokenRows, error: tokenErr } = await supabase
      .from('push_tokens')
      .select('expo_push_token')
      .in('user_id', recipientIds)

    if (tokenErr || !tokenRows?.length) {
      return new Response('no tokens', { status: 200 })
    }

    // 발신자 이름 + 채널 이름 조회 (병렬)
    const [senderRes, channelRes] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', msg.sender_id).single(),
      supabase.from('channels').select('name').eq('id', msg.channel_id).single(),
    ])

    const senderName = senderRes.data?.display_name ?? '알 수 없음'
    const channelName = channelRes.data?.name ?? '채팅'

    // 알림 본문 결정
    const body =
      msg.type === 'image' ? '📷 이미지를 보냈습니다'
      : msg.type === 'file' ? '📎 파일을 보냈습니다'
      : msg.content.length > 100 ? msg.content.slice(0, 97) + '…'
      : msg.content

    // Expo Push 메시지 조립
    const pushMessages: ExpoPushMessage[] = tokenRows.map((row) => ({
      to: row.expo_push_token,
      title: `${channelName} — ${senderName}`,
      body,
      data: { channelId: msg.channel_id, messageId: msg.id },
      sound: 'default',
      badge: 1,
    }))

    // Expo API는 한 번에 최대 100개 — 청크로 전송
    const results = []
    for (let i = 0; i < pushMessages.length; i += 100) {
      const chunk = pushMessages.slice(i, i + 100)
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(chunk),
      })
      results.push(await res.json())
    }

    return new Response(
      JSON.stringify({ sent: pushMessages.length, results }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (err) {
    console.error('[send-push]', err)
    return new Response(String(err), { status: 500 })
  }
})
