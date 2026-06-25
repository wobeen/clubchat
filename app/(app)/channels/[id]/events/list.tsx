import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../../../../src/lib/supabase'
import { useAuth } from '../../../../../src/features/auth/useAuth'
import { EventListScreen } from '../../../../../src/features/schedule'

export default function EventListPage() {
  const { id: channelId } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { session } = useAuth()
  const [channelOwnerId, setChannelOwnerId] = useState('')

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

  if (!channelId || !session?.user) return null

  return (
    <EventListScreen
      channelId={channelId}
      currentUserId={session.user.id}
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
