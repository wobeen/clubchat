import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useAuth } from './src/features/auth/useAuth'
import { LoginScreen } from './src/features/auth/LoginScreen'
import { MainScreen } from './src/features/main/MainScreen'

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

  return (
    <>
      <MainScreen />
      <StatusBar style="dark" />
    </>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
