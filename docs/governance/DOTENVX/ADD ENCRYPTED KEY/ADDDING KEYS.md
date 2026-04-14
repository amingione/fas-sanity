---
sticker: emoji//1f511
---
## Adding More Keys

To add new keys to your encrypted .env file, use the ** `dotenvx set` ** command:

```bash
dotenvx set KEY_NAME "value"
```

**Examples:**
```bash
dotenvx set DATABASE_URL "postgres://user:pass@localhost/db"
dotenvx set API_KEY "your-secret-key"
dotenvx set FEATURE_FLAG true
```


For values with special characters:
```bash
dotenvx set KEY -- "- + * ÷"
```

[For plain (unencrypted) values:](obsidian://open?vault=F.A.S.%20Motorsports%20LLC&file=Terminal%2FDOTENVX%2FADDING%20PLAIN%20KEYS)
```bash
dotenvx set KEY value --plain
```


---
# 1. Set it correctly in .env.production
`dotenvx set PUBLIC_SANITY_PROJECT_ID r4og35qd -f .env.production`

# 2. Delete the orphaned .env file dotenvx just created
`rm .env`

# 3. Check .env.keys — if dotenvx added a new DOTENV_PRIVATE_KEY entry for .env,
#    remove that line so your keys file stays clean
`cat .env.keys`











```ad-note 
collapse: open
## Using 2>&1 

---

2>&1 redirects stderr (file descriptor 2) to stdout (file descriptor 1), merging both streams into one output.
The reason I used it: the mcp__Macos__Shell tool only captures and returns stdout. If a command fails and writes its error message to stderr — which most CLI tools do — the result would come back empty and I'd have no idea why it failed.
For example, when dotenvx set SANITY_RECONCILIATION_JOB_DRY_RUN=false failed on the first try (wrong syntax), the error: missing required argument 'value' message was on stderr. Without 2>&1 you'd just see a blank response and a non-zero status code with no context.
In production scripts you'd typically be more deliberate — sometimes you want stderr and stdout separate so you can handle errors differently. But in a diagnostic/interactive context like this, merging them means I always see what went wrong.

```

/
**Simplified explanation of `2>&1`:**

`2>&1` merges error output (stderr) into normal output (stdout) so everything shows together.

**Why I used it:**  
The `mcp__Macos__Shell` tool only grabs stdout. Errors go to stderr by default, so commands fail silently (empty result, no clue why).

**Example:**  
`dotenvx set SANITY_RECONCILIATION_JOB_DRY_RUN=false` errored ("missing argument") on stderr. Without `2>&1`, just blank output + exit code.

**Pro tip:**  
- Production: Keep stderr/stdout separate for targeted error handling.  
- Here (debugging): Merge to always see issues.