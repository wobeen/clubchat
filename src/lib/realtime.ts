import { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

// 이 프로젝트의 supabase 클라이언트 타입(Database 제네릭 포함)을 그대로 재사용한다.
type SupabaseClientType = typeof supabase

/**
 * Realtime 채널 topic 이름을 만드는 헬퍼.
 * 여러 화면(채팅, 프레즌스, 클럽 안 읽음 배지 등)이 각자 문자열 템플릿을 흩어 쓰던 것을
 * 한곳에 모아, 같은 방을 가리키는 topic 이름이 항상 동일하게 생성되도록 한다.
 */
export const topics = {
  chatMessages: (channelId: string) => `chat:msgs:${channelId}`,
  chatPresence: (channelId: string) => `chat:presence:${channelId}`,
  clubUnread: (clubId: string) => `club-unread:${clubId}`,
}

/**
 * Supabase Realtime은 같은 topic으로 다시 subscribe하기 전에, 이전에 남아있던
 * (예: 빠른 재마운트·StrictMode·화면 재진입 등으로 정리되지 않은) 채널을 먼저 정리해야
 * 중복 구독으로 인한 이벤트 누락/중복을 막을 수 있다.
 *
 * app/(app)/channels/[id]/chat.tsx가 하던 것과 동일한 로직을 일반화했다:
 * supabase.channel(name)으로 만든 채널의 실제 topic은 내부적으로 `realtime:${name}`
 * 접두사가 붙으므로, 여기 전달하는 topicName들도 그 접두사를 붙여 비교한다.
 */
export async function removeStaleChannels(
  client: SupabaseClientType | SupabaseClient,
  ...topicNames: string[]
): Promise<void> {
  const fullNames = new Set(topicNames.map((name) => `realtime:${name}`))
  const stale = client.getChannels().filter((ch) => fullNames.has(ch.topic))
  await Promise.all(stale.map((ch) => client.removeChannel(ch)))
}
