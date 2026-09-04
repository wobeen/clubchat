import { Database } from '../../types/supabase'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

export type SenderInfo = Pick<ProfileRow, 'id' | 'display_name' | 'avatar_url'> & {
  avatar_emoji?: string | null
  grade?: string | null
  birth_year?: number | null
  gender?: string | null
}

export interface Attachment {
  id: string
  storagePath: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
}

export interface ChatMessage {
  id: string
  channelId: string
  senderId: string
  content: string
  type: 'text' | 'file' | 'image' | 'system'
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
  sender: SenderInfo
  attachment?: Attachment
}

export type ChatStatus = 'loading' | 'ready' | 'error'
