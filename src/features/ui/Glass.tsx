import { ReactNode } from 'react'
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
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
  style?: StyleProp<ViewStyle>
  padded?: boolean
}

export function webBackdrop(blur: number = glass.blur, saturate: number = glass.saturate): ViewStyle {
  if (Platform.OS !== 'web') return {}
  return {
    backdropFilter: `blur(${blur}px) saturate(${saturate})`,
    WebkitBackdropFilter: `blur(${blur}px) saturate(${saturate})`,
  } as ViewStyle
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
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle
  const { backgroundColor: _ignored, ...restStyle } = flat
  const webGlass = Platform.OS === 'web' && !reduced ? webBackdrop(spec.blur, spec.saturate) : null

  return (
    <View
      nativeID={tone === 'text' ? 'glass-surface' : undefined}
      {...(Platform.OS === 'web'
        ? ({ dataSet: { glass: reduced ? 'solid' : tone } } as object)
        : null)}
      style={[
        styles.shell,
        restStyle,
        { borderRadius: corner, backgroundColor: fill },
        webGlass,
        shadows.glass,
        padded ? styles.padded : null,
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
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: '#FFFFFF',
  },
  padded: { padding: 16 },
})
