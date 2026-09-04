import { Stack } from 'expo-router'

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="w" options={{ headerShown: false }} />
      <Stack.Screen name="join" options={{ title: '방 입장', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="scan" options={{ title: 'QR 스캔', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="clubs/create" options={{ title: '동아리 만들기', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="clubs/join" options={{ title: '동아리 가입', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="clubs/[id]" options={{ title: '동아리', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="channels/create" options={{ title: '방 만들기', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="channels/[id]/invite" options={{ title: '초대 코드', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="channels/[id]/join" options={{ title: '방 입장', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="channels/[id]/manage" options={{ title: '방 관리', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="channels/[id]/home" options={{ title: '방', headerBackTitle: '뒤로' }} />
      {/* ChatScreen(src/features/chat/ChatScreen.tsx)이 자체 헤더(제목+뒤로가기+검색/일정 버튼)를
          렌더링하므로 네이티브 스택 헤더는 끈다 — 헤더 이중 렌더를 막고, 이 화면이 나중에
          풀스크린 라우트가 아닌 3-pane 셸의 한 pane으로도 그대로 재사용될 수 있게 한다. */}
      <Stack.Screen name="channels/[id]/chat" options={{ headerShown: false }} />
      <Stack.Screen name="channels/[id]/search" options={{ title: '메시지 검색', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="channels/[id]/events/list" options={{ title: '일정', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="channels/[id]/events/create" options={{ title: '새 일정', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="channels/[id]/events/[eventId]/detail" options={{ title: '일정 상세', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="channels/[id]/events/[eventId]/edit" options={{ title: '일정 수정', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="clubs/manage" options={{ title: '동아리 관리', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="clubs/members" options={{ title: '멤버', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="clubs/apply" options={{ title: '가입 신청', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="clubs/eventslist" options={{ title: '동아리 일정', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="clubs/eventcreate" options={{ title: '새 일정', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="clubs/eventdetail" options={{ title: '일정 상세', headerBackTitle: '뒤로' }} />
      <Stack.Screen name="clubs/eventedit" options={{ title: '일정 수정', headerBackTitle: '뒤로' }} />
    </Stack>
  )
}
