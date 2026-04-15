## Decrypting Your .env File

To decrypt your encrypted .env file, use the ** `dotenvx decrypt` or `dotenvx decrypt -f .env.production` ** command:

```bash
dotenvx decrypt
```

```bash
dotenvx decrypt -f .env.production
```


This will convert your encrypted .env file into a plain .env file that you can read.

**Options:**
- `dotenvx decrypt -f` — Decrypt and overwrite the file
- `dotenvx decrypt -fk` — Decrypt using a specific key file
- `dotenvx decrypt -k` — Decrypt with a specific key
- `dotenvx decrypt --stdout` — Output decrypted content to stdout (without saving)

## The .env.keys File

Your `.env.keys` file contains the private keys needed to decrypt the .env file. This file should be:
- **Kept secure** (don't commit to version control)
- **Shared only with authorized team members** who need to decrypt the secrets
- **Protected** like any other secret

When you use `dotenvx set` to add keys, the encryption automatically happens using your stored keys, and the values are encrypted in your .env file.

**Quick workflow:**
1. Use `dotenvx set KEY value` to add/update encrypted variables
2. Use `dotenvx decrypt` to temporarily view the decrypted values
3. Keep `.env.keys` safe and share it securely with your team
