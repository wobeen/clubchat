import { getConfirmationTargets, getPendingMessageCount } from './domain.js';
// 데이터와 회의 로직은 공유한다. 화면 구조는 디스코드를 따른다:
// 모임 레일 | 캡슐 목록(안건 묶음 = 카테고리, 회차·하위 캡슐 = 채널) | 대화 | 캡슐 정보·참여자 패널.
export function groupAvatar(m, { state, esc }) {
  const people = m.memberIds.slice(0, 4).map((id) => state.members.find((p) => p.id === id));
  return `<span class="group-avatar ${people.length === 1 ? 'single-avatar' : ''}" aria-hidden="true">${people.map((p) => `<i class="${p?.color || 'blue'}">${esc(p?.name.slice(-2) || '?')}</i>`).join('')}</span>`;
}

/**
 * Groups capsules into series: a root capsule (no parent, no previous) with its next rounds (previousId chain)
 * and, under each round, its delegated child capsules (parentId, nested). Order follows `meetings` order of the
 * first member seen, so the most recent activity stays on top.
 */
export function capsuleSeries(meetings) {
  const byId = new Map(meetings.map((m) => [m.id, m]));
  const rootOf = (m) => {
    const seen = new Set();
    let r = m;
    while (!seen.has(r.id)) {
      seen.add(r.id);
      const up = byId.get(r.parentId) || byId.get(r.previousId);
      if (!up) break;
      r = up;
    }
    return r;
  };
  const series = new Map();
  for (const m of meetings) {
    const root = rootOf(m);
    if (!series.has(root.id)) series.set(root.id, { root, rows: [] });
  }
  const placed = new Set();
  const visit = (m, depth, round, rows) => {
    if (placed.has(m.id)) return;
    placed.add(m.id);
    rows.push({ m, depth, round });
    for (const c of meetings.filter((x) => x.parentId === m.id)) visit(c, depth + 1, 0, rows);
    for (const n of meetings.filter((x) => x.previousId === m.id && !x.parentId))
      visit(n, depth, round ? round + 1 : 0, rows);
  };
  for (const s of series.values()) visit(s.root, 0, 1, s.rows);
  for (const s of series.values()) {
    const rounds = s.rows.filter((r) => r.round).length;
    if (rounds < 2) for (const r of s.rows) r.round = 0;
  }
  return [...series.values()];
}

export function renderRoomList(ctx) {
  const { state, page, activeId, listFilter, listSearch, esc, icon, btn, canRead, avatar } = ctx;
  const collapsed = ctx.collapsedSeries || new Set();
  const all = state.meetings.filter((m) => canRead(m, state.profileId));
  const needsMyReview = (m) =>
    m.status === 'review' &&
    getConfirmationTargets(m).includes(state.profileId) &&
    !m.confirmations.includes(state.profileId);
  const unread = (m) => Math.max(0, m.messages.length - (state.reads?.[`${state.profileId}:${m.id}`] ?? 0));
  const matches = (m) =>
    (listFilter === 'all' ||
      (listFilter === 'unread' && unread(m) > 0) ||
      (listFilter === 'review' && needsMyReview(m)) ||
      (listFilter === 'waiting' && m.status === 'review' && !needsMyReview(m)) ||
      (listFilter === 'child' && m.parentId) ||
      (listFilter === 'scheduled' && m.status === 'scheduled')) &&
    (!listSearch ||
      m.title.toLowerCase().includes(listSearch.toLowerCase()) ||
      m.messages.some((x) => x.text.toLowerCase().includes(listSearch.toLowerCase())));
  const statusTag = (m) => {
    if (m.status === 'review')
      return getPendingMessageCount(m)
        ? ['반영 필요', 'attention']
        : needsMyReview(m)
          ? ['내 확인 필요', 'attention']
          : ['확인 대기', ''];
    if (m.status === 'scheduled')
      return [
        m.startsAt
          ? `예약 ${new Date(m.startsAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' })}`
          : '예약',
        '',
      ];
    // An ongoing discussion is the default state and gets no tag, as in Discord's quiet channel list.
    return { confirmed: ['확정', 'done'], deferred: ['보류', ''], cancelled: ['취소', ''] }[m.status] || ['', ''];
  };
  const selected = (m) => page === 'meeting' && activeId === m.id;
  const channel = ({ m, depth, round }) => {
    const [tag, tone] = statusTag(m),
      count = unread(m),
      label = round ? `${round}차 · ${m.title}` : m.title;
    return btn(
      'open',
      `<span class="channel-mark" aria-hidden="true">${depth ? '↳' : '#'}</span><span class="room-list-title">${esc(label)}</span>${tag ? `<span class="room-list-tag ${m.status} ${tone}">${esc(tag)}</span>` : ''}${count ? `<b class="unread-badge" aria-label="안 읽은 메시지 ${count}개">${count > 99 ? '99+' : count}</b>` : ''}`,
      `room-list-row channel ${depth ? 'child' : ''} ${selected(m) ? 'selected' : ''}`,
      `data-id="${esc(m.id)}" style="--depth:${Math.min(depth, 3)}" ${selected(m) ? 'aria-current="page"' : ''}`,
    );
  };
  // Series keep activity order. A capsule with no rounds or delegations is a plain channel; a series is a
  // collapsible category holding its rounds and delegated capsules.
  const channels = capsuleSeries(all)
    .map(({ root, rows }) => {
      const shown = rows.filter((r) => matches(r.m));
      if (!shown.length) return '';
      if (rows.length === 1) return channel(rows[0]);
      const closed = collapsed.has(root.id);
      const visible = closed ? shown.filter((r) => selected(r.m) || unread(r.m)) : shown;
      return `<section class="series" aria-label="${esc(root.title)} 묶음">${btn(
        'toggle-series',
        `${icon('chevron')}<span>${esc(root.title)}</span>`,
        `series-title ${closed ? 'closed' : ''}`,
        `data-id="${esc(root.id)}" aria-expanded="${!closed}"`,
      )}<div class="series-channels">${visible.map(channel).join('')}</div></section>`;
    })
    .join('');
  const me = state.members.find((p) => p.id === state.profileId);
  const pageLink = (destination, ic, label) =>
    btn(
      'workspace',
      `${icon(ic)}<span>${label}</span>`,
      `org-page ${page === destination ? 'active' : ''}`,
      `data-page="${destination}" ${page === destination ? 'aria-current="page"' : ''}`,
    );
  return `<div class="list-top"><div class="org-header"><h1>${esc(state.organization || '잇다')}</h1><div>${btn('toggle-list-search', icon('search'), 'list-action', 'aria-label="캡슐 검색"')}${btn('create', icon('plus'), 'list-action', 'aria-label="새 캡슐 만들기"')}</div></div><nav class="org-pages" aria-label="모임 메뉴">${pageLink('calendar', 'calendar', '확정 일정')}${pageLink('archive', 'archive', '확정 기록')}${pageLink('members', 'users', '멤버')}</nav>${ctx.searchOpen ? `<label class="room-search">${icon('search')}<input id="room-search" aria-label="캡슐 검색어" placeholder="캡슐 이름, 대화 검색" value="${esc(listSearch)}">${btn('clear-list-search', icon('close'), 'icon-button', 'aria-label="검색어 지우기"')}</label>` : ''}<nav class="list-filters" aria-label="캡슐 목록 필터">${[
    ['all', '전체'],
    ['review', '내 확인 필요'],
    ['waiting', '확인 대기'],
    ['child', '하위 캡슐'],
    ['scheduled', '예약'],
    ['unread', '안읽음'],
  ]
    .map(([id, label]) =>
      btn(
        'list-filter',
        label +
          (id === 'unread' && all.some((m) => unread(m))
            ? `<span>${all.reduce((n, m) => n + unread(m), 0)}</span>`
            : ''),
        listFilter === id ? 'active' : '',
        `data-filter="${id}" aria-pressed="${listFilter === id}"`,
      ),
    )
    .join(
      '',
    )}</nav></div><div class="room-list-rows" aria-label="캡슐 목록">${channels || '<div class="list-empty">조건에 맞는 캡슐이 없어요.<br>다른 필터로 확인해보세요.</div>'}</div><div class="user-panel">${btn('settings', avatar(state.profileId, 'small'), 'user-panel-profile', 'aria-label="시연 참여자 전환"')}<span class="user-panel-name"><strong>${esc(me?.name || '')}</strong><small>${ctx.remote ? '서버 저장' : '로컬 데모'}</small></span>${ctx.android ? '' : btn('preview', icon('phone'), 'icon-button', 'aria-label="PC·안드로이드 디자인 미리보기" title="PC·안드로이드 미리보기"')}${btn('settings', icon('settings'), 'icon-button', 'aria-label="설정" title="설정"')}</div>`;
}

/** Discord-style server rail: the brand, then one icon per 모임 (the demo and server mode load one). */
function renderOrgRail(ctx) {
  const { state, esc, btn, icon } = ctx;
  const org = state.organization;
  return `<nav class="talk-rail org-rail" aria-label="모임"><a class="rail-logo" href="/" aria-label="잇다 홈">${icon('link')}</a><span class="rail-separator" aria-hidden="true"></span>${
    org
      ? btn(
          'workspace',
          `<span aria-hidden="true">${esc(org.slice(0, 1))}</span><span class="rail-tooltip">${esc(org)}</span>`,
          'org-icon active',
          `data-page="meeting" aria-label="${esc(org)}" title="${esc(org)}" aria-current="true"`,
        )
      : ''
  }</nav>`;
}

export function renderDesktop(ctx) {
  const { page, roomContent, workspaceContent, panelContent } = ctx;
  const panel = page === 'meeting' && ctx.panelOpen && panelContent;
  return `<div class="messenger-shell desktop-ui ${panel ? 'with-panel' : ''}">${renderOrgRail(ctx)}<aside class="talk-list">${renderRoomList(ctx)}</aside><main class="talk-main ${page !== 'meeting' ? 'workspace-mode' : ''}">${page === 'meeting' ? roomContent : workspaceContent}</main>${panel ? `<aside class="capsule-panel" aria-label="캡슐 정보와 참여자">${panelContent}</aside>` : ''}</div>`;
}

export function renderAndroid(ctx) {
  const { page, mobileScreen, roomContent, workspaceContent, btn, icon } = ctx;
  const isRoom = page === 'meeting' && mobileScreen === 'room';
  if (isRoom) return `<div class="android-ui android-room"><main class="android-room-main">${roomContent}</main></div>`;
  if (page !== 'meeting')
    return `<div class="android-ui android-page"><header class="android-page-header">${btn('workspace', icon('back'), 'icon-button', 'data-page="meeting" aria-label="캡슐 목록으로 돌아가기"')}<h1>${{ members: '멤버', calendar: '확정 일정', archive: '확정 기록' }[page]}</h1></header><main class="android-workspace">${workspaceContent}</main></div>`;
  return `<div class="android-ui android-home">${renderOrgRail(ctx)}<section class="android-list">${renderRoomList({ ...ctx, android: true })}</section></div>`;
}
