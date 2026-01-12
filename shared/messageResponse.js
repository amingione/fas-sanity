export function getMessageId(response) {
  if (!response) {
    return null
  }
  const data = response.data
  if (data && typeof data === 'object' && data.id != null) {
    return typeof data.id === 'string' ? data.id : String(data.id)
  }
  const id = response.id
  if (id != null) {
    return typeof id === 'string' ? id : String(id)
  }
  return null
}
