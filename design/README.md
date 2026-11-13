# ClubChat 미니멀 리디자인 — Phase 1

승인 전 시안입니다. 앱 화면 소스(`app/`, `src/`)는 바꾸지 않았습니다.

| 문서 | 내용 |
|---|---|
| [SCREEN-INVENTORY.md](./SCREEN-INVENTORY.md) | 라우트·컴포넌트·현재 스타일 |
| [REFERENCES.md](./REFERENCES.md) | 참고한 제품과 가져올 점 |
| [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md) | 세 색 토큰, 글자, 간격, 컴포넌트 |
| [PHASE-2.md](./PHASE-2.md) | 승인 후 구현 순서 |
| [mockups/index.html](./mockups/index.html) | 정적 HTML 목업 목록 |

PNG는 `design/mockups/png/`에 있습니다. 파일 이름은 `{화면}-{desktop|mobile}-light.png`입니다. 다크 목업은 없습니다.

목업을 다시 만들 때:

```bash
node design/mockups/build.mjs
# playwright는 앱 package.json에 넣지 않습니다.
NODE_PATH=/path/to/playwright/node_modules node design/mockups/capture.mjs
```

글꼴은 Pretendard 1.3.9(SIL OFL)이며 `design/mockups/fonts/`에 포함했습니다.
