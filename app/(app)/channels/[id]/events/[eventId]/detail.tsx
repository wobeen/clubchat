import { useEffect } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../../../../../src/features/auth/useAuth'
import { EventDetailScreen } from '../../../../../../src/features/schedule'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function EventDetailPage() {
  const { id: channelId, eventId } = useLocalSearchParams<{
    id: string
    eventId: string
  }>()
  const router = useRouter()
  const { session } = useAuth()

  useEffect(() => {
    if (eventId && !UUID_RE.test(eventId)) {
      router.back()
    }
  }, [eventId])

  if (!eventId || !UUID_RE.test(eventId) || !session?.user) return null

  return (
    <EventDetailScreen
      eventId={eventId}
      currentUserId={session.user.id}
      onPressEdit={(eid) =>
        router.push({
          pathname: '/(app)/channels/[id]/events/[eventId]/edit',
          params: { id: channelId, eventId: eid },
        })
      }
      onDeleted={() => router.back()}
      onBack={() => router.back()}
    />
  )
}
