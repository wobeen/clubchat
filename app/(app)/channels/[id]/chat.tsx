import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../../../src/features/auth/useAuth'
import { ChatScreen } from '../../../../src/features/chat'

export default function ChatRoute() {
  const { id: channelId, channelName } = useLocalSearchParams<{ id: string; channelName: string }>()
  const { user } = useAuth()
  const router = useRouter()

  if (!channelId || !user) return null

  return (
    <ChatScreen
      channelId={channelId}
      channelName={channelName ?? '채팅'}
      currentUserId={user.id}
      showHeader
      keyboardAvoiding
      onPressBack={() => router.back()}
      onPressSearch={() =>
        router.push({ pathname: '/(app)/channels/[id]/search', params: { id: channelId } })
      }
      onPressEvents={() =>
        router.push({ pathname: '/(app)/channels/[id]/events/list', params: { id: channelId } })
      }
    />
  )
}
