import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../../../../../src/features/auth/useAuth'
import { EventDetailScreen } from '../../../../../../src/features/schedule'

export default function EventDetailPage() {
  const { id: channelId, eventId, channelOwnerId = '' } = useLocalSearchParams<{
    id: string
    eventId: string
    channelOwnerId?: string
  }>()
  const router = useRouter()
  const { session } = useAuth()

  if (!eventId || !session?.user) return null

  return (
    <EventDetailScreen
      eventId={eventId}
      currentUserId={session.user.id}
      channelOwnerId={channelOwnerId}
      onPressEdit={(eid) =>
        router.push({
          pathname: '/(app)/channels/[id]/events/[eventId]/edit',
          params: { id: channelId, eventId: eid, channelOwnerId },
        })
      }
      onDeleted={() => router.back()}
      onBack={() => router.back()}
    />
  )
}
