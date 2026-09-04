import { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../../../src/lib/supabase'
import { ScreenOverlay } from '../../../../src/features/shell'

interface SearchResult {
  id: string
  content: string
  createdAt: string
  senderName: string
}

function formatDatetime(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d)
}

function highlight(text: string, query: string): string {
  // 검색어를 대괄호로 표시 (React Native는 네이티브 HTML 하이라이트 불가)
  return text
}

// Phase 4: 넓은 화면에서는 아래 default export의 ScreenOverlay가 이 컴포넌트를
// 다이얼로그 카드로 감싼다. 컴팩트 화면에서는 기존과 동일한 풀스크린 라우트.
function SearchScreenContent() {
  const { id: channelId } = useLocalSearchParams<{ id: string }>()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<TextInput>(null)

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) { setResults([]); setSearched(false); setError(null); return }

    setLoading(true)
    setSearched(true)
    setError(null)

    const { data, error } = await supabase
      .from('messages')
      .select(
        `id, content, created_at,
         sender:profiles!messages_sender_id_fkey(display_name)`
      )
      .eq('channel_id', channelId)
      .is('deleted_at', null)
      .neq('type', 'system')
      .ilike('content', `%${trimmed}%`)
      .order('created_at', { ascending: false })
      .limit(50)

    setLoading(false)

    if (error) {
      console.error('[search]', error)
      setError('검색 중 오류가 발생했습니다.')
      setResults([])
      return
    }

    setResults(
      (data ?? []).map((row) => ({
        id: row.id,
        content: row.content,
        createdAt: row.created_at,
        senderName: (row.sender as any)?.display_name ?? '알 수 없음',
      }))
    )
  }, [channelId])

  const handleChangeText = useCallback((text: string) => {
    setQuery(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(text), 400)
  }, [doSearch])

  function boldQuery(text: string, q: string) {
    if (!q.trim()) return <Text style={styles.resultContent}>{text}</Text>
    const lower = text.toLowerCase()
    const lq = q.toLowerCase().trim()
    const idx = lower.indexOf(lq)
    if (idx === -1) return <Text style={styles.resultContent}>{text}</Text>
    return (
      <Text style={styles.resultContent}>
        {text.slice(0, idx)}
        <Text style={styles.highlight}>{text.slice(idx, idx + lq.length)}</Text>
        {text.slice(idx + lq.length)}
      </Text>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* 검색 입력창 */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={query}
          onChangeText={handleChangeText}
          placeholder="메시지 검색..."
          placeholderTextColor="#9CA3AF"
          returnKeyType="search"
          onSubmitEditing={() => doSearch(query)}
          autoFocus
          clearButtonMode="while-editing"
          {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
        />
        {query.length > 0 && Platform.OS !== 'ios' && (
          <Pressable
            onPress={() => { setQuery(''); setResults([]); setSearched(false) }}
            accessibilityRole="button"
            accessibilityLabel="검색어 지우기"
          >
            <Text style={styles.clearButton}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* 결과 */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4A90D9" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable
            onPress={() => doSearch(query)}
            accessibilityRole="button"
            accessibilityLabel="다시 시도"
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            searched ? (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>
                  {query.trim() ? `"${query.trim()}"에 대한 결과가 없습니다.` : '검색어를 입력하세요.'}
                </Text>
              </View>
            ) : (
              <View style={styles.centered}>
                <Text style={styles.hintText}>채널 메시지를 검색합니다.</Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <View style={styles.resultItem}>
              <View style={styles.resultMeta}>
                <Text style={styles.resultSender}>{item.senderName}</Text>
                <Text style={styles.resultTime}>{formatDatetime(item.createdAt)}</Text>
              </View>
              {boldQuery(item.content, query)}
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  )
}

export default function SearchScreen() {
  const router = useRouter()

  return (
    <ScreenOverlay title="메시지 검색" onClose={() => router.back()}>
      <SearchScreenContent />
    </ScreenOverlay>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: { fontSize: 16, color: '#9CA3AF' },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  clearButton: { fontSize: 14, color: '#9CA3AF', padding: 4 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  hintText: { fontSize: 14, color: '#CBD5E1', textAlign: 'center' },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F2F4F6',
  },
  retryButtonText: { fontSize: 14, color: '#3B7DD8', fontWeight: '600' },
  listContent: { flexGrow: 1, padding: 12 },
  resultItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  resultMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultSender: { fontSize: 13, fontWeight: '700', color: '#374151' },
  resultTime: { fontSize: 11, color: '#9CA3AF' },
  resultContent: { fontSize: 14, color: '#1A1A1A', lineHeight: 20 },
  highlight: { backgroundColor: '#FEF08A', color: '#1A1A1A', fontWeight: '700' },
  separator: { height: 8 },
})
