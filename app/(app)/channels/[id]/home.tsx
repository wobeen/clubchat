import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { supabase } from '../../../../src/lib/supabase'
import { useAuth } from '../../../../src/features/auth/useAuth'
import { usePage } from '../../../../src/features/wiki/usePage'
import { WikiViewer } from '../../../../src/features/wiki/WikiViewer'
import { WikiEditor } from '../../../../src/features/wiki/WikiEditor'

interface ChannelInfo {
  id: string
  name: string
  club_id: string
  owner_id: string
}

type LoadState = 'loading' | 'error' | 'ready'

export default function ChannelHomeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuth()
  const router = useRouter()
  const navigation = useNavigation()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [channel, setChannel] = useState<ChannelInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [wikiEditorOpen, setWikiEditorOpen] = useState(false)

  useFocusEffect(
    useCallback(() => {
      if (!id) return

      let cancelled = false

      async function load() {
        const { data, error } = await supabase
          .from('channels')
          .select('id, name, club_id, owner_id')
          .eq('id', id)
          .single()

        if (cancelled) return

        if (error || !data) {
          setErrorMsg('방 정보를 불러오는 데 실패했습니다.')
          setLoadState('error')
          return
        }

        navigation.setOptions({ title: data.name, headerBackTitle: '뒤로' })
        setChannel(data as ChannelInfo)
        setLoadState('ready')
      }

      load()
      return () => { cancelled = true }
    }, [id])
  )

  const wikiScope = channel
    ? { type: 'room' as const, clubId: channel.club_id, roomId: channel.id }
    : { type: 'room' as const, clubId: '', roomId: '' }
  const { page: wikiPage, refresh: refreshWiki } = usePage(wikiScope)

  const isChannelOwner = !!session?.user && channel?.owner_id === session.user.id

  const handleLeave = useCallback(async () => {
    if (!channel || !session?.user) return
    if (isChannelOwner) {
      Alert.alert('방장은 나갈 수 없습니다', '방장은 이 방에서 나갈 수 없습니다. 방 관리에서 삭제하거나 다른 멤버에게 이관하세요.')
      return
    }
    Alert.alert('방 나가기', '이 방에서 나갈까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '나가기', style: 'destructive', onPress: async () => {
          const { error } = await supabase
            .from('channel_members')
            .delete()
            .eq('channel_id', channel.id)
            .eq('user_id', session.user.id)
          if (error) {
            Alert.alert('오류', '방을 나갈 수 없습니다.')
          } else {
            router.back()
          }
        },
      },
    ])
  }, [channel, session?.user?.id, isChannelOwner, router])

  useEffect(() => {
    if (!channel) return
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={handleLeave}
          style={{ paddingHorizontal: 16, paddingVertical: 8 }}
          accessibilityRole="button"
          accessibilityLabel="방 나가기"
        >
          <Text style={{ color: '#EF4444', fontSize: 14, fontWeight: '500' }}>나가기</Text>
        </Pressable>
      ),
    })
  }, [channel, handleLeave])

  if (loadState === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    )
  }

  if (loadState === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{errorMsg}</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <WikiEditor
        visible={wikiEditorOpen}
        scope={wikiScope}
        existingPage={wikiPage}
        onClose={() => setWikiEditorOpen(false)}
        onSaved={refreshWiki}
      />

      {/* 위키 */}
      <View style={styles.wikiCard}>
        <WikiViewer content={wikiPage?.content ?? ''} />
        {isChannelOwner && (
          <Pressable
            onPress={() => setWikiEditorOpen(true)}
            style={({ pressed }) => [styles.editWikiBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="위키 편집"
          >
            <Text style={styles.editWikiBtnText}>
              {wikiPage ? '편집' : '위키 작성 시작'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* 채팅 / 일정 진입 버튼 */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, styles.chatBtn, pressed && styles.pressed]}
          onPress={() =>
            router.push({
              pathname: '/(app)/channels/[id]/chat',
              params: { id, channelName: channel?.name },
            })
          }
          accessibilityRole="button"
          accessibilityLabel="채팅 열기"
        >
          <Text style={styles.actionBtnText}>💬  채팅</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionBtn, styles.eventBtn, pressed && styles.pressed]}
          onPress={() =>
            router.push({
              pathname: '/(app)/channels/[id]/events/list',
              params: { id, channelName: channel?.name },
            })
          }
          accessibilityRole="button"
          accessibilityLabel="일정 보기"
        >
          <Text style={styles.actionBtnText}>📅  일정</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wikiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBtn: {
    backgroundColor: '#4A90D9',
  },
  eventBtn: {
    backgroundColor: '#6366f1',
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.7,
  },
  editWikiBtn: {
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  editWikiBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  errorText: {
    fontSize: 15,
    color: '#DC2626',
    textAlign: 'center',
  },
})
