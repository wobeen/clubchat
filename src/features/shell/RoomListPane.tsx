// ─── 방 목록 패널 ────────────────────────────────────────────────────────────────
// app/(app)/clubs/[id].tsx의 ChannelRow + 방 목록 렌더링을 추출한 것(시각적으로 동일).
// 두 군데서 쓰인다:
//  (a) depth-2(w/[clubId]/[roomId]) 넓은 화면의 독립된 목록 컬럼 — 호출부가
//      <ScrollView style={{flex:1}}>로 감싸서 스크롤을 제공한다.
//  (b) depth-1(w/[clubId]/index) 메인 콘텐츠의 "방 목록" 섹션 — 이미 스크롤 중인
//      페이지 ScrollView 안에 그대로 끼워 넣는다.
// 이 두 사용처의 요구사항이 충돌하기 때문에(독립 스크롤 vs 중첩 없는 인라인 배치)
// 이 컴포넌트 자체는 flex:1도, 자체 ScrollView도 갖지 않는다 — 내용 높이만큼만
// 차지하는 순수 콘텐츠 블록이고, 스크롤/패딩은 항상 호출부 책임이다.
//
// activeRoomId?는 스펙 필수 prop 목록에는 없지만, 목록 컬럼으로 쓰일 때 현재 선택된
// 방을 강조 표시하기 위해 추가한 선택적 prop이다(ClubListPane의 activeClubId와 동일한 이유).

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Pressable } from '../ui/Pressable'
import { colors, radius, shadows } from '../ui/theme'
import type { WorkspaceRoom } from './useWorkspaceData'

function RoomRow({
  item,
  isLast,
  active,
  onOpen,
  onJoin,
}: {
  item: WorkspaceRoom
  isLast: boolean
  active: boolean
  onOpen: () => void
  onJoin: () => void
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.roomRow,
        !isLast && styles.roomRowBorder,
        active && styles.roomRowActive,
        pressed && styles.pressed,
      ]}
      onPress={item.joined ? onOpen : onJoin}
      accessibilityRole="button"
      accessibilityLabel={`${item.name} ${item.joined ? '열기' : '입장'}`}
    >
      <View style={[styles.roomIcon, item.hasPassword && styles.roomIconLock]}>
        {item.hasPassword ? (
          <Text style={styles.roomIconLockText}>🔒</Text>
        ) : (
          <Text style={styles.roomIconHash}>#</Text>
        )}
      </View>
      <View style={styles.roomRowInfo}>
        <Text style={styles.roomRowName} numberOfLines={1}>{item.name}</Text>
        {!item.joined && <Text style={styles.roomRowSub}>아직 입장하지 않은 방</Text>}
      </View>
      {item.joined && item.unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>
            {item.unreadCount > 99 ? '99+' : String(item.unreadCount)}
          </Text>
        </View>
      )}
      {!item.joined && (
        <View style={styles.joinBtn}>
          <Text style={styles.joinBtnText}>입장</Text>
        </View>
      )}
    </Pressable>
  )
}

interface RoomListPaneProps {
  rooms: WorkspaceRoom[]
  loading: boolean
  onOpenRoom: (roomId: string) => void
  onJoinRoom: (roomId: string) => void
  onCreateRoom: () => void
  canCreateRoom: boolean
  activeRoomId?: string
}

export function RoomListPane({
  rooms,
  loading,
  onOpenRoom,
  onJoinRoom,
  onCreateRoom,
  canCreateRoom,
  activeRoomId,
}: RoomListPaneProps) {
  return (
    <View style={styles.container}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>방 {rooms.length}개</Text>
        {canCreateRoom && (
          <Pressable
            onPress={onCreateRoom}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="방 만들기"
          >
            <Text style={styles.sectionAction}>+ 방 만들기</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={styles.loadingIndicator} />
      ) : rooms.length === 0 ? (
        <View style={styles.emptyRooms}>
          <Text style={styles.emptyRoomsText}>
            {canCreateRoom ? '아래에서 첫 번째 방을 만들어보세요.' : '방장이 방을 만들면 여기에 표시됩니다.'}
          </Text>
        </View>
      ) : (
        <View style={styles.roomContainer}>
          {rooms.map((room, index) => (
            <RoomRow
              key={room.id}
              item={room}
              isLast={index === rooms.length - 1}
              active={room.id === activeRoomId}
              onOpen={() => onOpenRoom(room.id)}
              onJoin={() => onJoinRoom(room.id)}
            />
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 10 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  sectionAction: { fontSize: 13, fontWeight: '700', color: colors.primary },

  roomContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  roomRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, paddingHorizontal: 16 },
  roomRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
  roomRowActive: { backgroundColor: '#E7EFFF' },
  roomIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#E7EFFF', alignItems: 'center', justifyContent: 'center',
  },
  roomIconLock: { backgroundColor: '#F2F4F6' },
  roomIconHash: { fontSize: 16, fontWeight: '800', color: colors.primary },
  roomIconLockText: { fontSize: 14 },
  roomRowInfo: { flex: 1, gap: 2 },
  roomRowName: { fontSize: 15, fontWeight: '700', color: colors.text },
  roomRowSub: { fontSize: 12, color: colors.textSecondary },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary,
    paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
  },
  unreadBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  joinBtn: {
    height: 32, paddingHorizontal: 16, borderRadius: 12,
    backgroundColor: '#E7EFFF', alignItems: 'center', justifyContent: 'center',
  },
  joinBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },

  loadingIndicator: { marginTop: 20 },
  emptyRooms: { paddingVertical: 20, paddingHorizontal: 4 },
  emptyRoomsText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },

  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
})
