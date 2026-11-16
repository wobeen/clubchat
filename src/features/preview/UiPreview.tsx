import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { GlassSurface } from '../ui/Glass'
import { Button } from '../ui/GlassControls'
import { colors, radius } from '../ui/theme'
import { fontStyle } from '../ui/fonts'
import { MyMessageBubble, OtherMessageBubble } from '../chat/MessageBubble'
import { ChatComposer } from '../chat/ChatComposer'
import { MemberProfileCard, MemberProfile } from '../club/MemberProfileCard'
import EventFormScreen from '../schedule/EventFormScreen'
import CreateClubScreen from '../../../app/(app)/clubs/create'
import CreateRoomScreen from '../../../app/(app)/channels/create'
import { useBreakpoint } from '../shell/useBreakpoint'
import type { ChatMessage, SenderInfo } from '../chat/types'

const ME: SenderInfo = { id: 'me', display_name: '김하은', avatar_url: null, avatar_emoji: null }
const OTHER: SenderInfo = { id: 'other', display_name: '박서준', avatar_url: null, avatar_emoji: null }

function message(id: string, sender: SenderInfo, content: string): ChatMessage {
  return {
    id,
    channelId: 'preview',
    senderId: sender.id,
    content,
    type: 'text',
    createdAt: new Date().toISOString(),
    editedAt: null,
    deletedAt: null,
    sender,
  }
}

const PROFILE: MemberProfile = {
  id: 'me',
  display_name: '김하은',
  avatar_emoji: null,
  grade: '23학번',
  birth_year: 2004,
  gender: 'female',
  joined_at: '2024-03-02T00:00:00.000Z',
  role: 'owner',
  channelName: '주말출사',
}

type Scene =
  | 'club'
  | 'chat'
  | 'event'
  | 'form'
  | 'invite'
  | 'members'
  | 'create-club'
  | 'create-room'
  | 'search'
  | 'manage'
  | 'room'
  | 'apply'

export function UiPreview() {
  const params = useLocalSearchParams<{ scene?: string; clean?: string }>()
  const scene = (params.scene as Scene) || 'club'
  const clean = params.clean === '1'
  const [profile, setProfile] = useState<MemberProfile | null>(scene === 'members' ? PROFILE : null)

  return (
    <View style={styles.fill}>
      {!clean ? (
        <ScrollView horizontal contentContainerStyle={styles.switcher} showsHorizontalScrollIndicator={false}>
          {(['club', 'chat', 'event', 'form', 'invite', 'members', 'create-club', 'create-room', 'search', 'manage', 'room', 'apply'] as Scene[]).map((key) => (
            <Button key={key} label={key} variant={scene === key ? 'primary' : 'secondary'} onPress={() => {
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href)
                url.searchParams.set('scene', key)
                window.history.replaceState(null, '', url.toString())
                window.location.reload()
              }
            }} />
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.fill}>
        {scene === 'club' ? <ClubScene /> : null}
        {scene === 'chat' ? <ChatScene /> : null}
        {scene === 'event' ? <EventScene /> : null}
        {scene === 'form' ? (
          <EventFormScreen onSaved={() => {}} onCancel={() => {}} channelId="preview" />
        ) : null}
        {scene === 'invite' ? <InviteScene /> : null}
        {scene === 'members' ? <MembersScene onOpen={() => setProfile(PROFILE)} /> : null}
        {scene === 'create-club' ? <CreateClubScreen /> : null}
        {scene === 'create-room' ? <CreateRoomScreen /> : null}
        {scene === 'search' ? <SearchScene /> : null}
        {scene === 'manage' ? <ManageScene /> : null}
        {scene === 'room' ? <RoomManageScene /> : null}
        {scene === 'apply' ? <ApplyScene /> : null}
      </View>
      <MemberProfileCard profile={profile} onClose={() => setProfile(null)} />
    </View>
  )
}

function ClubScene() {
  const { isCompact } = useBreakpoint()
  const main = (
    <GlassSurface tone="text" style={isCompact ? styles.mainSolo : styles.main}>
      <Text style={styles.kicker}>프레임</Text>
      <Text style={styles.title}>주말출사</Text>
      <GlassSurface tone="nested" style={styles.card}>
        <Text style={styles.cardTitle}>방 위키</Text>
        <Text style={styles.body}>토요일 야외 촬영 방입니다. 장소 투표와 장비 대여를 여기서 정리합니다.</Text>
      </GlassSurface>
      <GlassSurface tone="nested" style={styles.card}>
        <Text style={styles.cardTitle}>다가오는 일정</Text>
        <Text style={styles.body}>11월 15일 · 남산 야경 출사 · 남산서울타워</Text>
      </GlassSurface>
      <Button label="채팅 열기" style={styles.block} />
    </GlassSurface>
  )
  if (isCompact) return main
  return (
    <View style={styles.row}>
      <GlassSurface tone="chrome" style={styles.rail}>
        <View style={styles.logo}><Text style={styles.logoText}>C</Text></View>
        <View style={styles.railDot}><Text style={styles.railLetter}>프</Text></View>
      </GlassSurface>
      <GlassSurface tone="text" style={styles.side}>
        <Text style={styles.kicker}>프레임</Text>
        <Text style={styles.meta}>방 4 · 멤버 12</Text>
        <Text style={[styles.rowTitle, styles.activeRow]}>주말출사</Text>
        <Text style={styles.rowTitle}>공지</Text>
        <Text style={styles.rowTitle}>자유</Text>
      </GlassSurface>
      {main}
    </View>
  )
}

function ChatScene() {
  return (
    <GlassSurface tone="text" style={styles.mainSolo}>
      <Text style={styles.title}>주말출사</Text>
      <OtherMessageBubble msg={message('1', OTHER, '토요일 타워 쪽에서 모일까요?')} />
      <MyMessageBubble msg={message('2', ME, '일몰 직후가 좋아요. 장비는 제가 챙길게요.')} />
      <View style={styles.grow} />
      <ChatComposer
        value=""
        onChangeText={() => {}}
        onSend={() => {}}
        sending={false}
        uploading={false}
        editingMessageId={null}
        editingContent=""
        onCancelEdit={() => {}}
        onPickImage={() => {}}
        onPickFile={() => {}}
      />
    </GlassSurface>
  )
}

function EventScene() {
  return (
    <GlassSurface tone="text" style={styles.mainSolo}>
      <Text style={styles.kicker}>주말출사</Text>
      <Text style={styles.title}>남산 야경 출사</Text>
      <Text style={styles.body}>11월 15일 (토) 오후 5:00 · 남산서울타워</Text>
      <GlassSurface tone="nested" style={styles.card}>
        <Text style={styles.cardTitle}>참석 6 · 불참 1 · 미정 4</Text>
        <Text style={styles.body}>일몰 직후 타워 쪽에서 모입니다.</Text>
      </GlassSurface>
      <View style={styles.pair}>
        <Button label="참석" style={styles.block} />
        <Button label="미정" variant="secondary" style={styles.block} />
        <Button label="불참" variant="secondary" style={styles.block} />
      </View>
    </GlassSurface>
  )
}

function InviteScene() {
  return (
    <View style={styles.center}>
      <GlassSurface tone="text" style={styles.dialog}>
        <Text style={styles.title}>주말출사 초대</Text>
        <View style={styles.qr}><Text style={styles.meta}>QR</Text></View>
        <Text style={styles.code}>K7QM2P4A</Text>
        <Text style={styles.body}>링크와 같은 초대입니다. 새 코드를 발급하면 이전 코드는 바로 만료됩니다.</Text>
        <View style={styles.pair}>
          <Button label="링크 복사" variant="secondary" style={styles.block} />
          <Button label="공유" style={styles.block} />
        </View>
      </GlassSurface>
    </View>
  )
}

function MembersScene({ onOpen }: { onOpen: () => void }) {
  return (
    <GlassSurface tone="text" style={styles.mainSolo}>
      <Text style={styles.title}>멤버</Text>
      <GlassSurface tone="chrome" radius={radius.full} style={styles.segment}>
        <Text style={styles.rowTitle}>현역 4</Text>
        <Text style={styles.meta}>OB · 졸업생 1</Text>
      </GlassSurface>
      <Button label="김하은 · 방장" variant="secondary" onPress={onOpen} style={styles.block} />
      <Text style={styles.body}>이름을 누르면 프로필 시트가 열립니다.</Text>
    </GlassSurface>
  )
}

function SearchScene() {
  return (
    <View style={styles.fill}>
      <GlassSurface tone="chrome" radius={radius.full} style={styles.searchBar}>
        <Text style={styles.body}>남산</Text>
      </GlassSurface>
      <GlassSurface tone="text" radius={22} style={styles.card}>
        <Text style={styles.meta}>박서준 · 토 17:02</Text>
        <Text style={styles.body}>토요일 <Text style={styles.hit}>남산</Text> 타워 쪽에서 모일까요?</Text>
      </GlassSurface>
      <GlassSurface tone="text" radius={22} style={styles.card}>
        <Text style={styles.meta}>김하은 · 토 17:06</Text>
        <Text style={styles.body}>일몰 직후 <Text style={styles.hit}>남산</Text>서울타워가 좋아요.</Text>
      </GlassSurface>
    </View>
  )
}

function ManageScene() {
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <GlassSurface tone="text" style={styles.card}>
        <Text style={styles.cardTitle}>동아리 공개</Text>
        <Text style={styles.body}>공개하면 검색에 노출되고 누구나 가입 신청을 보낼 수 있어요.</Text>
        <Text style={styles.meta}>신규 부원 모집 중 · 공개 상태</Text>
      </GlassSurface>
      <Text style={styles.kicker}>가입 신청 1건</Text>
      <GlassSurface tone="text" style={styles.card}>
        <Text style={styles.cardTitle}>이수민 · 24학번</Text>
        <Text style={styles.body}>사진 동아리에서 촬영을 배우고 싶어요.</Text>
        <View style={styles.pair}>
          <Button label="승인" style={styles.block} />
          <Button label="거절" variant="secondary" style={styles.block} />
        </View>
      </GlassSurface>
      <GlassSurface tone="text" style={styles.card}>
        <Text style={styles.kicker}>초대 코드</Text>
        <Text style={styles.code}>K7QM2P4A</Text>
        <View style={styles.pair}>
          <Button label="복사" variant="secondary" style={styles.block} />
          <Button label="재발급" variant="secondary" style={styles.block} />
        </View>
      </GlassSurface>
    </ScrollView>
  )
}

function RoomManageScene() {
  return (
    <View style={styles.center}>
      <GlassSurface tone="text" style={styles.dialog}>
        <Text style={styles.kicker}>주말출사 초대</Text>
        <View style={styles.qr}><Text style={styles.meta}>QR</Text></View>
        <Text style={styles.code}>K7QM2P4A</Text>
        <View style={styles.pair}>
          <Button label="링크 복사" variant="secondary" style={styles.block} />
          <Button label="공유" style={styles.block} />
        </View>
        <Button label="새 코드 발급" variant="danger" style={styles.block} />
        <Text style={styles.body}>비밀번호로 보호되고 있어요</Text>
        <Button label="비밀번호 변경" style={styles.block} />
      </GlassSurface>
    </View>
  )
}

function ApplyScene() {
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <GlassSurface tone="text" style={styles.card}>
        <Text style={styles.title}>프레임</Text>
        <Text style={styles.meta}>멤버 12명</Text>
        <Text style={styles.body}>신규 부원 모집 중</Text>
      </GlassSurface>
      <GlassSurface tone="text" style={styles.card}>
        <Text style={styles.cardTitle}>자기소개 한마디</Text>
        <Text style={styles.body}>사진 동아리에서 촬영을 배우고 싶어요.</Text>
      </GlassSurface>
      <Button label="가입 신청 보내기" style={styles.block} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: 'transparent' },
  switcher: { gap: 8, padding: 12 },
  row: { flex: 1, flexDirection: 'row', gap: 12, padding: 12 },
  rail: { width: 68, alignItems: 'center', paddingVertical: 16, gap: 12 },
  side: { width: 240, padding: 16, gap: 8 },
  main: { flex: 1, padding: 20, gap: 12 },
  mainSolo: { flex: 1, margin: 12, padding: 20, gap: 12 },
  logo: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: colors.paper, ...fontStyle('700') },
  railDot: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  railLetter: { ...fontStyle('700'), color: colors.ink },
  kicker: { fontSize: 12, color: colors.textMuted, ...fontStyle('600') },
  title: { fontSize: 22, color: colors.ink, ...fontStyle('700') },
  cardTitle: { fontSize: 14, color: colors.ink, ...fontStyle('700') },
  body: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, ...fontStyle('400') },
  meta: { fontSize: 13, color: colors.textSecondary, ...fontStyle('500') },
  rowTitle: { fontSize: 15, color: colors.ink, ...fontStyle('600'), paddingVertical: 8 },
  activeRow: { backgroundColor: colors.paper, borderRadius: 18, paddingHorizontal: 12 },
  card: { padding: 16, gap: 8 },
  block: { minHeight: 44 },
  grow: { flex: 1 },
  pair: { flexDirection: 'row', gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 420, padding: 24, gap: 12, alignItems: 'center' },
  qr: { width: 180, height: 180, borderRadius: 22, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  code: { fontSize: 20, letterSpacing: 2, color: colors.accent, ...fontStyle('700') },
  segment: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  searchBar: { margin: 16, paddingHorizontal: 16, paddingVertical: 12 },
  pad: { padding: 16, gap: 12 },
  hit: { backgroundColor: '#D7E6F5', color: colors.accent, ...fontStyle('700') },
})
