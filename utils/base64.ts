const BASE64_CHAR_MAP: Record<string, number> = (() => {
  const map: Record<string, number> = {}
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  for (let i = 0; i < chars.length; i += 1) {
    map[chars[i]] = i
  }
  return map
})()

const normalizeBase64 = (input: string): string => {
  if (!input) return ''
  const trimmed = input.trim().replace(/[\r\n\s]+/g, '')
  const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4
  if (padding === 2) return `${normalized}==`
  if (padding === 3) return `${normalized}=`
  if (padding === 1) return `${normalized}===`
  return normalized
}

const decodeWithAtob = (value: string): Uint8Array => {
  if (typeof globalThis.atob !== 'function') {
    throw new Error('atob unavailable')
  }
  const binary = globalThis.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const decodeManually = (value: string): Uint8Array => {
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, '')
  const length = Math.floor((clean.length * 3) / 4)
  const output = new Uint8Array(length)
  let buffer = 0
  let bitsCollected = 0
  let outIndex = 0

  for (const char of clean) {
    if (char === '=') {
      break
    }
    const code = BASE64_CHAR_MAP[char]
    if (code === undefined) {
      continue
    }
    buffer = (buffer << 6) | code
    bitsCollected += 6
    if (bitsCollected >= 8) {
      bitsCollected -= 8
      output[outIndex] = (buffer >> bitsCollected) & 0xff
      outIndex += 1
    }
  }

  return outIndex === output.length ? output : output.slice(0, outIndex)
}

const toArrayBuffer = (view: ArrayBufferView): ArrayBuffer => {
  const out = new Uint8Array(view.byteLength)
  out.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
  return out.buffer
}

export const decodeBase64ToArrayBuffer = (input: string): ArrayBuffer => {
  const normalized = normalizeBase64(input)
  if (!normalized) return new ArrayBuffer(0)

  try {
    const bytes = decodeWithAtob(normalized)
    return toArrayBuffer(bytes)
  } catch {}

  if (typeof Buffer !== 'undefined') {
    const buffer = Buffer.from(normalized, 'base64')
    return toArrayBuffer(buffer)
  }

  const fallback = decodeManually(normalized)
  return toArrayBuffer(fallback)
}
