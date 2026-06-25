import { Stack } from 'expo-router'

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="clubs/create" options={{ title: '동아리 만들기', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="clubs/join" options={{ title: '동아리 가입', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="clubs/[id]" options={{ title: '동아리', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="channels/create" options={{ title: '방 만들기', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="channels/[id]/invite" options={{ title: '초대 코드', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="channels/[id]/join" options={{ title: '방 입장', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="channels/[id]/manage" options={{ title: '방 관리', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="channels/[id]/chat" options={{ title: '채팅', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="clubs/manage" options={{ title: '동아리 관리', headerBackTitle: '뒤로' }} />
    </Stack>
  )
}
