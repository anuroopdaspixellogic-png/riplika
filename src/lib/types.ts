export type Gender = 'woman' | 'man' | 'nonbinary' | 'na'
export type LookingFor = 'any' | 'woman' | 'man' | 'nonbinary'

export interface Profile {
  nickname: string
  country: string
  gender: Gender
  lookingFor: LookingFor
  countryPref: string
}

export interface Partner {
  nickname: string
  country: string
  gender: string
}

export interface PublicStats {
  online: number
  searching: number
  chatting: number
  chatsToday: number
}

export interface ChatMessage {
  id: string
  from: 'me' | 'them' | 'system'
  text: string
  ts: number
}

export interface MediaState {
  cam: boolean
  mic: boolean
}

export type Phase = 'setup' | 'searching' | 'matched' | 'idle' | 'lost'
