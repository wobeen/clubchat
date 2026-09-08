import { useMemo } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { MyMessageBubble, OtherMessageBubble } from './MessageBubble'
import { ChatMessage, SenderInfo } from './types'

interface Props {
  messages: ChatMessage[]
  currentUserId: string
  onLongPressMessage: (msg: ChatMessage) => void
  onAvatarPress: (sender: SenderInfo) => void
  typingUsers: { userId: string; name: string }[]
}

export function ChatMessageList({ messages, currentUserId, onLongPressMessage, onAvatarPress, typingUsers }: Props) {
  // 리스트를 inverted로 렌더링(최신 메시지가 항상 하단에 고정)하기 위해 역순으로 뒤집는다.
  // 이렇게 하면 새 메시지가 와도 스크롤 위치가 자동으로 하단에 붙고, 내가 보낼 때도
  // 수동 scrollToEnd 호출 없이 자연스럽게 반영돼 화면이 튀지 않는다.
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages])

  return (
    <View style={styles.flexOne}>
      <FlatList
        data={invertedMessages}
        inverted
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={[styles.emptyState, styles.invertedFlip]}>
            <Text style={styles.emptyText}>아직 메시지가 없어요. 첫 메시지를 보내보세요!</Text>
          </View>
        }
        renderItem={({ item }) =>
          item.senderId === currentUserId
            ? <MyMessageBubble msg={item} onLongPress={() => onLongPressMessage(item)} />
            : <OtherMessageBubble msg={item} onAvatarPress={() => onAvatarPress(item.sender)} />
        }
      />

      {/* 입력중 표시 */}
      {typingUsers.length > 0 && (
        <View style={styles.typingBar}>
          <Text style={styles.typingText}>
            {typingUsers.map((u) => u.name).join(', ')}님이 입력 중...
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  // inverted 리스트라 top/bottom padding이 시각적으로 뒤바뀐다 (아래쪽 여백 16, 위쪽 여백 8을 만들려면 반대로 지정).
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 14, flexGrow: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  // ListEmptyComponent는 리스트 셀과 달리 자동으로 뒤집히지 않으므로 직접 역상쇄한다.
  invertedFlip: { transform: [{ scaleY: -1 }] },
  emptyText: { fontSize: 14, color: '#5C7A6E', textAlign: 'center' },

  typingBar: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F4F5F6',
  },
  typingText: { fontSize: 12, color: '#A9B1BA', fontStyle: 'italic' },
})
