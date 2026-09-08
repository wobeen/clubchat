// ─── 동아리/방 아바타 ──────────────────────────────────────────────────────────
// 동아리·스터디 아이콘을 그리는 공용 컴포넌트. imageUrl이 없으면(지금은 항상 없다 —
// clubs/channels 테이블에 아직 이미지 컬럼이 없음) color 배경 위에 label(이니셜,
// '#', '🔒' 등)을 그린 배지로 폴백한다.
//
// 나중에 동아리/방에 커스텀 이미지 업로드가 추가되면(예: clubs.avatar_url,
// channels.avatar_url — db-schema 에이전트가 컬럼을 추가한 뒤), 호출부가 그
// URL을 imageUrl로 넘기기만 하면 자동으로 이미지 렌더링으로 전환된다. 이 컴포넌트
// 자체는 바꿀 필요 없다.

import { Image, ImageStyle, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native'

interface EntityAvatarProps {
  label: string
  color: { bg: string; text: string }
  imageUrl?: string | null
  size: number
  radius: number
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
}

export function EntityAvatar({ label, color, imageUrl, size, radius, style, textStyle }: EntityAvatarProps) {
  const box = { width: size, height: size, borderRadius: radius }

  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={[box, style] as StyleProp<ImageStyle>} />
  }

  return (
    <View style={[box, styles.badge, { backgroundColor: color.bg }, style]}>
      <Text style={[styles.text, { color: color.text }, textStyle]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '800' },
})
