import { useState } from 'react'
import { Modal, StyleSheet, Text, View } from 'react-native'
import { Pressable } from './Pressable'

interface ActionSheetOption {
  label: string
  style?: 'default' | 'destructive' | 'cancel'
  onPress?: () => void
}

interface ActionSheetOptions {
  title?: string
  options: ActionSheetOption[]
}

// react-native-web의 Alert.alert()는 no-op이라 웹에서 다중 버튼 액션시트가
// 뜨지 않는다. Modal 기반이라 네이티브/웹 모두 동작한다.
export function useActionSheet() {
  const [sheet, setSheet] = useState<ActionSheetOptions | null>(null)

  function showActionSheet(opts: ActionSheetOptions) {
    setSheet(opts)
  }

  function close() {
    setSheet(null)
  }

  function ActionSheetComponent() {
    if (!sheet) return null
    return (
      <Modal transparent visible animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} animated={false}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} animated={false}>
            {sheet.title && (
              <View style={styles.titleWrap}>
                <Text style={styles.title}>{sheet.title}</Text>
              </View>
            )}
            {sheet.options.map((opt, i) => (
              <Pressable
                key={i}
                onPress={() => { close(); opt.onPress?.() }}
                style={({ pressed }) => [
                  styles.option,
                  (i > 0 || sheet.title) && styles.optionBorder,
                  pressed && styles.optionPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
              >
                <Text
                  style={[
                    styles.optionText,
                    opt.style === 'destructive' && styles.destructiveText,
                    opt.style === 'cancel' && styles.cancelText,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    )
  }

  return { showActionSheet, ActionSheetComponent }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: 12,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
  },
  titleWrap: { paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  title: { fontSize: 13, color: '#8B95A1' },
  option: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EDEFF2' },
  optionPressed: { backgroundColor: '#F7F8FA' },
  optionText: { fontSize: 16, fontWeight: '500', color: '#191F28' },
  destructiveText: { color: '#E5484D' },
  cancelText: { color: '#8B95A1' },
})
