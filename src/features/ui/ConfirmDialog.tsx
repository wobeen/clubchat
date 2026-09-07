import { useState } from 'react'
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native'
import { Pressable } from './Pressable'

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
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()} animated={false}>
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
                  ? <ActivityIndicator size="small" color={options.destructive ? '#E5484D' : '#3B7DD8'} />
                  : (
                      <Text style={options.destructive ? styles.confirmTextDestructive : styles.confirmText}>
                        {options.confirmText ?? '확인'}
                      </Text>
                    )}
              </Pressable>
            </View>
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
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#191F28', textAlign: 'center' },
  message: { fontSize: 14, color: '#4E5968', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: { opacity: 0.7 },
  cancelBtn: { backgroundColor: '#F2F4F6' },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#4E5968' },
  confirmBtn: { backgroundColor: '#3B7DD8' },
  confirmText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  confirmBtnDestructive: { backgroundColor: '#FDEBEC' },
  confirmTextDestructive: { fontSize: 15, fontWeight: '600', color: '#E5484D' },
})
