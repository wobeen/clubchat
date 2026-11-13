import { ReactNode, useEffect } from 'react'
import { Platform, StyleSheet, View, ViewStyle } from 'react-native'
import { colors } from './theme'

const WEB_CSS = `
@font-face {
  font-family: Pretendard;
  font-weight: 400;
  src: url("/design/mockups/fonts/Pretendard-Regular.woff2") format("woff2");
}
@font-face {
  font-family: Pretendard;
  font-weight: 500;
  src: url("/design/mockups/fonts/Pretendard-Medium.woff2") format("woff2");
}
@font-face {
  font-family: Pretendard;
  font-weight: 600;
  src: url("/design/mockups/fonts/Pretendard-SemiBold.woff2") format("woff2");
}
@font-face {
  font-family: Pretendard;
  font-weight: 700;
  src: url("/design/mockups/fonts/Pretendard-Bold.woff2") format("woff2");
}
html, body, #root {
  height: 100%;
  background: #F2F2F2;
  font-family: Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
}
`

export function AppWallpaper({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    const id = 'clubchat-glass-css'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = WEB_CSS
    document.head.appendChild(style)
  }, [])

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.blobs}>
        <View style={[styles.blob, styles.b1]} />
        <View style={[styles.blob, styles.b2]} />
        <View style={[styles.blob, styles.b3]} />
        <View style={[styles.blob, styles.b4]} />
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.wallpaper },
  content: { flex: 1 },
  blobs: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  blob: {
    position: 'absolute',
    borderRadius: 9999,
    ...(Platform.OS === 'web' ? ({ filter: 'blur(80px)' } as ViewStyle) : null),
  },
  b1: { width: '78%', height: '52%', left: '-8%', top: '-6%', backgroundColor: 'rgba(74,74,74,0.38)' },
  b2: { width: '70%', height: '48%', right: '-12%', top: '-4%', backgroundColor: 'rgba(26,26,26,0.18)' },
  b3: { width: '84%', height: '56%', left: '12%', bottom: '-8%', backgroundColor: 'rgba(74,74,74,0.32)' },
  b4: { width: '50%', height: '40%', left: '18%', top: '28%', backgroundColor: 'rgba(26,26,26,0.12)' },
})
