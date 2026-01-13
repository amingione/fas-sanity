#!/bin/sh
set -eu

fail=0

allowed_write_surfaces="
netlify/functions/createCheckoutSession.ts
netlify/functions/getShippingQuoteBySkus.ts
netlify/functions/createCheckout.ts
netlify/functions/resendInvoiceEmail.ts
"

legacy_readonly_surfaces="
netlify/lib/fulfillmentFromMetadata.ts
netlify/functions/stripeWebhook.ts
netlify/functions/backfillOrders.ts
"

ignored_surfaces="
packages/sanity-config/src/utils/cartItemDetails.ts
"

rg_excludes_from_list() {
  excludes=""
  for path in $1; do
    excludes="$excludes --glob !$path"
  done
  echo "$excludes"
}

allowed_excludes=$(rg_excludes_from_list "$allowed_write_surfaces")
legacy_excludes=$(rg_excludes_from_list "$legacy_readonly_surfaces")
ignored_excludes=$(rg_excludes_from_list "$ignored_surfaces")

collect_paths() {
  paths=""
  for candidate in "$@"; do
    if [ -d "$candidate" ]; then
      paths="$paths $candidate"
    fi
  done
  echo "$paths"
}

storefront_paths=$(collect_paths \
  "fas-cms-fresh/src" \
  "fas-cms-fresh/netlify" \
  "fas-cms-fresh/functions" \
  "fas-cms-fresh/scripts")

if [ -n "$storefront_paths" ]; then
  if rg -n "@easypost/api|EasyPost|easypost" $storefront_paths; then
    echo "Guard fail: EasyPost usage detected in fas-cms-fresh."
    fail=1
  fi
  if rg -n "shipping_rate_data|shipping_options" $storefront_paths; then
    echo "Guard fail: Stripe Checkout shipping options present in fas-cms-fresh."
    fail=1
  fi
  if rg -n "\\$0\\.00|free shipping|amount_shipping\\s*:\\s*0" $storefront_paths; then
    echo "Guard fail: placeholder shipping rate detected in fas-cms-fresh."
    fail=1
  fi
fi

sanity_paths=$(collect_paths \
  "packages" \
  "src" \
  "netlify" \
  "functions")

if [ -n "$sanity_paths" ]; then
  if rg -n "Parcelcraft|parcelcraft_" $allowed_excludes $legacy_excludes $sanity_paths; then
    echo "Guard fail: Parcelcraft referenced in fas-sanity."
    fail=1
  fi
  if rg -n "stripe\\.checkout\\.sessions\\.create" $allowed_excludes $sanity_paths; then
    echo "Guard fail: Stripe Checkout sessions created in fas-sanity."
    fail=1
  fi
  if rg -n "shipping_rate_data|shipping_options" \
    $allowed_excludes $legacy_excludes $ignored_excludes $sanity_paths; then
    echo "Guard fail: Stripe Checkout shipping config in fas-sanity."
    fail=1
  fi
fi

if [ "$fail" -ne 0 ]; then
  exit 1
fi
