// 이전 방 홈 URL(/channels/[id]/home)을 보존하기 위한 얇은 리다이렉트 어댑터.
// 실제 화면은 app/(app)/w/[clubId]/[roomId].tsx(+ src/features/shell/*)로 이전됐다.
//
// /w/[clubId]/[roomId] 주소를 만들려면 clubId가 필요한데 이 라우트의 params에는
// channelId(=id)만 있으므로, 원래 이 화면이 하던 것과 동일한 최소 조회
// (channels.club_id)로 clubId를 구한 뒤 리다이렉트한다.
import { useEffect, useState } from 'react'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../../../src/lib/supabase'
import { ChannelHomeSkeleton } from '../../../../src/features/ui/Skeleton'

export default function ChannelHomeRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [clubId, setClubId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (!id) return
    let cancelled = false

    supabase
      .from('channels')
      .select('club_id')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          console.error('[ChannelHomeRedirect] channel lookup error:', error)
          setClubId(null)
          return
        }
        setClubId((data as { club_id: string }).club_id)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  if (!id || clubId === undefined) {
    return <ChannelHomeSkeleton />
  }

  if (clubId === null) {
    // 방 정보를 찾을 수 없으면 마이 페이지로 돌려보낸다.
    return <Redirect href="/(app)/w" />
  }

  return <Redirect href={{ pathname: '/(app)/w/[clubId]/[roomId]', params: { clubId, roomId: id } }} />
}
