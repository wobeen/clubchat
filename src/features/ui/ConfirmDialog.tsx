import { useState } from 'react'
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native'
import { Pressable } from './Pressable'
import { GlassSurface } from './Glass'
import { radius } from './theme'

interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
}

// react-native-web의 Alert.alert()는 아무 동작도 하지 않는 no-op이라
// 웹에서는 확인 팝업이 뜨지 않는다. 네이티브/웹 모두에서 동작하는 Modal 기반 확인창.
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [busy, setBusy] = useState(false)

  function confirm(opts: ConfirmOptions) {
    setOptions(opts)
  }

  function close() {
    if (busy) return
    setOptions(null)
  }

  async function handleConfirm() {
    if (!options || busy) return
    setBusy(true)
    try {
      await options.onConfirm()
    } finally {
      setBusy(false)
      setOptions(null)
    }
  }

  function ConfirmComponent() {
    if (!options) return null
    return (
      <Modal transparent visible animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} animated={false}>
          <Pressable style={styles.cardWrap} onPress={(e) => e.stopPropagation()} animated={false}>
            <GlassSurface tone="text" radius={radius.panel} style={styles.card}>
            <Text style={styles.title}>{options.title}</Text>
            {options.message && <Text style={styles.message}>{options.message}</Text>}
            <View style={styles.actions}>
              <Pressable
                onPress={close}
                disabled={busy}
                style={({ pressed }) => [styles.btn, styles.cancelBtn, pressed && styles.btnPressed]}
                accessibilityRole="button"
                accessibilityLabel={options.cancelText ?? '취소'}
              >
                <Text style={styles.cancelText}>{options.cancelText ?? '취소'}</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                disabled={busy}
                style={({ pressed }) => [
                  styles.btn,
                  options.destructive ? styles.confirmBtnDestructive : styles.confirmBtn,
                  pressed && styles.btnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={options.confirmText ?? '확인'}
              >
                {busy
                  ? <ActivityIndicator size="small" color={options.destructive ? '#1A1A1A' : '#0863BF'} />
                  : (
                      <Text style={options.destructive ? styles.confirmTextDestructive : styles.confirmText}>
                        {options.confirmText ?? '확인'}
                      </Text>
                    )}
              </Pressable>
            </View>
            </GlassSurface>
          </Pressable>
        </Pressable>
      </Modal>
    )
  }

  return { confirm, ConfirmComponent }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  cardWrap: { width: '100%', maxWidth: 340 },
  card: {
    width: '100%',
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' },
  message: { fontSize: 14, color: '#5A5A5A', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: { opacity: 0.7 },
  cancelBtn: { backgroundColor: '#F4F4F4' },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#5A5A5A' },
  confirmBtn: { backgroundColor: '#0863BF' },
  confirmText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  confirmBtnDestructive: { backgroundColor: '#F4F4F4' },
  confirmTextDestructive: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
})
