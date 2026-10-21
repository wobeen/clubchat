import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Pressable } from '../ui/Pressable'
import { supabase } from '../../lib/supabase'

interface Attachment {
  storagePath: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
}

interface Props {
  fileName: string
  attachment: Attachment
  tint: 'blue' | 'white'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function useSignedUrl(storagePath: string, expiresIn = 3600) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.storage
      .from('attachments')
      .createSignedUrl(storagePath, expiresIn)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err || !data?.signedUrl) { setError(true); return }
        setUrl(data.signedUrl)
      })
    return () => { cancelled = true }
  }, [storagePath, expiresIn])

  return { url, error }
}

function ImageAttachment({ fileName, attachment, tint }: Props) {
  const { url, error } = useSignedUrl(attachment.storagePath)

  const aspectRatio =
    attachment.width && attachment.height ? attachment.width / attachment.height : 1
  const displayWidth = 220
  const displayHeight = Math.round(displayWidth / Math.max(aspectRatio, 0.5))

  if (error) {
    return <Text style={[styles.errorText, tint === 'blue' && styles.errorTextBlue]}>이미지를 불러올 수 없습니다.</Text>
  }

  if (!url) {
    return (
      <View style={[styles.imagePlaceholder, { width: displayWidth, height: Math.min(displayHeight, 300) }]}>
        <ActivityIndicator size="small" color={tint === 'blue' ? '#fff' : '#9CA3AF'} />
      </View>
    )
  }

  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      accessibilityRole="imagebutton"
      accessibilityLabel={fileName}
    >
      <Image
        source={{ uri: url }}
        style={[styles.image, { width: displayWidth, height: Math.min(displayHeight, 300) }]}
        resizeMode="cover"
      />
    </Pressable>
  )
}

function FileAttachment({ fileName, attachment, tint }: Props) {
  const { url, error } = useSignedUrl(attachment.storagePath, 300)
  const textColor = tint === 'blue' ? '#fff' : '#1A1A1A'
  const subColor = tint === 'blue' ? 'rgba(255,255,255,0.7)' : '#9CA3AF'
  const iconBg = tint === 'blue' ? 'rgba(255,255,255,0.2)' : '#F3F4F6'

  const handleOpen = () => {
    if (url) Linking.openURL(url)
  }

  return (
    <Pressable
      style={styles.fileBubble}
      onPress={handleOpen}
      disabled={!url || error}
      accessibilityRole="button"
      accessibilityLabel={`파일 다운로드: ${fileName}`}
    >
      <View style={[styles.fileIcon, { backgroundColor: iconBg }]}>
        <Text style={styles.fileIconText}>📄</Text>
      </View>
      <View style={styles.fileInfo}>
        <Text style={[styles.fileName, { color: textColor }]} numberOfLines={1}>{fileName}</Text>
        <Text style={[styles.fileMeta, { color: subColor }]}>
          {formatBytes(attachment.sizeBytes)}
          {!url && !error ? ' · 로딩 중...' : ''}
          {error ? ' · 불러오기 실패' : ''}
        </Text>
      </View>
    </Pressable>
  )
}

export function AttachmentMessage({ fileName, attachment, tint }: Props) {
  const isImage = attachment.mimeType.startsWith('image/')
  return isImage
    ? <ImageAttachment fileName={fileName} attachment={attachment} tint={tint} />
    : <FileAttachment fileName={fileName} attachment={attachment} tint={tint} />
}

const styles = StyleSheet.create({
  imagePlaceholder: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    borderRadius: 8,
  },
  errorText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  errorTextBlue: {
    color: 'rgba(255,255,255,0.7)',
  },

  fileBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    minWidth: 180,
    maxWidth: 240,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fileIconText: {
    fontSize: 20,
  },
  fileInfo: {
    flex: 1,
    gap: 2,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  fileMeta: {
    fontSize: 11,
  },
})
