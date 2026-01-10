#!/usr/bin/env bash
set -euo pipefail

# ============================================
# CONFIG
# ============================================
: "${SANITY_BASE_URL:?Set SANITY_BASE_URL (e.g. https://fasmotorsports.com)}"
: "${ORDER_ID:?Set ORDER_ID (Sanity order _id, drafts.* allowed)}"

LABEL_URL="$SANITY_BASE_URL/api/create-shipping-label"

payload="$(cat <<'JSON'
{
  "orderId": "$ORDER_ID"
}
JSON
)"

echo "============================================"
echo "Label Replay Test"
echo "Order ID: $ORDER_ID"
echo "Endpoint: $LABEL_URL"
echo "============================================"
echo

echo "1) First label purchase attempt..."
resp1="$(curl -sS -X POST "$LABEL_URL" \
  -H "Content-Type: application/json" \
  -d "$payload")"

echo "$resp1" | python3 - <<'PY'
import json,sys
d=json.load(sys.stdin)
print("success:", d.get("success"))
print("message:", d.get("message"))
print("trackingNumber:", d.get("trackingNumber"))
print("labelUrl:", d.get("labelUrl"))
print("cost:", d.get("cost"))
print("easyPostShipmentId:", d.get("easyPostShipmentId"))
print("labelTransactionId:", d.get("labelTransactionId"))
PY

sleep 1

echo

echo "2) Second label purchase attempt (replay)..."
resp2="$(curl -sS -X POST "$LABEL_URL" \
  -H "Content-Type: application/json" \
  -d "$payload")"

echo "$resp2" | python3 - <<'PY'
import json,sys
d=json.load(sys.stdin)
print("success:", d.get("success"))
print("message:", d.get("message"))
print("trackingNumber:", d.get("trackingNumber"))
print("labelUrl:", d.get("labelUrl"))
print("cost:", d.get("cost"))
print("easyPostShipmentId:", d.get("easyPostShipmentId"))
print("labelTransactionId:", d.get("labelTransactionId"))
PY

easy_post_id_1="$(echo "$resp1" | python3 - <<'PY'
import json,sys
print(json.load(sys.stdin).get("easyPostShipmentId") or "")
PY
)"
easy_post_id_2="$(echo "$resp2" | python3 - <<'PY'
import json,sys
print(json.load(sys.stdin).get("easyPostShipmentId") or "")
PY
)"
label_transaction_id_1="$(echo "$resp1" | python3 - <<'PY'
import json,sys
print(json.load(sys.stdin).get("labelTransactionId") or "")
PY
)"
label_transaction_id_2="$(echo "$resp2" | python3 - <<'PY'
import json,sys
print(json.load(sys.stdin).get("labelTransactionId") or "")
PY
)"

echo
if [[ -z "$easy_post_id_1" || -z "$easy_post_id_2" ]]; then
  echo "FAIL: Missing easyPostShipmentId in at least one response"
  exit 1
fi

if [[ "$easy_post_id_1" != "$easy_post_id_2" ]]; then
  echo "FAIL: easyPostShipmentId changed between attempts ($easy_post_id_1 vs $easy_post_id_2)"
  exit 1
fi

if [[ -z "$label_transaction_id_1" || -z "$label_transaction_id_2" ]]; then
  echo "FAIL: Missing labelTransactionId in at least one response"
  exit 1
fi

if [[ "$label_transaction_id_1" != "$label_transaction_id_2" ]]; then
  echo "FAIL: labelTransactionId changed between attempts ($label_transaction_id_1 vs $label_transaction_id_2)"
  exit 1
fi

echo
echo "============================================"
echo "Expected Result:"
echo "- Second call returns message: 'Label already purchased'"
echo "- trackingNumber / labelUrl unchanged"
echo "- easyPostShipmentId + labelTransactionId unchanged"
echo "- NO new carrier charge or shipment created"
echo "============================================"
