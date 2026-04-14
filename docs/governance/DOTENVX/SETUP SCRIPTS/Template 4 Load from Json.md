---
sticker: emoji//1f511
---
## Option 4: Load from JSON File

bash

```bash
#!/bin/bash

# Create vars.json
cat > vars.json << 'EOF'
{
  "DATABASE_URL": "postgres://user:password@localhost:5432/dbname",
  "API_KEY": "your-api-key",
  "JWT_SECRET": "your-jwt-secret",
  "NODE_ENV": "production",
  "STRIPE_KEY": "sk_test_xyz123"
}
EOF

# Parse JSON and set variables
cat vars.json | jq -r 'to_entries[] | "\(.key)=\(.value)"' | while IFS='=' read -r key value; do
  dotenvx set "$key" "$value"
  echo "✓ Set $key"
done

echo ""
echo "All variables set and encrypted!"
```

---

## My Recommendation

**Use Option 2** (Create .env then encrypt) - it's:

- ✅ Fastest
- ✅ Cleanest
- ✅ Easiest to manage
- ✅ All variables encrypted at once

Just edit the `.env` content with your actual values and run the script! 🚀