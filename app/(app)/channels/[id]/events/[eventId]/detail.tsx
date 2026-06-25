import { useEffect } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../../../../../src/features/auth/useAuth'
import { EventDetailScreen } from '../../../../../../src/features/schedule'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function EventDetailPage() {
  const { id: channelId, eventId, channelOwnerId = '' } = useLocalSearchParams<{
    id: string
    eventId: string
    channelOwnerId?: string
  }>()
  const router = useRouter()
  const { session } = useAuth()

  // ルートコリジョン防御: eventId が UUID でない場合は画面に戻る
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
