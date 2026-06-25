import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../../../../src/lib/supabase'
import { useAuth } from '../../../../../src/features/auth/useAuth'
import { EventListScreen, useEvents } from '../../../../../src/features/schedule'

export default function EventListPage() {
  const { id: channelId } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { session } = useAuth()
  const [channelOwnerId, setChannelOwnerId] = useState('')

  // 채널 방장 ID 조회 (상세 화면으로 넘겨줄 param)
  useEffect(() => {
    if (!channelId) return
    supabase
      .from('channels')
      .select('owner_id')
      .eq('id', channelId)
      .single()
      .then(({ data }) => {
        if (data) setChannelOwnerId(data.owner_id)
      })
  }, [channelId])

  const { events, loading, error, refresh } = useEvents(channelId ?? '')

  // 화면에 포커스가 돌아올 때마다 재조회
  // (Stack 네비게이터는 뒤로 갈 때 화면을 언마운트하지 않으므로 useEffect 만으로는 부족)
  useFocusEffect(
    useCallback(() => {
      refresh()
    }, [refresh])
  )

  if (!channelId || !session?.user) return null

  return (
    <EventListScreen
      events={events}
      loading={loading}
      error={error}
      onRefresh={refresh}
      onPressEvent={(eventId) =>
        router.push({
          pathname: '/(app)/channels/[id]/events/[eventId]/detail',
          params: { id: channelId, eventId, channelOwnerId },
        })
      }
      onPressCreate={() =>
        router.push({
          pathname: '/(app)/channels/[id]/events/create',
          params: { id: channelId, channelOwnerId },
        })
      }
    />
  )
}
