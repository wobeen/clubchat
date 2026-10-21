import { ActivityIndicator, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../../src/features/auth/useAuth'
import { EventFormScreen } from '../../../src/features/schedule'

export default function ClubEventCreatePage() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>()
  const router = useRouter()
  const { session } = useAuth()

  if (!clubId || !session?.user) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#417029" />
      </View>
    )
  }

  return (
    <EventFormScreen
      clubId={clubId}
      onSaved={(eventId) =>
        router.replace({
          pathname: '/(app)/clubs/eventdetail' as any,
          params: { clubId, eventId },
        })
      }
      onCancel={() => router.back()}
    />
  )
}
