# 레퍼런스

가져오는 것은 밀도, 크롬, 메시지 구조입니다. 브랜드 색을 그대로 베끼지 않습니다. ClubChat의 포인트는 기존 올리브에서 명도를 낮춘 포레스트 그린 하나뿐입니다.

## 1. Linear — 차분한 크롬

- https://linear.app/now/behind-the-latest-design-refresh
- https://linear.app/now/how-we-redesigned-the-linear-ui

사이드바는 본문보다 한 단계 어둡게 두고, 테두리는 대비를 낮춥니다. 아이콘 배경색을 없애고, 깊이는 그림자가 아니라 면의 밝기 차이로 만듭니다. 목록 행은 32–36px대입니다.

ClubChat에 적용: 아이콘 레일과 목록은 `--chrome`, 본문은 `--surface`. 동아리 마크는 단색. 활성 표시는 왼쪽 3px 바입니다.

## 2. Slack — 메시지 그룹

- https://slack.com/help/articles/213893898-Change-how-messages-are-displayed
- https://slack.com/help/articles/212596808-Adjust-your-sidebar-preferences

Clean 테마는 아바타, 이름, 시각, 본문 순서입니다. 같은 사람의 연속 메시지는 묶고, Compact는 더 빽빽합니다. 사이드바는 섹션과 안 읽음 굵기로 구분합니다.

ClubChat에 적용: 말풍선을 없애고 왼쪽 정렬 그룹으로 바꿉니다. 안 읽은 방은 이름 굵게, 개수는 작은 필. 입력 중은 컴포저 바로 위 한 줄입니다.

## 3. Discord — 서버 레일

- https://discord.com/branding

좁은 서버 레일과 채널 목록을 분리합니다. 잠긴 채널은 자물쇠로만 구분하고 색을 더하지 않습니다.

ClubChat에 적용: 64px 레일은 동아리 전환만 담당합니다. 방 목록은 그 옆 272px입니다.

## 4. Notion — 위키를 문서로

- https://www.notion.com/blog/meet-randy
- https://www.notion.so

앱 안에서는 채도를 낮추고, 문서는 제목·본문·목록의 위계만으로 읽히게 합니다. 편집은 읽는 자리에서 이어집니다.

ClubChat에 적용: 섹션 제목의 이모지를 빼고, 위키는 본문 타이포로 보여 줍니다. 넓은 화면 편집은 카드 안 인라인을 유지합니다.

## 5. Height — 메뉴와 스크롤

- https://height.app/blog/guide-to-build-context-menus
- https://height.app/blog/scrollbars-in-web-applications

메뉴는 붙는 대상을 밝히고, 파괴 동작은 분리합니다. 스크롤바는 내용을 가리지 않게 얇게 둡니다.

ClubChat에 적용: 메시지 메뉴는 수정 / 복사 / 삭제. 삭제는 새 색 없이 잉크 굵기와 ‘삭제’ 라벨로 구분합니다.

## 6. Raycast — 강조는 하나

- https://www.raycast.com

컨트롤은 작고 포커스만 분명합니다. 제품 안의 색 역할은 적습니다.

ClubChat에 적용: 강조는 `#1F6A45` 하나입니다. Raycast의 다크 캔버스는 가져오지 않습니다. 이 시안은 라이트만 있습니다.

## 7. Mobbin — 모바일 채팅 크롬

- https://mobbin.com/explore/screens/6a1da79c-1756-492c-b157-f7eb650a5bc8

Slack iOS 대화는 헤더, 본문, 하단 입력창이 역할을 나누고 입력창은 화면 아래에 고정됩니다.

ClubChat에 적용: 모바일 채팅은 상태 표시줄 아래 제목, 그 아래 메시지, 홈 인디케이터 위 컴포저입니다. 검색·일정은 아이콘만 헤더 오른쪽에 둡니다.

## 의도적으로 따르지 않는 것

- Linear의 13px 본문. 한글은 14px가 필요합니다.
- Slack/Discord의 보라 사이드바. 학교 업무용으로는 중립 크롬이 맞습니다.
- 그라데이션, 섹션 이모지, 카드 그림자 중첩, 다크 테마, 빨강 위험색. 현재 `makeUI` 팔레트의 문제와 같습니다.
