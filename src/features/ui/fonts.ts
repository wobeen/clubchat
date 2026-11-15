import { useEffect } from 'react'
import { Platform, TextStyle } from 'react-native'
import { Asset } from 'expo-asset'
import { useFonts } from 'expo-font'
import { typography } from './theme'

const regular = require('../../../assets/fonts/Pretendard-Regular.ttf')
const medium = require('../../../assets/fonts/Pretendard-Medium.ttf')
const semibold = require('../../../assets/fonts/Pretendard-SemiBold.ttf')
const bold = require('../../../assets/fonts/Pretendard-Bold.ttf')

const WEIGHT_FILE = {
  '400': regular,
  '500': medium,
  '600': semibold,
  '700': bold,
} as const

const NATIVE_FAMILY = {
  '400': typography.regular,
  '500': typography.medium,
  '600': typography.semibold,
  '700': typography.bold,
} as const

export function fontStyle(weight: keyof typeof NATIVE_FAMILY = '400'): TextStyle {
  if (Platform.OS === 'web') {
    return { fontFamily: typography.stack, fontWeight: weight }
  }
  return { fontFamily: NATIVE_FAMILY[weight] }
}

function faceCss(weight: keyof typeof WEIGHT_FILE) {
  const uri = Asset.fromModule(WEIGHT_FILE[weight]).uri
  return `@font-face{font-family:"${typography.family}";font-weight:${weight};font-style:normal;font-display:swap;src:url("${uri}") format("truetype");}`
}

export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    [typography.regular]: regular,
    [typography.medium]: medium,
    [typography.semibold]: semibold,
    [typography.bold]: bold,
    [typography.family]: regular,
  })

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    if (!loaded && !error) return
    const id = 'clubchat-pretendard'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = [
      faceCss('400'),
      faceCss('500'),
      faceCss('600'),
      faceCss('700'),
      `html,body,#root,#root *{font-family:${typography.stack} !important;}`,
    ].join('\n')
    document.head.appendChild(style)
  }, [loaded, error])

  return loaded || !!error
}
