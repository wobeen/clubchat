import { useCallback } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../../src/features/auth/useAuth'
import { EventListScreen, useEvents } from '../../../src/features/schedule'

export default function ClubEventsListPage() {
  const { clubId, clubName } = useLocalSearchParams<{ clubId: string; clubName?: string }>()
  const router = useRouter()
  const { session } = useAuth()

  const { events, loading, error, refresh } = useEvents({ clubId: clubId ?? '' })

  useFocusEffect(
    useCallback(() => {
      refresh()
    }, [refresh])
  )

  if (!clubId || !session?.user) return null

  return (
    <EventListScreen
      events={events}
      loading={loading}
      error={error}
      onRefresh={refresh}
      onPressEvent={(eventId) =>
        router.push({
          pathname: '/(app)/clubs/eventdetail' as any,
          params: { clubId, eventId },
        })
      }
      onPressCreate={() =>
        router.push({
          pathname: '/(app)/clubs/eventcreate' as any,
          params: { clubId, clubName },
        })
      }
    />
  )
}
