---
aliases:
  - "Template 1: Bash Script (setup-env.sh)"
sticker: emoji//1f511
---
# Script Template for Setting Up Complete .env

## Option 1: Bash Script (setup-env.sh)

bash

```bash
#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Setting up environment variables${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Database
echo -e "${BLUE}[DATABASE]${NC}"
dotenvx set DATABASE_URL "postgres://user:password@localhost:5432/dbname"
dotenvx set DB_HOST "localhost"
dotenvx set DB_PORT "5432"
dotenvx set DB_NAME "dbname"
dotenvx set DB_USER "user"
dotenvx set DB_PASSWORD "password"
echo -e "${GREEN}✓ Database variables set${NC}\n"

# API Keys
echo -e "${BLUE}[API KEYS]${NC}"
dotenvx set API_KEY "your-api-key-here"
dotenvx set API_SECRET "your-api-secret-here"
dotenvx set STRIPE_KEY "sk_test_xyz123"
dotenvx set STRIPE_SECRET "sk_test_secret123"
echo -e "${GREEN}✓ API keys set${NC}\n"

# Auth
echo -e "${BLUE}[AUTH]${NC}"
dotenvx set JWT_SECRET "your-jwt-secret-key-here"
dotenvx set JWT_EXPIRE "7d"
dotenvx set REFRESH_TOKEN_SECRET "your-refresh-token-secret"
echo -e "${GREEN}✓ Auth variables set${NC}\n"

# App Config
echo -e "${BLUE}[APP CONFIG]${NC}"
dotenvx set NODE_ENV "production"
dotenvx set APP_NAME "My App"
dotenvx set APP_URL "https://myapp.com"
dotenvx set LOG_LEVEL "info" --plain
dotenvx set PORT "3000" --plain
echo -e "${GREEN}✓ App config set${NC}\n"

# Email
echo -e "${BLUE}[EMAIL]${NC}"
dotenvx set SMTP_HOST "smtp.gmail.com"
dotenvx set SMTP_PORT "587" --plain
dotenvx set SMTP_USER "your-email@gmail.com"
dotenvx set SMTP_PASSWORD "your-app-password"
dotenvx set MAIL_FROM "noreply@myapp.com"
echo -e "${GREEN}✓ Email variables set${NC}\n"

# Third Party Services
echo -e "${BLUE}[THIRD PARTY]${NC}"
dotenvx set GITHUB_TOKEN "ghp_xxxxxxxxxxxx"
dotenvx set GITHUB_SECRET "xxxxx"
dotenvx set GOOGLE_CLIENT_ID "xxxx.apps.googleusercontent.com"
dotenvx set GOOGLE_CLIENT_SECRET "xxxxx"
dotenvx set AWS_ACCESS_KEY_ID "AKIAIOSFODNN7EXAMPLE"
dotenvx set AWS_SECRET_ACCESS_KEY "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
echo -e "${GREEN}✓ Third party services set${NC}\n"

# Features
echo -e "${BLUE}[FEATURES]${NC}"
dotenvx set ENABLE_ANALYTICS true --plain
dotenvx set ENABLE_NOTIFICATIONS true --plain
dotenvx set ENABLE_2FA true --plain
echo -e "${GREEN}✓ Feature flags set${NC}\n"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}All environment variables set!${NC}"
echo -e "${GREEN}========================================${NC}\n"

# Verify
echo -e "${BLUE}Decrypting to verify...${NC}"
dotenvx decrypt --stdout | head -5
echo "..."
```

**Run it:**

bash

```bash
chmod +x setup-env.sh
./setup-env.sh
```---
aliases:
  - "Template:"
---
