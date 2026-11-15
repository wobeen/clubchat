import { Redirect } from 'expo-router'

// 개발 전용 UI 미리보기. 프로덕션 번들에서는 로그인으로 보내고,
// 화면 모듈은 __DEV__ 분기 안에만 둔다. 배포 라우트로 쓰지 않는다.
export default function PreviewRoute() {
  if (!__DEV__) {
    return <Redirect href="/(auth)/login" />
  }
  const { UiPreview } = require('../src/features/preview/UiPreview') as typeof import('../src/features/preview/UiPreview')
  return <UiPreview />
}
