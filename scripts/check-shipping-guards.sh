#!/bin/sh
set -eu

config_path="tools/ai-governance/guards/stripe-parcelcraft-shipping.json"

if [ ! -f "$config_path" ]; then
  echo "Missing guard config: $config_path"
  exit 1
fi

node tools/ai-governance/scripts/check-stripe-shipping.js \
  --config "$config_path" \
  --repo "$(pwd)"
