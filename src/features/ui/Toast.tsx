import { useEffect, useRef } from 'react'
import { Animated, Platform, StyleSheet, Text } from 'react-native'

interface ToastProps {
  message: string
  visible: boolean
  duration?: number
  onHide?: () => void
}

export function Toast({ message, visible, duration = 2000, onHide }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!visible) return
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(duration),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => onHide?.())
  }, [visible, message])

  if (!visible) return null

  return (
    <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none">
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  )
}

// ── 훅: 간단하게 사용하기 위한 헬퍼 ──────────────────────────────────────────

import { useState } from 'react'

export function useToast() {
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null)

  function show(message: string) {
    setToast({ message, key: Date.now() })
  }

  function ToastComponent() {
    if (!toast) return null
    return (
      <Toast
        key={toast.key}
        message={toast.message}
        visible
        onHide={() => setToast(null)}
      />
    )
  }

  return { show, ToastComponent }
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 48 : 32,
    alignSelf: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.88)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 99,
    maxWidth: 320,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 4px 16px rgba(0,0,0,0.2)' } as object)
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 8,
        }),
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
})
