import { ActivityIndicator, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../../../../src/features/auth/useAuth'
import { EventFormScreen } from '../../../../../src/features/schedule'

export default function EventCreatePage() {
  const { id: channelId } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { session } = useAuth()

  if (!channelId || !session?.user) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color="#4A90D9" /></View>
  }

  return (
    <EventFormScreen
      channelId={channelId}
      onSaved={(eventId) =>
        router.replace({
          pathname: '/(app)/channels/[id]/events/[eventId]/detail',
          params: { id: channelId, eventId },
        })
      }
      onCancel={() => router.back()}
    />
  )
}
