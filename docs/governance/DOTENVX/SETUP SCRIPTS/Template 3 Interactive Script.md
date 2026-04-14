---
sticker: emoji//1f511
---
## Option 3: Interactive Script (Ask for Values)

bash

```bash
#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Interactive Environment Setup${NC}\n"

# Function to prompt and set variable
set_var() {
  local key=$1
  local prompt=$2
  read -p "${BLUE}${prompt}:${NC} " value
  if [ -n "$value" ]; then
    dotenvx set "$key" "$value"
    echo -e "${GREEN}✓ Set ${key}${NC}"
  fi
}

# Database
echo -e "\n${BLUE}[DATABASE]${NC}"
set_var "DATABASE_URL" "Database URL"
set_var "DB_HOST" "Database Host"
set_var "DB_PORT" "Database Port"
set_var "DB_USER" "Database User"
set_var "DB_PASSWORD" "Database Password"

# API Keys
echo -e "\n${BLUE}[API KEYS]${NC}"
set_var "API_KEY" "API Key"
set_var "STRIPE_KEY" "Stripe Key"

# Auth
echo -e "\n${BLUE}[AUTH]${NC}"
set_var "JWT_SECRET" "JWT Secret"

# App
echo -e "\n${BLUE}[APP CONFIG]${NC}"
set_var "NODE_ENV" "Node Environment (production/development)"
set_var "APP_URL" "App URL"

echo -e "\n${GREEN}Setup complete!${NC}"
```

**Run it:**

bash

```bash
chmod +x setup-env.sh
./setup-env.sh
```
