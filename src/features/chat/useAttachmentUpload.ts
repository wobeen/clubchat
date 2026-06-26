import { useState } from 'react'
import { Alert, Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import { supabase } from '../../lib/supabase'

export interface UploadResult {
  storagePath: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  fileName: string
  msgType: 'image' | 'file'
}

// base64 → ArrayBuffer (atob는 Hermes/RN 0.69+ 에서 지원)
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

async function uploadToStorage(
  channelId: string,
  uri: string,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? 'bin'
  const storagePath = `${channelId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  let body: ArrayBuffer | Blob

  if (Platform.OS === 'web') {
    // 웹: fetch로 blob 취득 (blob:/data: URI 모두 지원)
    const response = await fetch(uri)
    body = await response.blob()
  } else {
    // 네이티브: expo-file-system으로 base64 읽기 → ArrayBuffer
    // content:// (Android) / file:// (iOS) 양쪽 지원
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    body = base64ToArrayBuffer(base64)
  }

  const { error } = await supabase.storage
    .from('attachments')
    .upload(storagePath, body, { contentType: mimeType, upsert: false })

  if (error) throw error
  return storagePath
}

export function useAttachmentUpload() {
  const [uploading, setUploading] = useState(false)

  async function pickImage(channelId: string): Promise<UploadResult | null> {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('권한 필요', '사진 라이브러리 접근 권한이 필요합니다.')
        return null
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    })

    if (result.canceled || !result.assets[0]) return null
    const asset = result.assets[0]

    setUploading(true)
    try {
      const fileName = asset.fileName ?? `image_${Date.now()}.jpg`
      const mimeType = asset.mimeType ?? 'image/jpeg'
      const storagePath = await uploadToStorage(channelId, asset.uri, fileName, mimeType)
      return {
        storagePath,
        mimeType,
        sizeBytes: asset.fileSize ?? 0,
        width: asset.width ?? null,
        height: asset.height ?? null,
        fileName,
        msgType: 'image',
      }
    } catch (err: any) {
      Alert.alert('업로드 실패', err?.message ?? '이미지를 업로드할 수 없습니다.')
      return null
    } finally {
      setUploading(false)
    }
  }

  async function pickFile(channelId: string): Promise<UploadResult | null> {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
    if (result.canceled || !result.assets[0]) return null
    const asset = result.assets[0]

    setUploading(true)
    try {
      const mimeType = asset.mimeType ?? 'application/octet-stream'
      const storagePath = await uploadToStorage(channelId, asset.uri, asset.name, mimeType)
      return {
        storagePath,
        mimeType,
        sizeBytes: asset.size ?? 0,
        width: null,
        height: null,
        fileName: asset.name,
        msgType: 'file',
      }
    } catch (err: any) {
      Alert.alert('업로드 실패', err?.message ?? '파일을 업로드할 수 없습니다.')
      return null
    } finally {
      setUploading(false)
    }
  }

  return { uploading, pickImage, pickFile }
}
