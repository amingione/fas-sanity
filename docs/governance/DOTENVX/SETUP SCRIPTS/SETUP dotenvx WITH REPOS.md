---
sticker: emoji//1f511
---
## Basic Setup

**1. Initialize dotenvx in your repo:**
```bash
dotenvx new
```
This creates `.env` and `.env.keys` files.

**2. Add to .gitignore:**
```bash
# Don't commit your private keys!
.env.keys

# You CAN commit the encrypted .env file
# (it's safe because it's encrypted)
```

So your `.gitignore` should have:
```
.env.keys
.env.local
.env.*.local
node_modules/
```

**3. Commit the encrypted .env:**
```bash
git add .env
git commit -m "Add encrypted environment variables"
git push
```

## Sharing with Team Members

**1. You share the `.env.keys` file securely:**
- Don't commit it to git
- Share via password manager, secure file transfer, or 1 Password/LastPass
- Only share with people who need access

**2. Team members clone the repo:**
```bash
git clone your-repo
```

**3. Team members add the `.env.keys` file:**
```bash
# They receive .env.keys from you and place it in the project root
# Now they can decrypt:
dotenvx decrypt
```

## Workflow Example

```bash
# You: Add a new secret
dotenvx set DATABASE_URL "postgres://user:pass@localhost/db"

# This updates .env (encrypted)
git add .env
git commit -m "Update database URL"
git push

# Team member: Pull changes
git pull

# Team member: Decrypt to see the values
dotenvx decrypt

# Or run with dotenvx
dotenvx run -- npm start  # Automatically loads and uses decrypted env vars
```

## Running Your App

**Option 1: With automatic decryption**
```bash
dotenvx run -- npm start
dotenvx run -- python app.py
dotenvx run -- node server.js
```

**Option 2: Decrypt first, then run**
```bash
dotenvx decrypt
npm start
```

## Key Points

| File | Commit? | Share? |
|------|---------|--------|
| `.env` (encrypted) | ✅ Yes | ✅ Yes (safe) |
| `.env.keys` | ❌ No | 🔒 Securely only |
| `.env.local` | ❌ No | ❌ No |

---

**TL;DR:** Commit encrypted `.env` → Don't commit `.env.keys` → Share keys privately with team → They decrypt locally and run!