import { Pressable, StyleSheet, Text, View } from 'react-native'
import { AttachmentMessage } from './AttachmentMessage'
import { AvatarPlaceholder } from './Avatar'
import { formatTime } from './chatUtils'
import { ChatMessage } from './types'

export function MyMessageBubble({ msg, onLongPress }: { msg: ChatMessage; onLongPress?: () => void }) {
  const hasAttachment = !!msg.attachment && msg.type !== 'text'

  if (msg.deletedAt) {
    return (
      <View style={styles.myRow}>
        <View style={[styles.myBubble, styles.deletedBubble]}>
          <Text style={styles.deletedText}>삭제된 메시지입니다</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.myRow}>
      <Text style={styles.myTime}>{formatTime(msg.createdAt)}</Text>
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={300}
        style={[styles.myBubble, hasAttachment && styles.mediaBubble]}
      >
        {hasAttachment ? (
          <AttachmentMessage fileName={msg.content} attachment={msg.attachment!} tint="blue" />
        ) : (
          <>
            <Text style={styles.myText}>{msg.content}</Text>
            {msg.editedAt && <Text style={styles.editedMark}>(수정됨)</Text>}
          </>
        )}
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
              {msg.editedAt && <Text style={styles.editedMarkOther}>(수정됨)</Text>}
            </>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  myRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 6 },
  myTime: { fontSize: 11, color: '#A9B1BA', marginBottom: 2 },
  myBubble: {
    backgroundColor: '#3B7DD8',
    borderRadius: 18,
    borderTopRightRadius: 4,
    paddingVertical: 11,
    paddingHorizontal: 15,
    maxWidth: '75%',
  },
  myText: { fontSize: 15, color: '#FFFFFF', lineHeight: 22 },
  editedMark: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2, textAlign: 'right' },
  editedMarkOther: { fontSize: 11, color: '#A9B1BA', marginTop: 2 },

  deletedBubble: { backgroundColor: '#F2F4F6', borderWidth: StyleSheet.hairlineWidth, borderColor: '#EDEFF2' },
  deletedText: { fontSize: 14, color: '#A9B1BA', fontStyle: 'italic' },

  otherRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  avatarPressable: { alignSelf: 'flex-start' },
  otherContent: { maxWidth: '75%', gap: 4 },
  senderName: { fontSize: 12, fontWeight: '600', color: '#4E5968' },
  otherTime: { fontSize: 11, fontWeight: '400', color: '#A9B1BA' },
  otherBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderTopLeftRadius: 4,
    paddingVertical: 11,
    paddingHorizontal: 15,
    shadowColor: 'rgba(25,31,40,1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  otherText: { fontSize: 15, color: '#191F28', lineHeight: 22 },

  mediaBubble: { padding: 8 },
})
