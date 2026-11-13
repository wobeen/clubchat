import { ReactNode } from 'react'
import { StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native'
import { Pressable } from './Pressable'
import { colors, radius, type as typeScale } from './theme'

interface ButtonProps {
  label: string
  onPress?: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  disabled?: boolean
  style?: ViewStyle
  children?: ReactNode
}

export function Button({ label, onPress, variant = 'primary', disabled, style }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[
        styles.btn,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        variant === 'ghost' && styles.ghost,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.btnText,
          variant === 'primary' ? styles.primaryText : styles.inkText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function IconButton({
  label,
  onPress,
  children,
}: {
  label: string
  onPress?: () => void
  children: ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.iconBtn}
    >
      {children}
    </Pressable>
  )
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string
  active?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
      {active ? <View style={styles.indicator} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  )
}

export function Badge({ value }: { value: string | number }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{value}</Text>
    </View>
  )
}

export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      {...props}
      style={[styles.input, props.multiline && styles.area, props.style]}
    />
  )
}

export function Toggle({ on }: { on: boolean }) {
  return (
    <View style={[styles.track, on ? styles.trackOn : styles.trackOff]}>
      <View style={[styles.knob, on ? styles.knobOn : styles.knobOff]} />
    </View>
  )
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  secondary: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.14)',
  },
  danger: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  btnText: { fontSize: typeScale.control, fontWeight: '600' },
  primaryText: { color: colors.onAccent },
  inkText: { color: colors.ink },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassEdge,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipOn: { backgroundColor: colors.paper },
  indicator: { width: 3, height: 16, borderRadius: 2, backgroundColor: colors.accent },
  chipText: { fontSize: typeScale.body, fontWeight: '500', color: colors.ink },
  chipTextOn: { fontWeight: '600' },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.onAccent, fontSize: 11, fontWeight: '700' },
  input: {
    height: 36,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    color: colors.ink,
    fontSize: typeScale.body,
  },
  area: { height: undefined, minHeight: 96, borderRadius: 22, paddingVertical: 10, textAlignVertical: 'top' },
  track: { width: 36, height: 22, borderRadius: radius.full, justifyContent: 'center' },
  trackOn: { backgroundColor: colors.accent },
  trackOff: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassEdge },
  knob: { width: 18, height: 18, borderRadius: 9, position: 'absolute', top: 2 },
  knobOn: { right: 2, backgroundColor: colors.paper },
  knobOff: { left: 2, backgroundColor: colors.ink },
})
