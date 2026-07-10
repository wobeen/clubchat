import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera'
import { useRouter } from 'expo-router'
import { parseInviteToken } from '../../src/features/deeplink/parseInviteLink'
import { useToast } from '../../src/features/ui/Toast'

export default function ScanScreen() {
  const router = useRouter()
  const [permission, requestPermission] = useCameraPermissions()
  const { show: showToast, ToastComponent } = useToast()
  const scannedRef = useRef(false)

  function handleScan({ data }: BarcodeScanningResult) {
    if (scannedRef.current) return

    const token = parseInviteToken(data)
    if (!token) {
      showToast('유효한 초대 QR이 아니에요.')
      return
    }

    scannedRef.current = true
    router.replace({ pathname: '/(app)/join', params: { token } })
  }

  if (!permission) {
    return <View style={styles.centered} />
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>
          QR코드를 스캔하려면 카메라 접근을 허용해주세요.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.permissionButton, pressed && styles.pressedOpacity]}
          onPress={requestPermission}
          accessibilityRole="button"
          accessibilityLabel="카메라 권한 허용"
        >
          <Text style={styles.permissionButtonText}>권한 허용</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ToastComponent />
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleScan}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>초대 QR코드를 프레임 안에 맞춰주세요</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F7F8FA', paddingHorizontal: 32, gap: 16,
  },
  permissionText: { fontSize: 15, color: '#4E5968', textAlign: 'center', lineHeight: 22 },
  permissionButton: {
    height: 48, paddingHorizontal: 28, borderRadius: 12,
    backgroundColor: '#3B7DD8', alignItems: 'center', justifyContent: 'center',
  },
  permissionButtonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  pressedOpacity: { opacity: 0.7 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  frame: {
    width: 240, height: 240, borderRadius: 24,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)',
  },
  hint: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
})
