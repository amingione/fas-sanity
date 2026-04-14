---
sticker: emoji//1f511
---

## Option 1: Run Multiple `set` Commands

```bash
dotenvx set KEY1 "value1"
dotenvx set KEY2 "value2"
dotenvx set KEY3 "value3"
dotenvx set DATABASE_URL "postgres://localhost/db"
dotenvx set API_KEY "secret-key-123"
```

## Option 2: Batch with a Script

**Create a `setup.sh` file:**
```bash
#!/bin/bash

dotenvx set DATABASE_URL "postgres://user:pass@localhost/db"
dotenvx set API_KEY "your-api-key"
dotenvx set JWT_SECRET "your-jwt-secret"
dotenvx set STRIPE_KEY "sk_test_xyz"
dotenvx set LOG_LEVEL "debug"
dotenvx set NODE_ENV "production"
```

**Run it:**
```bash
bash setup.sh
```

## Option 3: From a File (Pipe Input)

**Create a `.env.example` or `vars.txt`:**
```
DATABASE_URL=postgres://user:pass@localhost/db
API_KEY=your-api-key
JWT_SECRET=your-jwt-secret
STRIPE_KEY=sk_test_xyz
LOG_LEVEL=debug
NODE_ENV=production
```

**Parse and set all at once:**
```bash
while IFS='=' read -r key value; do
  [ -z "$key" ] && continue  # Skip empty lines
  dotenvx set "$key" "$value"
done < vars.txt
```

## Option 4: One-Liner with Multiple Sets

```bash
dotenvx set DATABASE_URL "postgres://localhost" && \
dotenvx set API_KEY "secret" && \
dotenvx set NODE_ENV "production"
```

## Option 5: Edit `.env` Directly (Then Encrypt)

**1. Create `.env` with all your variables:**
```
DATABASE_URL=postgres://user:pass@localhost/db
API_KEY=your-api-key
JWT_SECRET=your-jwt-secret
STRIPE_KEY=sk_test_xyz
LOG_LEVEL=debug
NODE_ENV=production
```

**2. Encrypt it all at once:**
```bash
dotenvx encrypt
```

This encrypts the entire `.env` file in one go!

---

## Quickest Method: Script + Encrypt

```bash
# 1. Create .env with all variables
cat > .env << 'EOF'
DATABASE_URL=postgres://user:pass@localhost/db
API_KEY=your-api-key
JWT_SECRET=your-jwt-secret
STRIPE_KEY=sk_test_xyz
LOG_LEVEL=debug
NODE_ENV=production
EOF

# 2. Encrypt everything
dotenvx encrypt
```

**Done!** All keys encrypted in seconds. 🚀