import { useCallback } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../../../../src/features/auth/useAuth'
import { EventListScreen, useEvents } from '../../../../../src/features/schedule'

export default function EventListPage() {
  const { id: channelId } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { session } = useAuth()

  const { events, loading, error, refresh } = useEvents(channelId ?? '')

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
          params: { id: channelId, eventId },
        })
      }
      onPressCreate={() =>
        router.push({
          pathname: '/(app)/channels/[id]/events/create',
          params: { id: channelId },
        })
      }
    />
  )
}
