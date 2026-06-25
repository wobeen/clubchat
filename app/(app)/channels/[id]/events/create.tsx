import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../../../../src/features/auth/useAuth'
import { EventFormScreen } from '../../../../../src/features/schedule'

export default function EventCreatePage() {
  const { id: channelId, channelOwnerId = '' } = useLocalSearchParams<{
    id: string
    channelOwnerId?: string
  }>()
  const router = useRouter()
  const { session } = useAuth()

  if (!channelId || !session?.user) return null

  return (
    <EventFormScreen
      channelId={channelId}
      onSaved={(eventId) =>
        router.replace({
          pathname: '/(app)/channels/[id]/events/[eventId]/detail',
          params: { id: channelId, eventId, channelOwnerId },
        })
      }
      onCancel={() => router.back()}
    />
  )
}
