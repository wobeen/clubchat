import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Markdown from 'react-native-markdown-display'

interface WikiViewerProps {
  content: string
}

export function WikiViewer({ content }: WikiViewerProps) {
  if (!content.trim()) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>아직 내용이 없습니다.</Text>
      </View>
    )
  }

  return <Markdown style={mdStyles}>{content}</Markdown>
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 14,
  },
})

const mdStyles = StyleSheet.create({
  body: {
    color: '#111827',
    fontSize: 15,
    lineHeight: 24,
  },
  heading1: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  heading2: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 12,
    marginBottom: 6,
  },
  paragraph: {
    marginBottom: 8,
  },
  hr: {
    backgroundColor: '#e5e7eb',
    height: 1,
    marginVertical: 12,
  },
  link: {
    color: '#6366f1',
  },
  bullet_list: {
    marginBottom: 8,
  },
  ordered_list: {
    marginBottom: 8,
  },
  code_inline: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 4,
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  fence: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
})
