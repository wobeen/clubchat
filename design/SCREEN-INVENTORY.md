# 화면 인벤토리

기준 브랜치: `makeUI` (`ebc1220`, 반응형 워크스페이스 셸 + 2026-09 리브랜딩).

## 스택과 스타일

- Expo SDK 56, React Native 0.85, React 19, expo-router 파일 라우팅. iOS / Android / Web 한 코드베이스.
- UI 라이브러리 없음. `StyleSheet.create`와 `src/features/ui/theme.ts` 토큰.
- 브레이크포인트 768px (`useBreakpoint`). 넓은 화면은 레일 + 목록 + 본문(+ 상세), 좁은 화면은 depth별 드릴다운.
- 현재 팔레트는 하늘·시안·민트·올리브 원색과 큰 모서리(12–20)입니다. 본문은 시스템 글꼴. 다크 모드는 없습니다.
- 채팅은 말풍선(`MessageBubble`). 위키는 마크다운(`react-native-markdown-display`). 관리 화면 5개는 넓은 화면에서 `ScreenOverlay` 다이얼로그입니다.

## 실제 화면 (`/w` 셸)

| 깊이 | 라우트 | 넓은 화면 | 좁은 화면 | 주요 컴포넌트 |
|---|---|---|---|---|
| 0 | `app/(app)/w/index.tsx` | 레일 + 동아리 목록 + “동아리를 선택하세요” | 목록이 전체 | `IconRail`, `ClubListPane`, `JoinByCodeSheet`, `ProfileEditSheet` |
| 1 | `app/(app)/w/[clubId]/index.tsx` | 레일 + 동아리 목록 + 홈 | 뒤로 + 홈 | 위키, 일정 미리보기, `RoomListPane` |
| 2 홈 | `app/(app)/w/[clubId]/[roomId].tsx` `view` 없음 | 레일 + 방 목록 + 방 홈 | 뒤로 + 홈 + 채팅 열기 | `WikiViewer`, `EventPreviewRow` |
| 2 채팅 | 같은 라우트 `view=chat` | 위 + `RoomDetailPane` | `ChatScreen` 헤더 | `ChatMessageList`, `ChatComposer` |

레거시 `app/(app)/index.tsx`, `clubs/[id].tsx`, `channels/[id]/home.tsx`는 `/w`로 보내는 리다이렉트입니다.

## 인증·입장

| 라우트 | 역할 |
|---|---|
| `app/(auth)/login.tsx` | Google 로그인. `LoginScreen` |
| `app/(app)/join.tsx` | 초대 링크 미리보기 후 참여 |
| `app/(app)/scan.tsx` | QR 스캔 |
| `app/(app)/clubs/join.tsx` | 동아리 초대 코드. 셸의 `JoinByCodeSheet`와 같은 일 |
| `app/(app)/clubs/create.tsx` | 동아리 만들기 |
| `app/(app)/clubs/apply.tsx` | 공개 동아리 가입 신청 |
| `app/(app)/channels/create.tsx` | 방 만들기, 비밀번호 선택 |
| `app/(app)/channels/[id]/join.tsx` | 비밀번호 방 입장 |
| `app/(app)/channels/[id]/chat.tsx` | 채팅 딥링크. 셸 채팅과 같은 `ChatScreen` |

## 일정

방 일정 `channels/[id]/events/*`와 동아리 일정 `clubs/event*`는 같은 화면 컴포넌트를 씁니다.

| 컴포넌트 | 라우트 |
|---|---|
| `EventListScreen` | `events/list`, `clubs/eventslist` |
| `EventDetailScreen` | `events/[eventId]/detail`, `clubs/eventdetail` |
| `EventFormScreen` | `events/create`, `events/[eventId]/edit`, `clubs/eventcreate`, `clubs/eventedit` |

## 관리 오버레이

넓은 화면은 다이얼로그, 좁은 화면은 풀스크린. `ScreenOverlay`.

| 라우트 | 내용 |
|---|---|
| `channels/[id]/invite.tsx` | QR, 링크, 코드 |
| `channels/[id]/manage.tsx` | 코드 재발급, 비밀번호 |
| `channels/[id]/search.tsx` | 메시지 검색 |
| `clubs/manage.tsx` | 공개 전환, 초대 코드, 가입 신청 |
| `clubs/members.tsx` | 현역 / OB, 역할 |

프로필 편집은 라우트가 아니라 `ProfileEditSheet`입니다. 위키 편집은 `WikiEditor`이며 넓은 화면은 인라인, 좁은 화면은 시트입니다.

## 목업과 라우트의 대응

| PNG 접두사 | 화면 |
|---|---|
| `login` | 로그인 |
| `clubs-empty`, `clubs` | 깊이 0. 빈 상태 / 목록 |
| `club-home` | 동아리 홈 |
| `room-home` | 방 홈 |
| `chat`, `chat-edit`, `message-menu` | 채팅, 수정, 길게 누르기 |
| `search` | 메시지 검색 |
| `events`, `event-detail`, `event-form` | 일정 목록·상세·작성. 방/동아리 폼은 같은 레이아웃 |
| `profile` | 프로필 시트 |
| `join-code` | 초대 코드 가입 (`JoinByCodeSheet`, `clubs/join`) |
| `create-club`, `create-room` | 만들기 |
| `invite`, `room-manage` | 초대, 방 관리 |
| `club-manage`, `members` | 동아리 관리, 멤버 |
| `room-join` | 비밀번호 입장 |
| `apply` | 가입 신청 |
| `wiki-editor` | 위키 편집 |
| `invite-preview` | 딥링크 참여 |
| `qr-scan` | QR |
| `skeleton` | 동아리 홈 로딩 |
| `foundations` | 토큰 견본 |

목업은 라이트만 있습니다. 데스크톱 1440×900과 모바일 390×844입니다. 토큰 견본은 데스크톱만 있습니다.
