import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { supabase } from '../../../src/lib/supabase'
import { useAuth } from '../../../src/features/auth/useAuth'
import { Database } from '../../../src/types/supabase'
import { usePage } from '../../../src/features/wiki/usePage'
import { WikiViewer } from '../../../src/features/wiki/WikiViewer'

type MemberRole = 'owner' | 'admin' | 'member'


interface ChannelItem {
  id: string
  name: string
  type: string
  hasPassword: boolean
  ownerId: string
  createdAt: string
  joined: boolean
}

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; clubName: string; channels: ChannelItem[]; myRole: MemberRole | null }

function PasswordBadge() {
  return (
    <View style={styles.passwordBadge}>
      <Text style={styles.passwordBadgeText}>비밀</Text>
    </View>
  )
}

function ChannelCard({
  item,
  onOpen,
  onJoin,
  onManage,
  unreadCount,
}: {
  item: ChannelItem
  onOpen: () => void
  onJoin: () => void
  onManage?: () => void
  unreadCount: number
}) {
  return (
    <View style={styles.channelCard}>
      <View style={styles.channelInfo}>
        <View style={styles.channelNameRow}>
          <Text style={styles.channelName} numberOfLines={1}>{item.name}</Text>
          {item.hasPassword && <PasswordBadge />}
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {unreadCount > 99 ? '99+' : String(unreadCount)}
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.cardActions}>
        {onManage != null && (
          <Pressable
            onPress={onManage}
            accessibilityRole="button"
            accessibilityLabel={`${item.name} 방 관리`}
            style={({ pressed }) => [styles.manageButton, pressed && styles.pressedOpacity]}
          >
            <Text style={styles.manageButtonText}>관리</Text>
          </Pressable>
        )}
        {item.joined ? (
          <Pressable
            style={({ pressed }) => [styles.openButton, pressed && styles.pressedOpacity]}
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={`${item.name} 채팅 열기`}
          >
            <Text style={styles.openButtonText}>열기</Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.joinButton, pressed && styles.pressedOpacity]}
            onPress={onJoin}
            accessibilityRole="button"
            accessibilityLabel={`${item.name} 방 입장`}
          >
            <Text style={styles.joinButtonText}>입장</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuth()
  const router = useRouter()
  const navigation = useNavigation()
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  const { page: wikiPage, refresh: refreshWiki } = usePage(
    id ? { type: 'club', clubId: id } : { type: 'club', clubId: '' }
  )

  useFocusEffect(
    useCallback(() => {
      if (!session?.user || !id) return

      let cancelled = false

      async function load() {
        if (!session?.user || !id) return
        setState({ status: 'loading' })

        const [membershipResult, clubResult, channelsResult, myChannelsResult] = await Promise.all([
          supabase
            .from('memberships')
            .select('role')
            .eq('club_id', id)
            .eq('user_id', session.user.id)
            .maybeSingle(),
          supabase
            .from('clubs')
            .select('id, name')
            .eq('id', id)
            .single(),
          supabase
            .from('channels')
            .select('id, name, type, is_password_protected, owner_id, created_at')
            .eq('club_id', id)
            .order('created_at', { ascending: true }),
          supabase
            .from('channel_members')
            .select('channel_id')
            .eq('user_id', session.user.id),
        ])

        if (cancelled) return

        if (clubResult.error) {
          console.error('[ClubDetail] club error:', clubResult.error)
          setState({ status: 'error', message: '동아리 정보를 불러오는 중 오류가 발생했습니다.' })
          return
        }

        if (channelsResult.error) {
          console.error('[ClubDetail] channels error:', channelsResult.error)
          setState({ status: 'error', message: '방 목록을 불러오는 중 오류가 발생했습니다.' })
          return
        }

        const clubName = clubResult.data.name
        navigation.setOptions({ title: clubName })

        const joinedIds = new Set(
          (myChannelsResult.data ?? []).map((cm) => cm.channel_id)
        )

        const myRole = membershipResult.data
          ? (membershipResult.data.role as MemberRole)
          : null

        const channels: ChannelItem[] = (channelsResult.data ?? []).map((ch) => ({
          id: ch.id,
          name: ch.name,
          type: ch.type,
          hasPassword: ch.is_password_protected ?? false,
          ownerId: ch.owner_id,
          createdAt: ch.created_at,
          joined: joinedIds.has(ch.id),
        }))

        setState({ status: 'ready', clubName, channels, myRole })

        const channelIdArray = [...joinedIds]
        if (channelIdArray.length > 0) {
          const { data: unreadData } = await (supabase as any).rpc('get_unread_counts', {
            p_channel_ids: channelIdArray,
          })
          const counts: Record<string, number> = {}
          for (const row of (unreadData ?? []) as Array<{ channel_id: string; unread_count: number }>) {
            counts[row.channel_id] = Number(row.unread_count)
          }
          if (!cancelled) setUnreadCounts(counts)
        } else {
          setUnreadCounts({})
        }
      }

      load()

      const rt = supabase
        .channel('unread-badge')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            const row = payload.new as { channel_id: string; sender_id: string }
            if (row.sender_id === session?.user?.id) return
            setUnreadCounts((prev) => ({
              ...prev,
              [row.channel_id]: (prev[row.channel_id] ?? 0) + 1,
            }))
          }
        )
        .subscribe()

      return () => {
        cancelled = true
        supabase.removeChannel(rt)
      }
    }, [id, session?.user?.id])
  )

  function handleOpenChannel(channel: ChannelItem) {
    router.push({
      pathname: '/(app)/channels/[id]/chat',
      params: { id: channel.id, channelName: channel.name },
    })
  }

  function handleJoinChannel(channel: ChannelItem) {
    router.push({
      pathname: '/(app)/channels/[id]/join',
      params: {
        id: channel.id,
        hasPassword: channel.hasPassword ? '1' : '0',
        channelName: channel.name,
      },
    })
  }

  if (state.status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    )
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{state.message}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={() => setState({ status: 'loading' })}
          accessibilityRole="button"
          accessibilityLabel="다시 시도"
        >
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    )
  }

  const { clubName, channels, myRole } = state
  const isOwner = myRole === 'owner'

  return (
    <View style={styles.container}>
      <FlatList
        data={channels}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          channels.length === 0 ? styles.emptyContainer : styles.listContent
        }
        renderItem={({ item }) => (
          <ChannelCard
            item={item}
            onOpen={() => handleOpenChannel(item)}
            onJoin={() => handleJoinChannel(item)}
            onManage={
              item.ownerId === session?.user?.id
                ? () =>
                    router.push({
                      pathname: '/(app)/channels/[id]/manage',
                      params: { id: item.id, channelName: item.name, clubId: id },
                    })
                : undefined
            }
            unreadCount={unreadCounts[item.id] ?? 0}
          />
        )}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>{clubName}</Text>

            {/* 동아리 위키 */}
            <View style={styles.wikiSection}>
              <WikiViewer content={wikiPage?.content ?? ''} />
            </View>

            <Text style={styles.listHeaderSubtitle}>방 목록</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>아직 방이 없어요</Text>
            <Text style={styles.emptySubtitle}>
              {isOwner
                ? '아래 버튼을 눌러 첫 번째 방을 만들어보세요.'
                : '방장이 방을 만들면 여기에 표시됩니다.'}
            </Text>
          </View>
        }
      />

      {isOwner && (
        <View style={styles.fab}>
          <Pressable
            style={({ pressed }) => [styles.fabButton, pressed && styles.pressedOpacity]}
            onPress={() =>
              router.push({
                pathname: '/(app)/channels/create',
                params: { clubId: id, clubName },
              })
            }
            accessibilityRole="button"
            accessibilityLabel="방 만들기"
          >
            <Text style={styles.fabText}>+ 방 만들기</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 24,
  },
  listContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
  },
  listHeader: {
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  listHeaderTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  wikiSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  listHeaderSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
    marginBottom: 4,
  },
  channelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  channelInfo: {
    flex: 1,
  },
  channelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  channelName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  passwordBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  passwordBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
  },
  unreadBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manageButton: {
    height: 36,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  manageButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  openButton: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  openButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  joinButton: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  joinButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A90D9',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 20,
  },
  fabButton: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4A90D9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  fabText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  errorText: {
    fontSize: 15,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#4A90D9',
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pressedOpacity: {
    opacity: 0.6,
  },
})
