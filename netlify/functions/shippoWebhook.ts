export async function handler() {
  return {
    statusCode: 410,
    body: 'Legacy Shippo webhook disabled. Use shippo-webhook proxy.',
  }
}
