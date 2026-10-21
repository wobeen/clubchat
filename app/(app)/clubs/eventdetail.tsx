import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../../src/features/auth/useAuth'
import { EventDetailScreen } from '../../../src/features/schedule'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function ClubEventDetailPage() {
  const { clubId, eventId } = useLocalSearchParams<{ clubId: string; eventId: string }>()
  const router = useRouter()
  const { session } = useAuth()

  useEffect(() => {
    if (eventId && !UUID_RE.test(eventId)) {
      router.back()
    }
  }, [eventId])

  if (!eventId || !UUID_RE.test(eventId) || !session?.user) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#417029" />
      </View>
    )
  }

  return (
    <EventDetailScreen
      eventId={eventId}
      currentUserId={session.user.id}
      onPressEdit={(eid) =>
        router.push({
          pathname: '/(app)/clubs/eventedit' as any,
          params: { clubId, eventId: eid },
        })
      }
      onDeleted={() => router.back()}
      onBack={() => router.back()}
    />
  )
}
