// ─── 공용 애니메이션 Pressable ─────────────────────────────────────────────────
// react-native의 Pressable을 대체하는 드롭인 컴포넌트. 기존 호출부의
// `style={({ pressed }) => [...]}` 콜백은 그대로 동작하며(hovered 필드만 추가),
// 그 위에 다음을 자동으로 얹는다:
//  - 누르는 동안: 살짝 축소 + 투명도 감소(스프링이 아닌 timing으로 즉시 반응하되 부드럽게)
//  - 웹에서 마우스 호버: 누른 것과 같은 방향으로 더 약하게 축소/감소
// 레이아웃에는 영향이 없다(transform/opacity는 자식의 flex 배치를 바꾸지 않으므로
// 기존 Pressable을 감싸는 추가 View 없이 같은 노드에 그대로 적용).

import { useRef, useState } from 'react'
import {
  Animated,
  GestureResponderEvent,
  Platform,
  Pressable as RNPressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native'

type PressState = { pressed: boolean; hovered: boolean }

interface AnimatedPressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | ((state: PressState) => StyleProp<ViewStyle>)
  // 누르는 동안의 목표 스케일(기본 0.96 — 손으로 누르는 효과)
  scaleTo?: number
  // 웹에서 마우스를 올렸을 때의 목표 스케일(기본 0.985 — press보다 약한 예고 효과)
  hoverScaleTo?: number
  // 모달 배경(backdrop)이나 탭 전파 차단용 래퍼처럼 "버튼"이 아니라 화면 전체/큰 영역을
  // 덮는 Pressable에는 false로 꺼서 스케일·투명도 애니메이션이 붙지 않게 한다.
  animated?: boolean
}

const AnimatedPressableBase = Animated.createAnimatedComponent(RNPressable)

export function Pressable({
  style,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  scaleTo = 0.96,
  hoverScaleTo = 0.985,
  disabled,
  animated = true,
  ...rest
}: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current
  const [pressed, setPressed] = useState(false)
  const [hovered, setHovered] = useState(false)

  const opacity = scale.interpolate({
    inputRange: [scaleTo, hoverScaleTo, 1],
    outputRange: [0.82, 0.93, 1],
    extrapolate: 'clamp',
  })

  function animateTo(value: number) {
    if (!animated) return
    Animated.timing(scale, {
      toValue: value,
      duration: 120,
      useNativeDriver: Platform.OS !== 'web',
    }).start()
  }

  const resolvedStyle = typeof style === 'function' ? style({ pressed, hovered }) : style

  return (
    <AnimatedPressableBase
      disabled={disabled}
      style={animated ? [resolvedStyle, { transform: [{ scale }], opacity }] : resolvedStyle}
      onPressIn={(e: GestureResponderEvent) => {
        setPressed(true)
        animateTo(scaleTo)
        onPressIn?.(e)
      }}
      onPressOut={(e: GestureResponderEvent) => {
        setPressed(false)
        animateTo(hovered ? hoverScaleTo : 1)
        onPressOut?.(e)
      }}
      onHoverIn={(e: any) => {
        setHovered(true)
        if (!disabled) animateTo(hoverScaleTo)
        onHoverIn?.(e)
      }}
      onHoverOut={(e: any) => {
        setHovered(false)
        animateTo(1)
        onHoverOut?.(e)
      }}
      {...rest}
    />
  )
}
