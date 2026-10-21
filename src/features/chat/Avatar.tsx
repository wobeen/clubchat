import { StyleSheet, Text, View } from 'react-native'
import { getAvatarColor, getInitials } from './chatUtils'

export function AvatarPlaceholder({ name, emoji, size }: { name: string; emoji?: string | null; size: number }) {
  const circleStyle = { width: size, height: size, borderRadius: size / 2 }
  if (emoji) {
    return (
      <View style={[styles.avatarPlaceholder, circleStyle, { backgroundColor: '#FFF3E0' }]}>
        <Text style={{ fontSize: size * 0.55 }}>{emoji}</Text>
      </View>
    )
  }
  const color = getAvatarColor(name)
  return (
    <View style={[styles.avatarPlaceholder, circleStyle, { backgroundColor: color.bg }]}>
      <Text style={[styles.avatarInitials, { fontSize: size * 0.38, color: color.text }]}>{getInitials(name)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  avatarPlaceholder: {
    backgroundColor: '#6B7684',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    // otherRow는 alignItems:'flex-start'라 아바타가 이름 줄과 나란히 붙는데,
    // 원본 chat.tsx와 동일하게 이름+말풍선 블록과 시각적으로 정렬되도록 내려준다.
    marginTop: 18,
  },
  avatarInitials: { color: '#FFFFFF', fontWeight: '700' },
})
