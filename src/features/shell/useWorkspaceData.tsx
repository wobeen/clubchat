// ─── 워크스페이스(셸) 전역 데이터 ────────────────────────────────────────────────
// app/(app)/index.tsx(동아리 목록+안읽음)와 app/(app)/clubs/[id].tsx(활성 동아리의
// 방 목록+안읽음+실시간 구독)가 각각 따로 하던 조회를 한 Provider로 모았다.
// 쿼리 모양(테이블명, RPC, realtime 구독 패턴)은 두 기존 화면의 로직을 그대로
// 재사용했다 — 새로운 데이터 셰이프를 발명하지 않았다.

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabase } from '../../lib/supabase'
import { removeStaleChannels, topics } from '../../lib/realtime'
import { useAuth } from '../auth/useAuth'
import { useWorkspaceNavigation } from './useWorkspaceNavigation'

export interface WorkspaceClub {
  id: string
  name: string
  role: 'owner' | 'admin' | 'member'
  memberCount: number
  channelCount: number
  unreadCount: number
}

export interface WorkspaceRoom {
  id: string
  name: string
  hasPassword: boolean
  ownerId: string
  joined: boolean
  unreadCount: number
}

interface WorkspaceDataContextValue {
  clubs: WorkspaceClub[]
  clubsLoading: boolean
  activeClub: WorkspaceClub | null
  rooms: WorkspaceRoom[]
  roomsLoading: boolean
  refreshClubs: () => void
  refreshRooms: () => void
}

const WorkspaceDataContext = createContext<WorkspaceDataContextValue | undefined>(undefined)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user?.id
  const { clubId: activeClubId } = useWorkspaceNavigation()

  const [clubs, setClubs] = useState<WorkspaceClub[]>([])
  const [clubsLoading, setClubsLoading] = useState(true)
  const [clubsRefreshCounter, setClubsRefreshCounter] = useState(0)
  const refreshClubs = useCallback(() => setClubsRefreshCounter((c) => c + 1), [])

  const [rooms, setRooms] = useState<WorkspaceRoom[]>([])
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roomsRefreshCounter, setRoomsRefreshCounter] = useState(0)
  const refreshRooms = useCallback(() => setRoomsRefreshCounter((c) => c + 1), [])

  // ── 동아리 목록 + 멤버/방 수 + 동아리별 안읽음 합계 ─────────────────────────
  // app/(app)/index.tsx의 useFocusEffect 로드 로직과 동일한 쿼리 셰이프.
  useEffect(() => {
    if (!userId) {
      setClubs([])
      setClubsLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      setClubsLoading(true)

      const [membershipsResult, myChannelsResult] = await Promise.all([
        supabase
          .from('memberships')
          .select('id, role, club_id, clubs(id, name)')
          .eq('user_id', userId as string)
          .order('created_at', { ascending: true }),
        supabase
          .from('channel_members')
          .select('channel_id, channels!inner(club_id)')
          .eq('user_id', userId as string),
      ])

      if (cancelled) return

      if (membershipsResult.error) {
        console.error('[WorkspaceProvider] memberships fetch error:', membershipsResult.error)
        setClubsLoading(false)
        return
      }

      const baseClubs: Array<Omit<WorkspaceClub, 'memberCount' | 'channelCount' | 'unreadCount'>> =
        (membershipsResult.data ?? []).flatMap((m) => {
          const clubData = m.clubs as { id: string; name: string } | null
          if (!clubData) return []
          return [{ id: clubData.id, name: clubData.name, role: (m.role as WorkspaceClub['role']) ?? 'member' }]
        })

      const clubIds = baseClubs.map((c) => c.id)
      const channelEntries = (myChannelsResult.data ?? []) as Array<{
        channel_id: string
        channels: { club_id: string }
      }>
      const channelIds = channelEntries.map((cm) => cm.channel_id)

      const [allMembersResult, allChannelsResult] = await Promise.all([
        clubIds.length > 0
          ? supabase.from('memberships').select('club_id').in('club_id', clubIds)
          : Promise.resolve({ data: [] as Array<{ club_id: string }> }),
        clubIds.length > 0
          ? supabase.from('channels').select('club_id').in('club_id', clubIds)
          : Promise.resolve({ data: [] as Array<{ club_id: string | null }> }),
      ])

      if (cancelled) return

      const memberCounts: Record<string, number> = {}
      for (const m of (allMembersResult as { data: Array<{ club_id: string }> | null }).data ?? []) {
        memberCounts[m.club_id] = (memberCounts[m.club_id] ?? 0) + 1
      }

      const channelCounts: Record<string, number> = {}
      for (const c of (allChannelsResult as { data: Array<{ club_id: string | null }> | null }).data ?? []) {
        if (c.club_id) channelCounts[c.club_id] = (channelCounts[c.club_id] ?? 0) + 1
      }

      let clubUnreads: Record<string, number> = {}
      if (channelIds.length > 0) {
        const { data: unreadData } = await (supabase as any).rpc('get_unread_counts', {
          p_channel_ids: channelIds,
        })
        const channelToClub: Record<string, string> = {}
        for (const cm of channelEntries) channelToClub[cm.channel_id] = cm.channels.club_id
        for (const row of (unreadData ?? []) as Array<{ channel_id: string; unread_count: number }>) {
          const cid = channelToClub[row.channel_id]
          if (cid) clubUnreads[cid] = (clubUnreads[cid] ?? 0) + Number(row.unread_count)
        }
      }

      if (cancelled) return

      setClubs(
        baseClubs.map((c) => ({
          ...c,
          memberCount: memberCounts[c.id] ?? 0,
          channelCount: channelCounts[c.id] ?? 0,
          unreadCount: clubUnreads[c.id] ?? 0,
        }))
      )
      setClubsLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [userId, clubsRefreshCounter])

  const activeClub = useMemo(
    () => clubs.find((c) => c.id === activeClubId) ?? null,
    [clubs, activeClubId]
  )

  // ── 활성 동아리의 방 목록 + 안읽음 + 실시간 배지 업데이트 ───────────────────
  // app/(app)/clubs/[id].tsx의 로드+구독 로직과 동일한 쿼리 셰이프. 이 Provider는
  // /w 아래에서만 마운트되고 activeClubId가 바뀔 때마다 이 effect가 다시 돌면서
  // 이전 동아리의 realtime 채널은 정리되고 새 동아리로 스코프가 좁혀진다.
  useEffect(() => {
    if (!userId || !activeClubId) {
      setRooms([])
      setRoomsLoading(false)
      return
    }

    let cancelled = false
    let rt: ReturnType<typeof supabase.channel> | null = null

    async function load() {
      setRoomsLoading(true)

      const [channelsResult, myChannelsResult] = await Promise.all([
        supabase
          .from('channels')
          .select('id, name, type, is_password_protected, owner_id, created_at')
          .eq('club_id', activeClubId as string)
          .order('created_at', { ascending: true }),
        supabase.from('channel_members').select('channel_id').eq('user_id', userId as string),
      ])

      if (cancelled) return

      if (channelsResult.error) {
        console.error('[WorkspaceProvider] channels fetch error:', channelsResult.error)
        setRoomsLoading(false)
        return
      }

      const joinedIds = new Set((myChannelsResult.data ?? []).map((cm) => cm.channel_id))
      const channelIds = (channelsResult.data ?? [])
        .filter((ch) => joinedIds.has(ch.id))
        .map((ch) => ch.id)

      let unreadMap: Record<string, number> = {}
      if (channelIds.length > 0) {
        const { data: unreadData } = await (supabase as any).rpc('get_unread_counts', {
          p_channel_ids: channelIds,
        })
        for (const row of (unreadData ?? []) as Array<{ channel_id: string; unread_count: number }>) {
          unreadMap[row.channel_id] = Number(row.unread_count)
        }
      }

      if (cancelled) return

      setRooms(
        (channelsResult.data ?? []).map((ch) => ({
          id: ch.id,
          name: ch.name,
          hasPassword: ch.is_password_protected ?? false,
          ownerId: ch.owner_id,
          joined: joinedIds.has(ch.id),
          unreadCount: unreadMap[ch.id] ?? 0,
        }))
      )
      setRoomsLoading(false)

      // 활성 동아리로 스코프를 좁힌 realtime 안읽음 배지 구독
      await removeStaleChannels(supabase, topics.clubUnread(activeClubId as string))
      rt = supabase
        .channel(topics.clubUnread(activeClubId as string))
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            const row = payload.new as { channel_id: string; sender_id: string }
            if (row.sender_id === userId) return
            setRooms((prev) =>
              prev.map((r) => (r.id === row.channel_id ? { ...r, unreadCount: r.unreadCount + 1 } : r))
            )
            setClubs((prev) =>
              prev.map((c) => (c.id === activeClubId ? { ...c, unreadCount: c.unreadCount + 1 } : c))
            )
          }
        )
        .subscribe()
    }

    load()

    return () => {
      cancelled = true
      if (rt) supabase.removeChannel(rt)
    }
  }, [userId, activeClubId, roomsRefreshCounter])

  const value = useMemo<WorkspaceDataContextValue>(
    () => ({ clubs, clubsLoading, activeClub, rooms, roomsLoading, refreshClubs, refreshRooms }),
    [clubs, clubsLoading, activeClub, rooms, roomsLoading, refreshClubs, refreshRooms]
  )

  return <WorkspaceDataContext.Provider value={value}>{children}</WorkspaceDataContext.Provider>
}

export function useWorkspaceData(): WorkspaceDataContextValue {
  const ctx = useContext(WorkspaceDataContext)
  if (!ctx) {
    throw new Error(
      'useWorkspaceData() must be used within a <WorkspaceProvider> (mounted in app/(app)/w/_layout.tsx)'
    )
  }
  return ctx
}
