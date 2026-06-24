import { Stack } from 'expo-router'

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="clubs/create" options={{ title: '동아리 만들기', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="clubs/join" options={{ title: '동아리 가입', headerBackTitle: '뒤로' }} />
    </Stack>
  )
}
