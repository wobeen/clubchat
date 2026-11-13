import { StyleSheet, Text, View } from 'react-native'
import { Pressable } from '../ui/Pressable'
import { colors, radius } from '../ui/theme'
import { AttachmentMessage } from './AttachmentMessage'
import { AvatarPlaceholder } from './Avatar'
import { formatTime } from './chatUtils'
import { ChatMessage } from './types'

export function MyMessageBubble({ msg, onLongPress }: { msg: ChatMessage; onLongPress?: () => void }) {
  const hasAttachment = !!msg.attachment && msg.type !== 'text'

  if (msg.deletedAt) {
    return (
      <View style={styles.myRow}>
        <View style={styles.deletedBubble}>
          <Text style={styles.deletedText}>삭제된 메시지입니다</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.mineRow}>
      <Pressable onLongPress={onLongPress} delayLongPress={300} style={styles.mineBody}>
        <Text style={styles.senderName}>
          {msg.sender.display_name}
          <Text style={styles.time}>  {formatTime(msg.createdAt)}</Text>
        </Text>
        {hasAttachment ? (
          <AttachmentMessage fileName={msg.content} attachment={msg.attachment!} tint="white" />
        ) : (
          <Text style={styles.bodyText}>{msg.content}</Text>
        )}
        {msg.editedAt ? <Text style={styles.edited}>수정됨</Text> : null}
      </Pressable>
    </View>
  )
}

export function OtherMessageBubble({ msg, onAvatarPress }: { msg: ChatMessage; onAvatarPress?: () => void }) {
  const hasAttachment = !!msg.attachment && msg.type !== 'text'

  if (msg.deletedAt) {
    return (
      <View style={styles.otherRow}>
        <Pressable onPress={onAvatarPress} hitSlop={4}>
          <AvatarPlaceholder name={msg.sender.display_name} emoji={msg.sender.avatar_emoji} size={32} />
        </Pressable>
        <View style={styles.otherContent}>
          <Text style={styles.senderName}>{msg.sender.display_name}</Text>
          <View style={[styles.otherBubble, styles.deletedBubble]}>
            <Text style={styles.deletedText}>삭제된 메시지입니다</Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.otherRow}>
      <Pressable onPress={onAvatarPress} style={styles.avatarPressable} hitSlop={4}>
        <AvatarPlaceholder name={msg.sender.display_name} emoji={msg.sender.avatar_emoji} size={32} />
      </Pressable>
      <View style={styles.otherContent}>
        <Text style={styles.senderName}>
          {msg.sender.display_name}
          <Text style={styles.otherTime}>  {formatTime(msg.createdAt)}</Text>
        </Text>
        <View style={[styles.otherBubble, hasAttachment && styles.mediaBubble]}>
          {hasAttachment ? (
            <AttachmentMessage fileName={msg.content} attachment={msg.attachment!} tint="white" />
          ) : (
            <>
              <Text style={styles.otherText}>{msg.content}</Text>
              {msg.editedAt && <Text style={styles.edited}>(수정됨)</Text>}
            </>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  myRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  mineRow: { borderRadius: 18, backgroundColor: colors.mine, paddingHorizontal: 8, paddingVertical: 6 },
  mineBody: { flex: 1, gap: 2 },
  bodyText: { fontSize: 14, color: colors.ink, lineHeight: 22 },
  edited: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  time: { fontSize: 12, fontWeight: '400', color: colors.textMuted },

  deletedBubble: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg },
  deletedText: { fontSize: 14, color: colors.textMuted, fontStyle: 'italic' },

  otherRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingHorizontal: 8, paddingVertical: 4 },
  avatarPressable: { alignSelf: 'flex-start' },
  otherContent: { flex: 1, gap: 2 },
  senderName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  otherTime: { fontSize: 12, fontWeight: '400', color: colors.textMuted },
  otherBubble: { backgroundColor: 'transparent' },
  otherText: { fontSize: 14, color: colors.ink, lineHeight: 22 },

  mediaBubble: { padding: 8 },
})
