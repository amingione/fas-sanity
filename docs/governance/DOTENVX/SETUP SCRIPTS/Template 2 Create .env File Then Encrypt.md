---
sticker: emoji//1f7e9
---
## Option 2: Create .env File Then Encrypt (Faster)

bash

```bash
#!/bin/bash

# Create .env file with all variables
cat > .env << 'EOF'
# Database
DATABASE_URL=postgres://user:password@localhost:5432/dbname
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dbname
DB_USER=user
DB_PASSWORD=password

# API Keys
API_KEY=your-api-key-here
API_SECRET=your-api-secret-here
STRIPE_KEY=sk_test_xyz123
STRIPE_SECRET=sk_test_secret123

# Auth
JWT_SECRET=your-jwt-secret-key-here
JWT_EXPIRE=7d
REFRESH_TOKEN_SECRET=your-refresh-token-secret

# App Config
NODE_ENV=production
APP_NAME=My App
APP_URL=https://myapp.com
LOG_LEVEL=info
PORT=3000

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
MAIL_FROM=noreply@myapp.com

# Third Party
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_SECRET=xxxxx
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Features
ENABLE_ANALYTICS=true
ENABLE_NOTIFICATIONS=true
ENABLE_2FA=true
EOF

echo "✓ .env file created"

# Encrypt everything
dotenvx encrypt

echo "✓ .env file encrypted"
echo "✓ .env.keys created"

# Show encrypted content
echo ""
echo "Encrypted .env preview:"
head -5 .env
```

**Run it:**

bash

```bash
chmod +x setup-env.sh
./setup-env.sh
```


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