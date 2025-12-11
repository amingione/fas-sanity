export interface Address {
  street1: string
  street2?: string
  city: string
  state: string
  postalCode: string
  country: string
}

export interface Parcel {
  weight: number
  length?: number
  width?: number
  height?: number
}

export interface Rate {
  id: string
  carrier: string
  service: string
  rate: string
  delivery_days: number | null
  delivery_date: string | null
}

export interface Shipment {
  _id: string
  _type: 'shipment'
  easypostId: string
  createdAt: string
  status: string
  trackingCode?: string
  carrier?: string
  service?: string
  rate?: number
  transitDays?: number
  recipient?: string
  labelUrl?: string
  details?: string
}

export interface Pickup {
  _id: string
  _type: 'pickup'
  easypostId?: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'canceled'
  confirmation?: string
  carrier: string
  reference?: string[]
  pickupWindowStart: string
  pickupWindowEnd: string
  pickupAddress: {
    _type: 'reference'
    _ref: string
  }
  details?: string
}

export interface SenderAddress {
  _id: string
  _type: 'senderAddress'
  nickname: string
  isDefaultSender?: boolean
  isDefaultReturn?: boolean
  verified?: boolean
  street1: string
  street2?: string
  city: string
  state: string
  postalCode: string
  country: string
  phone?: string
  email?: string
}
