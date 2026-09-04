// ─── 방 상세패널용 멤버 목록 ──────────────────────────────────────────────────────
// RoomDetailPane에서만 쓰는 가벼운 조회. ChatScreen의 MemberProfileCard(아바타 클릭 시
// 단건 프로필 조회)와는 용도가 달라서 합치지 않았다 — 여긴 방 전체 멤버 리스트.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export interface ChannelMemberSummary {
  id: string
  display_name: string
  avatar_emoji: string | null
}

export function useChannelMembers(channelId: string | undefined) {
  const [members, setMembers] = useState<ChannelMemberSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshCounter, setRefreshCounter] = useState(0)
  const refresh = useCallback(() => setRefreshCounter((c) => c + 1), [])

  useEffect(() => {
    if (!channelId) {
      setMembers([])
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('channel_members')
        .select('user_id, profiles(id, display_name, avatar_emoji)')
        .eq('channel_id', channelId as string)

      if (cancelled) return

      if (error) {
        console.error('[useChannelMembers] fetch error:', error)
        setLoading(false)
        return
      }

      setMembers(
        (data ?? []).flatMap((row) => {
          const profile = row.profiles as { id: string; display_name: string; avatar_emoji: string | null } | null
          if (!profile) return []
          return [{ id: profile.id, display_name: profile.display_name, avatar_emoji: profile.avatar_emoji }]
        })
      )
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [channelId, refreshCounter])

  return { members, loading, refresh }
}
