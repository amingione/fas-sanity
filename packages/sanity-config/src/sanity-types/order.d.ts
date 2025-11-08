export interface Order {
  _id: string
  shippingAddress: {
    name: string
    phone: string
    email: string
    addressLine1: string
    addressLine2?: string
    city: string
    state: string
    postalCode: string
    country: string
  }
  cart: {
    name: string
    price: number
    quantity: number
  }[]
}
