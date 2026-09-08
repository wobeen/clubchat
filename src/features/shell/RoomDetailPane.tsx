// ─── 방 상세패널 (Phase 2) ────────────────────────────────────────────────────────
// 넓은 화면에서 채팅 뷰(view=chat)로 들어갔을 때만 오른쪽에 뜨는 보조 패널.
// 채팅에 있는 동안에도 위키/일정/멤버를 잠깐 확인할 수 있게 하는 것이 목적이라
// 풀 위키 렌더링(WikiViewer)이 아니라 텍스트 미리보기만 보여준다 — 전체 내용은
// "홈에서 보기"로 view=home으로 돌아가서 본다.

import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Pressable } from '../ui/Pressable'
import { colors, radius, shadows } from '../ui/theme'
import type { ChannelMemberSummary } from './useChannelMembers'
import { EventPreviewRow } from '../schedule/EventPreviewRow'
import type { EventWithMyResponse } from '../schedule/types'
import { getInitials } from './shellUtils'
import { getAvatarColor } from '../chat/chatUtils'

const WIKI_PREVIEW_LENGTH = 160

interface RoomDetailPaneProps {
  roomName: string
  wikiContent: string | null
  wikiLoading: boolean
  events: EventWithMyResponse[]
  eventsLoading: boolean
  members: ChannelMemberSummary[]
  membersLoading: boolean
  onPressWiki: () => void
  onPressEvent: (eventId: string) => void
  onPressAllEvents: () => void
}

function toWikiPreview(content: string | null): string {
  if (!content) return ''
  const flat = content.replace(/[#*_`>-]/g, '').replace(/\s+/g, ' ').trim()
  return flat.length > WIKI_PREVIEW_LENGTH ? `${flat.slice(0, WIKI_PREVIEW_LENGTH)}…` : flat
}

export function RoomDetailPane({
  roomName,
  wikiContent,
  wikiLoading,
  events,
  eventsLoading,
  members,
  membersLoading,
  onPressWiki,
  onPressEvent,
  onPressAllEvents,
}: RoomDetailPaneProps) {
  const preview = toWikiPreview(wikiContent)
  const previewEvents = events.slice(0, 3)

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.roomName} numberOfLines={1}>{roomName}</Text>

      {/* 멤버 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>멤버 {members.length}명</Text>
        {membersLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <View style={styles.memberList}>
            {members.map((m) => {
              const color = getAvatarColor(m.display_name)
              return (
                <View key={m.id} style={styles.memberRow}>
                  <View style={[styles.memberAvatar, { backgroundColor: m.avatar_emoji ? '#FFF3E0' : color.bg }]}>
                    {m.avatar_emoji
                      ? <Text style={styles.memberAvatarEmoji}>{m.avatar_emoji}</Text>
                      : <Text style={[styles.memberAvatarText, { color: color.text }]}>{getInitials(m.display_name)}</Text>}
                  </View>
                  <Text style={styles.memberName} numberOfLines={1}>{m.display_name}</Text>
                </View>
              )
            })}
          </View>
        )}
      </View>

      {/* 위키 미리보기 */}
      <Pressable style={styles.card} onPress={onPressWiki} accessibilityRole="button" accessibilityLabel="위키 홈에서 보기">
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>📌 위키</Text>
          <Text style={styles.cardLink}>홈에서 보기</Text>
        </View>
        {wikiLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : preview ? (
          <Text style={styles.wikiPreview} numberOfLines={4}>{preview}</Text>
        ) : (
          <Text style={styles.emptyText}>아직 작성된 위키가 없어요.</Text>
        )}
      </Pressable>

      {/* 다가오는 일정 */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>다가오는 일정</Text>
          <Pressable onPress={onPressAllEvents} hitSlop={8} accessibilityRole="button" accessibilityLabel="일정 전체 보기">
            <Text style={styles.cardLink}>전체 보기</Text>
          </Pressable>
        </View>
        {eventsLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : previewEvents.length === 0 ? (
          <Text style={styles.emptyText}>다가오는 일정이 없어요</Text>
        ) : (
          <View style={styles.eventList}>
            {previewEvents.map((event) => (
              <EventPreviewRow key={event.id} event={event} onPress={() => onPressEvent(event.id)} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 24 },

  roomName: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, paddingHorizontal: 2 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
    ...shadows.card,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  cardLink: { fontSize: 12, fontWeight: '600', color: colors.primary },
  emptyText: { fontSize: 13, color: '#A9B1BA', lineHeight: 20 },
  wikiPreview: { fontSize: 13, color: colors.text, lineHeight: 20 },

  memberList: { gap: 10 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  memberAvatarEmoji: { fontSize: 14 },
  memberAvatarText: { fontSize: 11, fontWeight: '800' },
  memberName: { fontSize: 13, fontWeight: '600', color: colors.text, flexShrink: 1 },

  eventList: { gap: 12 },
})
