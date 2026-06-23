import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useAuth } from './src/features/auth/useAuth'
import { LoginScreen } from './src/features/auth/LoginScreen'

export default function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    )
  }

  if (!session) {
    return (
      <>
        <LoginScreen />
        <StatusBar style="dark" />
      </>
    )
  }

  // TODO: 인증 완료 후 메인 네비게이터로 교체
  return (
    <View style={styles.center}>
      <Text style={styles.welcomeText}>로그인됨: {session.user.email}</Text>
      <StatusBar style="dark" />
    </View>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeText: {
    fontSize: 16,
    color: '#374151',
  },
})
