import { ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { colors } from './theme'

// 승인된 목업(design/mockups/styles.css body)과 같은 회색 방사 그라데이션.
const WALLPAPER_CSS = `
html, body {
  min-height: 100%;
  background-color: #F2F2F2;
  background-image:
    radial-gradient(ellipse 78% 52% at 18% 22%, rgba(74, 74, 74, 0.38), transparent 68%),
    radial-gradient(ellipse 70% 48% at 88% 18%, rgba(26, 26, 26, 0.18), transparent 64%),
    radial-gradient(ellipse 84% 56% at 62% 78%, rgba(74, 74, 74, 0.32), transparent 70%),
    radial-gradient(ellipse 50% 40% at 40% 48%, rgba(26, 26, 26, 0.12), transparent 62%);
  background-attachment: fixed;
}
#root { background-color: transparent !important; }
#app-wallpaper {
  background-color: #F2F2F2 !important;
  background-image:
    radial-gradient(ellipse 78% 52% at 18% 22%, rgba(74, 74, 74, 0.38), transparent 68%),
    radial-gradient(ellipse 70% 48% at 88% 18%, rgba(26, 26, 26, 0.18), transparent 64%),
    radial-gradient(ellipse 84% 56% at 62% 78%, rgba(74, 74, 74, 0.32), transparent 70%),
    radial-gradient(ellipse 50% 40% at 40% 48%, rgba(26, 26, 26, 0.12), transparent 62%) !important;
  background-attachment: fixed;
}
[data-glass="text"] {
  background-color: rgba(255, 255, 255, 0.70) !important;
  -webkit-backdrop-filter: blur(48px) saturate(1.85) !important;
  backdrop-filter: blur(48px) saturate(1.85) !important;
}
[data-glass="chrome"] {
  background-color: rgba(255, 255, 255, 0.42) !important;
  -webkit-backdrop-filter: blur(36px) saturate(1.7) !important;
  backdrop-filter: blur(36px) saturate(1.7) !important;
}
[data-glass="nested"] {
  background-color: rgba(255, 255, 255, 0.38) !important;
  -webkit-backdrop-filter: blur(48px) saturate(1.85) !important;
  backdrop-filter: blur(48px) saturate(1.85) !important;
}
`

function installWallpaperCss() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return
  const id = 'clubchat-glass-css'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = WALLPAPER_CSS
  document.head.appendChild(style)
}

function NativeBlobs() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <RadialGradient id="b1" cx="18%" cy="22%" rx="78%" ry="52%">
          <Stop offset="0%" stopColor="#4A4A4A" stopOpacity={0.38} />
          <Stop offset="68%" stopColor="#4A4A4A" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="b2" cx="88%" cy="18%" rx="70%" ry="48%">
          <Stop offset="0%" stopColor="#1A1A1A" stopOpacity={0.18} />
          <Stop offset="64%" stopColor="#1A1A1A" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="b3" cx="62%" cy="78%" rx="84%" ry="56%">
          <Stop offset="0%" stopColor="#4A4A4A" stopOpacity={0.32} />
          <Stop offset="70%" stopColor="#4A4A4A" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="b4" cx="40%" cy="48%" rx="50%" ry="40%">
          <Stop offset="0%" stopColor="#1A1A1A" stopOpacity={0.12} />
          <Stop offset="62%" stopColor="#1A1A1A" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#b1)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#b2)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#b3)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#b4)" />
    </Svg>
  )
}

export function AppWallpaper({ children }: { children: ReactNode }) {
  installWallpaperCss()

  return (
    <View nativeID="app-wallpaper" style={styles.root}>
      {Platform.OS === 'web' ? null : (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <NativeBlobs />
        </View>
      )}
      <View style={styles.content}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.wallpaper },
  content: { flex: 1, backgroundColor: 'transparent' },
})
