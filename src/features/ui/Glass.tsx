import { ReactNode } from 'react'
import { Platform, StyleSheet, View, ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { colors, glass, radius, shadows } from './theme'
import { useReducedTransparency } from './useReducedTransparency'

type GlassTone = 'text' | 'chrome' | 'nested'

const TONE = {
  text: { opacity: glass.textOpacity, blur: glass.blur, saturate: glass.saturate, intensity: 90 },
  chrome: { opacity: glass.chromeOpacity, blur: glass.chromeBlur, saturate: glass.chromeSaturate, intensity: 70 },
  nested: { opacity: glass.nestedOpacity, blur: glass.blur, saturate: glass.saturate, intensity: 80 },
} as const

interface GlassSurfaceProps {
  children?: ReactNode
  tone?: GlassTone
  radius?: number
  style?: ViewStyle
  padded?: boolean
}

export function GlassSurface({
  children,
  tone = 'text',
  radius: corner = radius.panel,
  style,
  padded,
}: GlassSurfaceProps) {
  const reduced = useReducedTransparency()
  const spec = TONE[tone]
  const fill = `rgba(255,255,255,${spec.opacity})`
  const webGlass = Platform.OS === 'web' && !reduced
    ? ({
        backdropFilter: `blur(${spec.blur}px) saturate(${spec.saturate})`,
        WebkitBackdropFilter: `blur(${spec.blur}px) saturate(${spec.saturate})`,
      } as ViewStyle)
    : null

  return (
    <View
      style={[
        styles.shell,
        { borderRadius: corner, backgroundColor: fill },
        webGlass,
        shadows.glass,
        padded ? styles.padded : null,
        style,
      ]}
    >
      {Platform.OS !== 'web' && !reduced ? (
        <BlurView intensity={spec.intensity} tint="light" style={StyleSheet.absoluteFill} />
      ) : null}
      <View pointerEvents="none" style={styles.highlight} />
      {children}
    </View>
  )
}

export function GlassPanel(props: GlassSurfaceProps) {
  return <GlassSurface {...props} />
}

const styles = StyleSheet.create({
  shell: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassEdge,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#FFFFFF',
  },
  padded: { padding: 16 },
})
