// /w 네임스페이스 레이아웃 — WorkspaceProvider를 여기서만 마운트한다(더 위에 두지
// 않는 이유: 워크스페이스 데이터는 /w 아래에서만 필요함). 레일/목록 자체는 여기서
// 렌더링하지 않는다 — depth마다 "목록"과 "본문"의 의미가 달라지므로(depth 0에서는
// ClubListPane이 곧 본문, depth 1+에서는 목록 컬럼으로 이동) 그 조합은 각 화면
// 파일이 담당한다.
import { Stack } from 'expo-router'
import { WorkspaceProvider } from '@/features/shell/useWorkspaceData'
import { useBreakpoint } from '@/features/shell/useBreakpoint'

export default function WorkspaceLayout() {
  const { isCompact } = useBreakpoint()

  return (
    <WorkspaceProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: isCompact ? 'slide_from_right' : 'none',
        }}
      />
    </WorkspaceProvider>
  )
}
