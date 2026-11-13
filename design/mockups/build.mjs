import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const pagesDir = join(root, 'pages')
mkdirSync(pagesDir, { recursive: true })

const P = {
  back: '<path d="M15 18 9 12l6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16.5 16.5 3.5 3.5"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/>',
  send: '<path d="M4.5 12 19 5.5 14.5 19l-2.2-5.2z"/>',
  clip: '<path d="m21 11-8.2 8.2a5 5 0 0 1-7.1-7.1L13.2 5a3.5 3.5 0 0 1 5 5l-7.6 7.5a2 2 0 0 1-2.8-2.8L15 7.6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  more: '<circle cx="6" cy="12" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/><circle cx="18" cy="12" r="1.1" fill="currentColor"/>',
  copy: '<rect x="9" y="9" width="10" height="10" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h8"/>',
}

function icon(name, size = 16) {
  const fill = name === 'more' ? '' : 'fill="none"'
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" ${fill} stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${P[name]}</svg>`
}

function googleMark() {
  return `<svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z"/>
    <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.9 10.7A5.4 5.4 0 0 1 3.6 9c0-.6.1-1.2.3-1.7V5H.9A9 9 0 0 0 0 9c0 1.4.3 2.8.9 4l3-2.3z"/>
    <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6C13.5.9 11.4 0 9 0A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"/>
  </svg>`
}

function qrHtml() {
  const cells = []
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13)
      let on = false
      if (finder) {
        const lx = x > 13 ? x - 14 : x
        const ly = y > 13 ? y - 14 : y
        on = lx === 0 || ly === 0 || lx === 6 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4)
      } else if (x === 7 || y === 7) {
        on = (x + y) % 2 === 0
      } else {
        on = (x * 3 + y * 5 + (x * y) % 4) % 3 !== 0
      }
      cells.push(`<i class="${on ? 'on' : ''}"></i>`)
    }
  }
  return `<div class="qr" aria-hidden="true">${cells.join('')}</div>`
}

const people = [
  { name: '김하은', init: '하은', tone: 'a', role: '방장', sub: '23학번 · 나', on: true },
  { name: '박서준', init: '서준', tone: 'b', role: '관리자', sub: '22학번', on: true },
  { name: '이수민', init: '수민', tone: 'c', role: '멤버', sub: '24학번', on: false },
  { name: '최도윤', init: '도윤', tone: 'd', role: '멤버', sub: '23학번', on: true },
  { name: '한지민', init: '지민', tone: 'e', role: '멤버', sub: '21학번 · 2025년 졸업', on: false, ob: true },
]

function av(p, size = '') {
  return `<span class="av ${size} av-${p.tone}">${p.init}</span>`
}

function rail(active) {
  const clubs = [
    { name: '프레임', mark: '프', unread: 3 },
    { name: '알고리듬', mark: '알', unread: 0 },
    { name: '잔향', mark: '잔', unread: 1 },
  ]
  return `<aside class="rail">
    <div class="logo">C</div>
    <div class="rail-scroll">
      ${clubs.map((c) => `<button class="rail-btn${c.name === active ? ' active' : ''}" aria-label="${c.name}">${c.mark}${c.unread && c.name !== active ? `<span class="dot">${c.unread}</span>` : ''}</button>`).join('')}
      <button class="rail-add" aria-label="초대 코드로 가입">${icon('plus', 16)}</button>
    </div>
    <button class="rail-btn rail-me av-a" aria-label="프로필">하</button>
  </aside>`
}

function clubSidebar(active) {
  const clubs = [
    { name: '프레임', mark: '프', sub: '사진 · 12명', unread: 3 },
    { name: '알고리듬', mark: '알', sub: '스터디 · 8명', unread: 0 },
    { name: '잔향', mark: '잔', sub: '밴드 · 6명', unread: 1 },
  ]
  return `<aside class="side">
    <div class="side-head"><div><div class="side-title">동아리</div><div class="side-sub">김하은</div></div></div>
    <div class="side-body">
      <div class="section-label">가입함 ${clubs.length}</div>
      ${clubs.map((c) => `<button class="nav-item${c.name === active ? ' active' : ''}${c.unread ? ' unread' : ''}">
        <span class="mark">${c.mark}</span>
        <span class="nav-text"><span class="nav-name">${c.name}</span><span class="nav-sub">${c.sub}</span></span>
        ${c.unread ? `<span class="count">${c.unread}</span>` : ''}
      </button>`).join('')}
    </div>
    <div class="side-foot">
      <button class="btn btn-primary btn-block">${icon('plus', 14)} 동아리 만들기</button>
      <button class="btn btn-secondary btn-block">초대 코드로 가입</button>
    </div>
  </aside>`
}

function emptySidebar() {
  return `<aside class="side">
    <div class="side-head"><div><div class="side-title">동아리</div><div class="side-sub">김하은</div></div></div>
    <div class="side-body"><div class="empty" style="padding:24px 12px"><h2 style="font-size:14px">아직 동아리가 없어요</h2><p>만들거나 초대 코드로 들어올 수 있어요.</p></div></div>
    <div class="side-foot">
      <button class="btn btn-primary btn-block">${icon('plus', 14)} 동아리 만들기</button>
      <button class="btn btn-secondary btn-block">초대 코드로 가입</button>
    </div>
  </aside>`
}

function roomSidebar(active) {
  const rooms = [
    { name: '공지', unread: 1 },
    { name: '자유', unread: 4 },
    { name: '주말출사', unread: 0 },
    { name: '장비', locked: true },
  ]
  return `<aside class="side">
    <div class="side-head"><div><div class="side-title">프레임</div><div class="side-sub">방 4 · 멤버 12</div></div></div>
    <div class="side-body">
      <div class="section-label">참여 중</div>
      ${rooms.filter((r) => !r.locked).map((r) => `<button class="nav-item${r.name === active ? ' active' : ''}${r.unread ? ' unread' : ''}">
        <span class="hash">#</span><span class="nav-name grow">${r.name}</span>${r.unread ? `<span class="count">${r.unread}</span>` : ''}
      </button>`).join('')}
      <div class="section-label">입장 필요</div>
      <button class="nav-item"><span class="hash">${icon('lock', 14)}</span><span class="nav-text grow"><span class="nav-name">장비</span><span class="nav-sub">비밀번호</span></span><span class="link">입장</span></button>
    </div>
  </aside>`
}

function workspace({ activeClub = '프레임', side = 'rooms', room = '주말출사', main, detail = '', overlay = '' }) {
  const sidebar = side === 'clubs' ? clubSidebar(activeClub) : side === 'empty' ? emptySidebar() : roomSidebar(room)
  return `<div class="stage"><div class="app">${rail(activeClub)}${sidebar}<section class="main">${main}</section>${detail}</div>${overlay}</div>`
}

function mainHead({ crumb, title, actions = '' }) {
  return `<header class="main-head"><div>${crumb ? `<div class="crumb">${crumb}</div>` : ''}<h1>${title}</h1></div><div class="head-actions">${actions}</div></header>`
}

function statusBar() {
  return `<div class="status"><span class="tabular">9:41</span><span class="glyphs"><span>LTE</span><span>100%</span></span></div>`
}

function mobileFrame({ head, body, foot = '', bodyClass = '' }) {
  return `<div class="m-app">${statusBar()}<header class="m-head">${head}</header><div class="m-body ${bodyClass}">${body}</div>${foot}<div class="home-ind"><span></span></div></div>`
}

function backHead(title, crumb) {
  return `<button class="icon-btn" aria-label="뒤로">${icon('back')}</button><div class="grow">${crumb ? `<div class="crumb">${crumb}</div>` : ''}<h1>${title}</h1></div>`
}

function wikiBlock(compact) {
  return `<article class="wiki">
    <h1>프레임</h1>
    <p>주 1회 밖에서 사진을 찍는 동아리입니다. 삼각대는 공용 2대이고, 촬영본은 화요일까지 자유 방에 올립니다.</p>
    ${compact ? '' : `<h2>이번 학기</h2>
    <ul>
      <li>출사는 토요일 오후. 장소는 수요일까지 채팅에서 정합니다.</li>
    </ul>`}
  </article>`
}

function eventRows(limit = 3) {
  const items = [
    ['15', '11월', '남산 야경 출사', '토 17:00 · 남산서울타워', '참석 6'],
    ['18', '11월', '정기 회의', '화 19:00 · 학생회관 302', '미정 4'],
    ['22', '11월', '포트폴리오 리뷰', '토 14:00 · 온라인', '참석 3'],
  ]
  return items.slice(0, limit).map(([d, m, t, meta, pill]) => `<button class="event">
    <span class="datechip"><b>${d}</b><span>${m}</span></span>
    <span class="grow"><span class="event-title">${t}</span><span class="event-meta">${meta}</span></span>
    <span class="pill${pill.startsWith('미정') ? ' neutral' : ''}">${pill}</span>
  </button>`).join('')
}

function roomRows() {
  return `<div class="room-row"><span class="hash">#</span><span class="grow"><span class="event-title">공지</span><span class="event-meta">공지 · 안 읽음 1</span></span><span class="count">1</span></div>
  <div class="room-row"><span class="hash">#</span><span class="grow"><span class="event-title">자유</span><span class="event-meta">최근 메시지 14:21</span></span><span class="count">4</span></div>
  <div class="room-row" style="background:var(--accent-soft);border-radius:6px"><span class="hash">#</span><span class="grow"><span class="event-title">주말출사</span><span class="event-meta">참여 중 · 8명</span></span></div>
  <div class="room-row"><span class="hash">${icon('lock', 14)}</span><span class="grow"><span class="event-title">장비</span><span class="event-meta">비밀번호가 필요해요</span></span><span class="link">입장</span></div>`
}

function clubHomeMain() {
  return `${mainHead({ crumb: '내 동아리', title: '프레임', actions: `<button class="btn btn-ghost">멤버 12</button><button class="btn btn-secondary">초대 코드</button><button class="btn btn-secondary">관리</button>` })}
  <div class="main-body"><div class="stack">
    <div class="card club-hero">
      <span class="mark">프</span>
      <div class="grow"><div class="event-title" style="font-size:16px">프레임</div><div class="meta-line">사진 · 방장 · 2024년에 만들었어요</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>위키</h2><span class="link">편집</span></div>
      ${wikiBlock(true)}
    </div>
    <div class="card">
      <div class="card-head"><h2>다가오는 일정</h2><span class="link">전체 보기</span></div>
      ${eventRows()}
    </div>
    <div class="card" style="padding-bottom:8px">
      <div class="card-head"><h2>방</h2><span class="link">방 만들기</span></div>
      ${roomRows()}
    </div>
  </div></div>`
}

function roomHomeMain() {
  return `${mainHead({ crumb: '프레임', title: '주말출사', actions: `<button class="btn btn-ghost">초대</button><button class="btn btn-secondary">방 관리</button>` })}
  <div class="main-body"><div class="stack">
    <div class="card"><div class="card-head"><h2>방 위키</h2><span class="link">편집</span></div>
      <article class="wiki"><h1>주말출사</h1><p>토요일 야외 촬영 방입니다. 장소 투표와 장비 대여를 여기서 정리합니다.</p></article>
    </div>
    <div class="card"><div class="card-head"><h2>다가오는 일정</h2><span class="link">전체 보기</span></div>${eventRows()}</div>
  </div></div>
  <div class="chat-bar"><button class="btn btn-primary btn-block" style="height:40px">채팅 열기 <span class="count" style="margin-left:8px;background:rgba(255,255,255,.18)">4</span></button></div>`
}

function msg({ person, time, text, reacts, photo, file, hot }) {
  return `<div class="msg${hot ? ' hot' : ''}">${av(person)}<div class="msg-body">
    <div class="msg-meta"><span class="msg-name">${person.name}</span><span class="msg-time">${time}</span></div>
    <p>${text}</p>
    ${photo ? '<div class="photo" role="img" aria-label="한강 테스트 컷"></div>' : ''}
    ${file ? `<div class="file"><span class="file-ico">JPG</span><span><span class="file-name">한강_테스트컷.jpg</span><span class="file-meta">1.8MB</span></span></div>` : ''}
    ${reacts ? `<div class="reacts">${reacts}</div>` : ''}
  </div></div>`
}

function thread(compact, hot) {
  const ha = people[0]
  const park = people[1]
  const lee = people[2]
  const blocks = [
    `<div class="day"><span>11월 13일 금요일</span></div>`,
    msg({ person: ha, time: '14:02', text: '이번 주 토요일 남산 야경, 삼각대 있는 사람 손?', reacts: '<span class="react on">좋아요 3</span>', hot }),
    msg({ person: park, time: '14:06', text: '저 갈게요. 16:40에 3호선 충무로에서 만나면 될까요?' }),
  ]
  if (!compact) {
    blocks.push(msg({ person: ha, time: '14:08', text: '좋아요. 공지에도 올려 둘게요. 지난주 한강 컷입니다.', photo: true }))
    blocks.push(`<div class="sys">최도윤님이 방에 참여했습니다</div>`)
  }
  blocks.push(msg({ person: lee, time: '14:21', text: '저도요. 배터리 여분은 제가 챙길게요.' }))
  return blocks.join('')
}

function composer({ text, editing }) {
  const filled = Boolean(text)
  return `<div class="composer-wrap">
    ${editing ? `<div class="editbar"><div class="grow"><b>메시지 수정</b><span>이번 주 토요일 남산 야경, 삼각대 있는 사람 손?</span></div><button class="link">취소</button></div>` : ''}
    <div class="composer">
      <button class="icon-btn" aria-label="첨부">${icon('clip')}</button>
      <div class="field${filled ? '' : ' placeholder'}">${filled ? text : '메시지 보내기'}</div>
      <button class="send${filled ? ' on' : ''}" aria-label="보내기">${icon('send', 15)}</button>
    </div>
  </div>`
}

function chatMain({ editing = false, compact = false, hot = false }) {
  const actions = `<button class="icon-btn" aria-label="검색">${icon('search')}</button><button class="icon-btn" aria-label="일정">${icon('cal')}</button><button class="icon-btn" aria-label="더보기">${icon('more')}</button>`
  return `${mainHead({ crumb: '프레임 · 8명', title: '# 주말출사', actions })}
    <div class="thread">${thread(compact, hot)}</div>
    <div class="typing"><i>박서준</i> 입력 중</div>
    ${composer({ text: editing ? '이번 주 토요일 남산 야경, 삼각대 있는 사람?' : '', editing })}`
}

function detailPane() {
  const rows = people.filter((p) => !p.ob).map((p) => `<div class="member">${av(p, 'sm')}<span class="grow" style="font-size:13px;font-weight:550">${p.name}</span><span class="presence${p.on ? ' on' : ''}"></span></div>`).join('')
  return `<aside class="detail"><div class="detail-body">
    <div class="card"><div class="card-head"><h3 style="margin:0">멤버 5</h3><span class="faint" style="font-size:12px">3명 온라인</span></div>${rows}</div>
    <div class="card"><div class="card-head"><h3 style="margin:0">위키</h3><span class="link">홈에서 보기</span></div><div class="wiki-snip">토요일 야외 촬영 방입니다. 장소 투표와 장비 대여를 여기서 정리합니다.</div></div>
    <div class="card"><div class="card-head"><h3 style="margin:0">다가오는 일정</h3><span class="link">전체</span></div>
      <div class="member"><span class="datechip" style="width:36px;height:36px"><b>15</b></span><span class="grow"><span class="event-title">남산 야경 출사</span><span class="event-meta">토 17:00</span></span></div>
      <div class="member"><span class="datechip" style="width:36px;height:36px"><b>18</b></span><span class="grow"><span class="event-title">정기 회의</span><span class="event-meta">화 19:00</span></span></div>
    </div>
  </div></aside>`
}

function scrim(inner, wide) {
  return `<div class="scrim"><div class="dialog${wide ? ' wide' : ''}">${inner}</div></div>`
}

function dialogHead(title) {
  return `<div class="dialog-head"><h1 class="grow">${title}</h1><button class="icon-btn" aria-label="닫기">${icon('close')}</button></div>`
}

function field(label, control, help = '') {
  return `<label class="form-gap" style="gap:0"><span class="field-label">${label}</span>${control}${help ? `<span class="help">${help}</span>` : ''}</label>`
}

function login(device) {
  const card = `<div class="login-card">
    <div class="logo">C</div>
    <h1>ClubChat</h1>
    <p class="tag">동아리와 스터디를 한곳에서</p>
    <button class="gbtn">${googleMark()} Google로 계속</button>
    <p class="fine">학교 계정으로 로그인합니다. 비밀번호는 저장하지 않습니다.</p>
  </div>`
  if (device === 'mobile') {
    return `<div class="m-app" style="background:var(--bg)">${statusBar()}<div class="login" style="flex:1">${card}</div><div class="home-ind" style="background:var(--bg)"><span></span></div></div>`
  }
  return `<div class="login">${card}</div>`
}

function clubsEmpty(device) {
  if (device === 'mobile') {
    return mobileFrame({
      head: `<h1 class="grow">동아리</h1><button class="rail-btn av-a" style="width:32px;height:32px">하</button>`,
      body: `<div class="empty"><h2>아직 동아리가 없어요</h2><p>동아리를 만들거나, 받은 8자리 코드로 가입하세요.</p></div>`,
      foot: `<div class="m-foot"><button class="btn btn-primary btn-block">동아리 만들기</button><button class="btn btn-secondary btn-block">초대 코드로 가입</button></div>`,
    })
  }
  return workspace({
    activeClub: '',
    side: 'empty',
    main: `<div class="empty"><h2>동아리를 선택하세요</h2><p>왼쪽에서 고르면 위키, 방, 일정이 여기 열립니다.</p></div>`,
  })
}

function clubs(device) {
  if (device === 'mobile') {
    const items = [
      ['프', '프레임', '사진 · 안 읽음 3', '3'],
      ['알', '알고리듬', '스터디 · 8명', ''],
      ['잔', '잔향', '밴드 · 안 읽음 1', '1'],
    ]
    return mobileFrame({
      head: `<h1 class="grow">동아리</h1><button class="rail-btn av-a" style="width:32px;height:32px">하</button>`,
      body: `<div class="m-pad"><div class="section-label" style="padding-left:4px">가입함 3</div>${items.map(([m, n, s, c]) => `<button class="nav-item" style="padding:10px 4px"><span class="mark">${m}</span><span class="nav-text grow"><span class="nav-name">${n}</span><span class="nav-sub">${s}</span></span>${c ? `<span class="count">${c}</span>` : ''}</button>`).join('')}</div>`,
      foot: `<div class="m-foot"><button class="btn btn-primary btn-block">동아리 만들기</button><button class="btn btn-secondary btn-block">초대 코드로 가입</button></div>`,
    })
  }
  return workspace({
    activeClub: '',
    side: 'clubs',
    main: `<div class="empty"><h2>동아리를 선택하세요</h2><p>프레임, 알고리듬, 잔향 중 하나를 열면 홈이 표시됩니다.</p></div>`,
  })
}

function clubHome(device) {
  if (device === 'mobile') {
    return mobileFrame({
      head: `${backHead('프레임', '동아리')}<button class="icon-btn">${icon('more')}</button>`,
      body: `<div class="m-pad stack">
        <div class="card club-hero"><span class="mark">프</span><div><div class="event-title">프레임</div><div class="meta-line">사진 · 방장 · 12명</div></div></div>
        <div class="card"><div class="card-head"><h2>위키</h2><span class="link">편집</span></div>${wikiBlock(true)}</div>
        <div class="card"><div class="card-head"><h2>일정</h2><span class="link">전체</span></div>${eventRows(2)}</div>
        <div class="card"><div class="card-head"><h2>방</h2><span class="link">만들기</span></div>${roomRows()}</div>
      </div>`,
    })
  }
  return workspace({ side: 'clubs', activeClub: '프레임', main: clubHomeMain() })
}

function roomHome(device) {
  if (device === 'mobile') {
    return mobileFrame({
      head: backHead('주말출사', '프레임'),
      body: `<div class="m-pad stack">
        <div class="card"><div class="card-head"><h2>방 위키</h2><span class="link">편집</span></div><p>토요일 야외 촬영 방입니다. 장소 투표와 장비 대여를 여기서 정리합니다.</p></div>
        <div class="card"><div class="card-head"><h2>다가오는 일정</h2><span class="link">전체</span></div>${eventRows()}</div>
      </div>`,
      foot: `<div class="chat-bar"><button class="btn btn-primary btn-block" style="height:40px">채팅 열기 <span class="count" style="margin-left:8px;background:rgba(255,255,255,.18)">4</span></button></div>`,
      bodyClass: '',
    })
  }
  return workspace({ room: '주말출사', main: roomHomeMain() })
}

function chat(device, { editing = false, menu = false } = {}) {
  if (device === 'mobile') {
    const sheet = menu
      ? `<div class="scrim" style="background:var(--overlay)"><div class="sheet"><div class="handle"></div><button>수정</button><button>복사</button><button class="danger">삭제</button><button class="faint">취소</button></div></div>`
      : ''
    return `<div class="stage" style="height:100%">${mobileFrame({
      head: `${backHead('주말출사', '프레임')}<div class="m-actions"><button class="icon-btn">${icon('search')}</button><button class="icon-btn">${icon('cal')}</button></div>`,
      body: `<div class="thread">${thread(true, menu)}</div><div class="typing"><i>박서준</i> 입력 중</div>`,
      foot: composer({ text: editing ? '이번 주 토요일 남산 야경, 삼각대 있는 사람?' : '저도 삼각대 챙길게요', editing }),
      bodyClass: 'white',
    })}${sheet}</div>`
  }
  const menuEl = menu
    ? `<div class="menu" style="top:148px;left:248px"><button>수정</button><button>복사</button><button class="danger">삭제</button></div>`
    : ''
  return workspace({
    main: `<div style="display:flex;flex-direction:column;height:100%;position:relative">${chatMain({ editing, hot: menu })}${menuEl}</div>`,
    detail: detailPane(),
  })
}

function search(device) {
  const hits = `<div class="search-hit"><div class="msg-meta"><span class="msg-name">김하은</span><span class="msg-time">오늘 14:02 · #주말출사</span></div><p>이번 주 토요일 남산 야경, <mark>삼각대</mark> 있는 사람 손?</p></div>
    <div class="search-hit"><div class="msg-meta"><span class="msg-name">박서준</span><span class="msg-time">11월 6일 · #장비</span></div><p><mark>삼각대</mark>는 공용 2대라, 먼저 말하는 사람이 가져갑니다.</p></div>`
  const body = `<div class="dialog-body"><div class="input" style="display:flex;align-items:center">삼각대</div><div class="help" style="margin-bottom:8px">2개 메시지</div>${hits}</div>`
  if (device === 'mobile') {
    return mobileFrame({
      head: `${backHead('검색', '주말출사')}`,
      body: `<div class="m-pad">${body}</div>`,
      bodyClass: 'white',
    })
  }
  return workspace({
    main: `<div style="display:flex;flex-direction:column;height:100%">${chatMain({})}</div>`,
    detail: detailPane(),
    overlay: scrim(`${dialogHead('메시지 검색')}${body}`),
  })
}

function events(device) {
  const inner = `<div class="card-head"><h2 style="color:var(--text)">11월</h2><button class="btn btn-primary">새 일정</button></div>${eventRows()}<p class="help">지난 일정 2개는 접혀 있습니다.</p>`
  if (device === 'mobile') {
    return mobileFrame({ head: backHead('일정', '주말출사'), body: `<div class="m-pad"><div class="card">${inner}</div></div>` })
  }
  return workspace({
    main: `${mainHead({ crumb: '프레임 / 주말출사', title: '일정', actions: '<button class="btn btn-primary">새 일정</button>' })}<div class="main-body"><div class="card">${eventRows()}</div></div>`,
  })
}

function eventDetail(device) {
  const body = `<div class="dialog-body" style="display:flex;flex-direction:column;gap:14px">
    <div><h1 style="font-size:20px">남산 야경 출사</h1>
      <div class="split-meta"><span><b>11월 15일 토</b> 17:00–20:00</span><span>남산서울타워</span></div>
      <p>일몰 직후 타워 쪽에서 모입니다. 삼각대는 공용 2대, 나머지는 개인 지참.</p>
    </div>
    <div><div class="field-label">참석</div><div class="rsvp"><button class="on">참석 6</button><button>미정 2</button><button>불참 1</button></div></div>
    <div class="attendees">${people.slice(0, 4).map((p) => `<div class="member">${av(p, 'sm')}<span class="grow">${p.name}</span><span class="pill${p.name === '이수민' ? ' neutral' : ''}">${p.name === '이수민' ? '미정' : '참석'}</span></div>`).join('')}</div>
    <div class="pair"><button class="btn btn-secondary btn-block">수정</button><button class="btn btn-danger btn-block">삭제</button></div>
  </div>`
  if (device === 'mobile') {
    return mobileFrame({ head: backHead('일정', '주말출사'), body, bodyClass: 'white' })
  }
  return workspace({
    main: `${mainHead({ crumb: '프레임 / 주말출사', title: '일정' })}<div class="main-body"><div class="card">${eventRows()}</div></div>`,
    overlay: scrim(`${dialogHead('일정')}${body}`, true),
  })
}

function eventForm(device) {
  const form = `<div class="form-gap">
    ${field('제목 <span class="req">*</span>', '<div class="input">남산 야경 출사</div>')}
    <div class="pair">${field('시작', '<div class="input tabular">2026. 11. 15.  17:00</div>')}${field('종료', '<div class="input tabular">2026. 11. 15.  20:00</div>')}</div>
    ${field('장소', '<div class="input">남산서울타워</div>')}
    ${field('설명', '<div class="area">일몰 직후 타워 쪽에서 모입니다.</div>')}
    <div class="pair"><button class="btn btn-secondary btn-block">취소</button><button class="btn btn-primary btn-block">저장</button></div>
  </div>`
  if (device === 'mobile') return mobileFrame({ head: backHead('새 일정', '주말출사'), body: `<div class="m-pad">${form}</div>`, bodyClass: 'white' })
  return workspace({
    main: roomHomeMain(),
    overlay: scrim(`${dialogHead('새 일정')}<div class="dialog-body">${form}</div>`, true),
  })
}

function profile(device) {
  const form = `<div class="profile-top">${av(people[0], 'lg')}<div><div class="event-title">김하은</div><div class="meta-line">frame@school.edu</div></div></div>
    <div class="field-label">아바타</div>
    <div class="emoji-row" style="margin-bottom:14px"><span class="pick on" style="font-size:12px;font-weight:700">하은</span><span>📷</span><span>🌿</span><span>🌙</span><span>✏️</span></div>
    <div class="form-gap">
      ${field('표시 이름', '<div class="input">김하은</div>')}
      <div class="pair">${field('학번', '<div class="input">23학번</div>')}${field('출생 연도', '<div class="input tabular">2002</div>')}</div>
      ${field('성별', '<div class="seg"><button>여성</button><button class="on">비공개</button><button>남성</button></div>')}
      <button class="btn btn-primary btn-block">저장</button>
      <button class="btn btn-danger btn-block">로그아웃</button>
    </div>`
  if (device === 'mobile') {
    return `<div class="stage" style="height:100%">${mobileFrame({
      head: `<h1 class="grow">동아리</h1>`,
      body: `<div class="m-pad"><button class="nav-item"><span class="mark">프</span><span class="nav-name">프레임</span></button></div>`,
      foot: `<div class="m-foot"><button class="btn btn-primary btn-block">동아리 만들기</button></div>`,
    })}<div class="scrim" style="align-items:end"><div class="sheet" style="padding:8px 16px 24px"><div class="handle"></div><div style="text-align:left">${form}</div></div></div></div>`
  }
  return workspace({
    side: 'clubs',
    activeClub: '프레임',
    main: clubHomeMain(),
    overlay: scrim(`${dialogHead('프로필')}<div class="dialog-body">${form}</div>`),
  })
}

function joinCode(device) {
  const form = `<p class="muted" style="margin-bottom:12px">동아리 관리자에게 받은 8자리 코드입니다.</p>
    ${field('초대 코드', '<div class="input lg">A3F1 9C2B</div>', '대소문자는 구분하지 않습니다.')}
    <button class="btn btn-primary btn-block" style="margin-top:14px">가입하기</button>`
  if (device === 'mobile') return mobileFrame({ head: backHead('초대 코드', '동아리'), body: `<div class="m-pad">${form}</div>`, bodyClass: 'white' })
  return workspace({
    side: 'clubs',
    activeClub: '',
    main: `<div class="empty"><h2>동아리를 선택하세요</h2><p>또는 초대 코드로 바로 들어올 수 있습니다.</p></div>`,
    overlay: scrim(`${dialogHead('초대 코드로 가입')}<div class="dialog-body">${form}</div>`),
  })
}

function createClub(device) {
  const form = `${field('동아리 이름', '<div class="input">프레임</div>', '만든 사람이 방장이 됩니다. 나중에 바꿀 수 있어요.')}
    <button class="btn btn-primary btn-block" style="margin-top:16px">만들기</button>`
  if (device === 'mobile') return mobileFrame({ head: backHead('동아리 만들기'), body: `<div class="m-pad">${form}</div>`, bodyClass: 'white' })
  return workspace({ side: 'empty', activeClub: '', main: `<div class="empty"><h2>동아리를 선택하세요</h2></div>`, overlay: scrim(`${dialogHead('동아리 만들기')}<div class="dialog-body">${form}</div>`) })
}

function createRoom(device) {
  const form = `<div class="form-gap">
    ${field('방 이름', '<div class="input">주말출사</div>')}
    <div class="checkline"><div><div class="strong" style="font-size:14px">비밀번호</div><div class="help" style="margin:0">켠 방만 코드를 묻습니다.</div></div><div class="switch"><i></i></div></div>
    ${field('비밀번호', '<div class="input">••••••</div>', '4자 이상. 원문은 저장하지 않습니다.')}
    <button class="btn btn-primary btn-block">방 만들기</button>
  </div>`
  if (device === 'mobile') return mobileFrame({ head: backHead('방 만들기', '프레임'), body: `<div class="m-pad">${form}</div>`, bodyClass: 'white' })
  return workspace({ side: 'clubs', activeClub: '프레임', main: clubHomeMain(), overlay: scrim(`${dialogHead('방 만들기')}<div class="dialog-body">${form}</div>`) })
}

function invite(device) {
  const body = `<div class="dialog-body" style="text-align:center">
    ${qrHtml()}
    <div class="code">K7QM2P4A</div>
    <p class="help">링크와 같은 초대입니다. 새 코드를 발급하면 이전 코드는 바로 만료됩니다.</p>
    <div class="pair" style="margin-top:14px"><button class="btn btn-secondary btn-block">${icon('copy', 14)} 링크 복사</button><button class="btn btn-primary btn-block">공유</button></div>
  </div>`
  if (device === 'mobile') return mobileFrame({ head: backHead('초대', '주말출사'), body, bodyClass: 'white' })
  return workspace({ main: roomHomeMain(), overlay: scrim(`${dialogHead('주말출사 초대')}${body}`) })
}

function roomManage(device) {
  const body = `<div class="dialog-body form-gap">
    <div class="checkline"><div><div class="strong">초대 코드</div><div class="code" style="text-align:left;font-size:16px;letter-spacing:0.14em">K7QM2P4A</div></div><button class="btn btn-secondary">새 코드</button></div>
    <p class="help" style="margin:0">새 코드를 발급하면 기존 링크와 QR은 즉시 만료됩니다.</p>
    <div class="banner">비밀번호로 보호되고 있어요</div>
    ${field('새 비밀번호', '<div class="input">새 비밀번호</div>', '4자 이상')}
    <div class="pair"><button class="btn btn-secondary btn-block">보호 해제</button><button class="btn btn-primary btn-block">변경</button></div>
  </div>`
  if (device === 'mobile') return mobileFrame({ head: backHead('방 관리', '주말출사'), body: body.replace('dialog-body ', 'm-pad '), bodyClass: 'white' })
  return workspace({ main: roomHomeMain(), overlay: scrim(`${dialogHead('방 관리')}${body}`) })
}

function clubManage(device) {
  const requests = [
    ['오세훈', '오', 'b', '24학번 · 2시간 전', '작년에 교내 사진전에 냈습니다. 주말 출사 가능해요.'],
    ['윤아라', '윤', 'c', '23학번 · 어제', '필름으로 기록하는 걸 좋아합니다.'],
  ]
  const body = `<div class="dialog-body" style="display:flex;flex-direction:column;gap:14px">
    <div class="checkline"><div><div class="strong">동아리 공개</div><div class="help" style="margin:0">공개하면 검색되고, 가입 신청을 받을 수 있어요.</div></div><div class="switch"><i></i></div></div>
    <div class="card" style="padding:12px"><div class="faint" style="font-size:12px">초대 코드</div><div class="code" style="text-align:left;font-size:16px">A3F19C2B</div></div>
    <div><div class="card-head"><h2>가입 신청 2</h2></div>
      ${requests.map(([n, i, t, s, q]) => `<div class="req"><div class="member"><span class="av sm av-${t}">${i}</span><span class="grow"><span class="event-title">${n}</span><span class="event-meta">${s}</span></span></div><div class="quote">${q}</div><div class="req-actions"><button class="btn btn-secondary" style="flex:1">거절</button><button class="btn btn-primary" style="flex:1">수락</button></div></div>`).join('')}
    </div>
  </div>`
  if (device === 'mobile') return mobileFrame({ head: backHead('동아리 관리', '프레임'), body: `<div class="m-pad">${body.replace(/dialog-body" style="display:flex;flex-direction:column;gap:14px"/, '"')}</div>`, bodyClass: 'white' })
  return workspace({ side: 'clubs', activeClub: '프레임', main: clubHomeMain(), overlay: scrim(`${dialogHead('동아리 관리')}${body}`, true) })
}

function members(device) {
  const list = (arr) => arr.map((p) => `<button class="member" style="width:100%;padding:8px 0"><span style="display:contents">${av(p, 'sm')}</span><span class="grow" style="text-align:left"><span class="event-title">${p.name}${p.sub.includes('나') ? ' · 나' : ''}</span><span class="event-meta">${p.sub.replace(' · 나', '')}</span></span><span class="pill${p.role === '멤버' ? ' neutral' : ''}">${p.role}</span></button>`).join('')
  const body = `<div class="seg" style="margin-bottom:8px"><button class="on">현역 4</button><button>OB · 졸업생 1</button></div>${list(people.filter((p) => !p.ob))}<div class="help">이름을 누르면 프로필이 열립니다. 방장과 관리자는 역할을 바꿀 수 있어요.</div>`
  if (device === 'mobile') return mobileFrame({ head: backHead('멤버', '프레임'), body: `<div class="m-pad">${body}</div>`, bodyClass: 'white' })
  return workspace({ side: 'clubs', activeClub: '프레임', main: clubHomeMain(), overlay: scrim(`${dialogHead('멤버')}<div class="dialog-body">${body}</div>`, true) })
}

function roomJoin(device) {
  const form = `<div class="banner">이 방은 비밀번호가 있습니다.</div>
    ${field('비밀번호', '<div class="input">비밀번호</div>', '방장에게 확인한 뒤 입력하세요.')}
    <button class="btn btn-primary btn-block" style="margin-top:14px">입장</button>`
  if (device === 'mobile') return mobileFrame({ head: backHead('장비', '프레임'), body: `<div class="m-pad"><p class="muted" style="margin-bottom:12px">비밀번호를 아는 멤버만 대화와 파일을 볼 수 있습니다.</p>${form}</div>`, bodyClass: 'white' })
  return workspace({
    main: roomHomeMain(),
    overlay: scrim(`${dialogHead('# 장비 입장')}<div class="dialog-body">${form}</div>`),
  })
}

function apply(device) {
  const form = `<p class="muted" style="margin-bottom:12px">공개 동아리입니다. 방장이 수락하면 멤버가 됩니다.</p>
    ${field('하고 싶은 말', '<div class="area">교내 사진전에 두 번 참여했습니다. 주말 출사 가능하고, 자연광 인물 위주로 찍어요.</div>', '선택입니다.')}
    <button class="btn btn-primary btn-block" style="margin-top:14px">신청 보내기</button>`
  if (device === 'mobile') return mobileFrame({ head: backHead('가입 신청', '프레임'), body: `<div class="m-pad">${form}</div>`, bodyClass: 'white' })
  return `<div class="login"><div class="login-card" style="text-align:left;width:400px"><div class="crumb">공개 동아리</div><h1 style="font-size:22px;margin:4px 0 12px">프레임</h1>${form}</div></div>`
}

function wikiEditor(device) {
  const editor = `<div class="inline-editor form-gap">
    <div class="area" style="min-height:200px"># 프레임\n\n주 1회 밖에서 사진을 찍는 동아리입니다.\n\n## 이번 학기\n- 출사는 토요일 오후\n- 촬영본은 화요일까지 자유 방에</div>
    <div class="pair"><button class="btn btn-secondary btn-block">취소</button><button class="btn btn-primary btn-block">저장</button></div>
  </div>`
  if (device === 'mobile') return mobileFrame({ head: backHead('위키 편집', '프레임'), body: `<div class="m-pad">${editor}</div>`, bodyClass: 'white' })
  return workspace({
    side: 'clubs',
    activeClub: '프레임',
    main: `${mainHead({ crumb: '내 동아리', title: '프레임', actions: '<span class="pill neutral">편집 중</span>' })}
      <div class="main-body"><div class="card"><div class="card-head"><h2>위키</h2><span class="faint">마크다운</span></div>${editor}</div></div>`,
  })
}

function invitePreview(device) {
  const card = `<div class="login-card" style="text-align:left">
    <div class="crumb">초대 링크</div>
    <div class="club-hero" style="margin:12px 0"><span class="mark">프</span><div><div class="event-title" style="font-size:18px">주말출사</div><div class="meta-line">프레임 · 비밀번호 없음</div></div></div>
    <p class="muted">참여하면 이 방의 대화, 파일, 일정을 볼 수 있습니다.</p>
    <button class="btn btn-primary btn-block" style="margin-top:16px">참여하기</button>
    <button class="btn btn-ghost btn-block">나중에</button>
  </div>`
  if (device === 'mobile') return `<div class="m-app" style="background:var(--bg)">${statusBar()}<div class="login">${card}</div><div class="home-ind" style="background:var(--bg)"><span></span></div></div>`
  return `<div class="login">${card}</div>`
}

function qrScan(device) {
  const cam = `<div class="finder"><div style="padding:16px 18px;display:flex;align-items:center"><button style="color:#fff">${icon('close')}</button><span style="margin-left:8px;font-weight:600">QR 스캔</span></div><div class="finder-frame"></div><p style="text-align:center;padding:28px 32px 48px;color:#c8cbc4;font-size:14px">초대 QR을 네모 안에 맞춰 주세요.</p></div>`
  if (device === 'mobile') return `<div class="m-app">${statusBar()}${cam}<div class="home-ind" style="background:#121412"><span style="background:#fff"></span></div></div>`
  return workspace({
    main: roomHomeMain(),
    overlay: `<div class="scrim"><div class="dialog" style="overflow:hidden;height:520px">${cam}</div></div>`,
  })
}

function skeleton(device) {
  const blocks = `<div class="stack">
    <div class="card" style="display:flex;gap:12px;align-items:center"><div class="skel" style="width:44px;height:44px"></div><div class="grow"><div class="skel" style="height:14px;width:32%;margin-bottom:8px"></div><div class="skel" style="height:10px;width:48%"></div></div></div>
    <div class="card"><div class="skel" style="height:12px;width:18%;margin-bottom:12px"></div><div class="skel" style="height:12px;width:92%;margin-bottom:8px"></div><div class="skel" style="height:12px;width:76%"></div></div>
    <div class="card"><div class="skel" style="height:12px;width:28%;margin-bottom:14px"></div><div class="skel" style="height:36px;margin-bottom:8px"></div><div class="skel" style="height:36px"></div></div>
  </div>`
  if (device === 'mobile') return mobileFrame({ head: backHead('프레임', '동아리'), body: `<div class="m-pad">${blocks}</div>` })
  return workspace({ side: 'clubs', activeClub: '프레임', main: `${mainHead({ crumb: '내 동아리', title: '프레임' })}<div class="main-body">${blocks}</div>` })
}

function foundations() {
  const swatches = [
    ['배경', '--bg'], ['크롬', '--chrome'], ['표면', '--surface'], ['테두리', '--border-strong'],
    ['본문', '--text'], ['보조', '--text-2'], ['흐림', '--text-3'], ['강조', '--accent'],
    ['강조 면', '--accent-soft'], ['위험', '--danger'], ['온라인', '--online'],
  ]
  return `<div class="found">
    <section>
      <h2>색</h2>
      ${swatches.map(([n, v]) => `<div class="swatch"><i style="background:var(${v})"></i><span>${n}<br><span class="faint">${v}</span></span></div>`).join('')}
      <h2 style="margin-top:18px">간격 · 4px</h2>
      <div class="space-row">${[4, 8, 12, 16, 24, 32].map((n) => `<i style="height:${n}px" title="${n}"></i>`).join('')}</div>
      <h2 style="margin-top:18px">모서리</h2>
      <div class="row" style="gap:8px"><i style="width:36px;height:36px;border:1px solid var(--border-strong);border-radius:6px"></i><i style="width:36px;height:36px;border:1px solid var(--border-strong);border-radius:8px"></i><i style="width:36px;height:36px;border:1px solid var(--border-strong);border-radius:12px"></i></div>
    </section>
    <section>
      <h2>글자 · Pretendard</h2>
      <div class="type-row"><small>28 / 700 화면 제목</small><div style="font-size:28px;font-weight:700;letter-spacing:-0.03em">동아리를 선택하세요</div></div>
      <div class="type-row"><small>16 / 600 패널 제목</small><div style="font-size:16px;font-weight:600">주말출사</div></div>
      <div class="type-row"><small>14 / 400 본문</small><div>이번 주 토요일 남산 야경, 삼각대 있는 사람 손?</div></div>
      <div class="type-row"><small>12 / 600 메타</small><div class="faint" style="font-weight:600">토 17:00–20:00 · 남산서울타워</div></div>
      <h2 style="margin-top:20px">컨트롤</h2>
      <div class="row" style="gap:8px;margin-bottom:10px"><button class="btn btn-primary">저장</button><button class="btn btn-secondary">취소</button><button class="btn btn-danger">삭제</button><button class="btn btn-ghost">더 보기</button></div>
      <div class="input" style="margin-bottom:8px">일정 제목</div>
      <div class="seg" style="max-width:280px"><button class="on">참석</button><button>미정</button><button>불참</button></div>
      <h2 style="margin-top:20px">메시지</h2>
      ${msg({ person: people[0], time: '14:02', text: '말풍선 대신, 이름과 시각이 있는 한 줄 그룹입니다.', reacts: '<span class="react on">좋아요 3</span>' })}
    </section>
    <section style="border-right:0">
      <h2>원칙</h2>
      <p>강조색은 한 가지. 상태 색은 데이터에만.</p>
      <p style="margin-top:8px">크롬은 본문보다 한 단계 어둡고, 그림자는 다이얼로그에만.</p>
      <p style="margin-top:8px">한글 본문은 14px. 영문 제품의 13px 밀도를 그대로 쓰지 않습니다.</p>
      <div class="card" style="margin-top:16px"><div class="card-head"><h2>목록</h2><span class="count">3</span></div>
        <button class="nav-item active"><span class="hash">#</span><span class="nav-name">주말출사</span></button>
        <button class="nav-item unread"><span class="hash">#</span><span class="nav-name grow">자유</span><span class="count">4</span></button>
      </div>
    </section>
  </div>`
}

const screens = {
  login: (d) => login(d),
  'clubs-empty': (d) => clubsEmpty(d),
  clubs: (d) => clubs(d),
  'club-home': (d) => clubHome(d),
  'room-home': (d) => roomHome(d),
  chat: (d) => chat(d),
  'chat-edit': (d) => chat(d, { editing: true }),
  'message-menu': (d) => chat(d, { menu: true }),
  search: (d) => search(d),
  events: (d) => events(d),
  'event-detail': (d) => eventDetail(d),
  'event-form': (d) => eventForm(d),
  profile: (d) => profile(d),
  'join-code': (d) => joinCode(d),
  'create-club': (d) => createClub(d),
  'create-room': (d) => createRoom(d),
  invite: (d) => invite(d),
  'room-manage': (d) => roomManage(d),
  'club-manage': (d) => clubManage(d),
  members: (d) => members(d),
  'room-join': (d) => roomJoin(d),
  apply: (d) => apply(d),
  'wiki-editor': (d) => wikiEditor(d),
  'invite-preview': (d) => invitePreview(d),
  'qr-scan': (d) => qrScan(d),
  skeleton: (d) => skeleton(d),
  foundations: () => foundations(),
}

const jobs = []
const both = Object.keys(screens).filter((id) => id !== 'foundations')
for (const id of both) {
  for (const device of ['desktop', 'mobile']) jobs.push({ id, device, theme: 'light' })
}
jobs.push({ id: 'foundations', device: 'desktop', theme: 'light' })
for (const id of ['login', 'club-home', 'chat', 'foundations']) jobs.push({ id, device: 'desktop', theme: 'dark' })
jobs.push({ id: 'chat', device: 'mobile', theme: 'dark' })
jobs.push({ id: 'event-detail', device: 'mobile', theme: 'dark' })

const manifest = []
for (const job of jobs) {
  const file = `${job.id}.${job.device}.${job.theme}.html`
  const body = screens[job.id](job.device, job.theme)
  const html = `<!doctype html>
<html lang="ko" data-theme="${job.theme}">
<head>
<meta charset="utf-8"/>
<title>${job.id} ${job.device} ${job.theme}</title>
<link rel="stylesheet" href="../styles.css"/>
</head>
<body>${body}</body>
</html>`
  writeFileSync(join(pagesDir, file), html)
  manifest.push({ ...job, file })
}

const index = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>ClubChat mockups</title>
<link rel="stylesheet" href="styles.css"/>
<style>body{overflow:auto;padding:32px 40px;background:var(--bg)} a{color:var(--accent-text);display:block;padding:4px 0;font-size:14px} h1{font-size:22px;margin-bottom:8px}</style>
</head><body>
<h1>ClubChat 목업</h1>
<p class="muted" style="margin-bottom:16px">승인 전 시안입니다. 앱 소스와는 연결되어 있지 않습니다.</p>
${manifest.map((j) => `<a href="./pages/${j.file}">${j.id} · ${j.device} · ${j.theme}</a>`).join('')}
</body></html>`
writeFileSync(join(root, 'index.html'), index)
writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`wrote ${manifest.length} pages`)
