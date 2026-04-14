`★ Insight ─────────────────────────────────────` This is a fundamentally sound architectural move. dotenvx works by encrypting your `.env` file with a public key, committing the encrypted file to the repo, and decrypting at runtime using a private key (`DOTENV_KEY`) injected as a single env var per host. The mental model shift: **secrets become a code artifact** (versioned, diffable, PR-reviewable) instead of a parallel config system nobody can see.

The tradeoff worth knowing: the `.env.keys` file becomes your new crown jewel — it holds the private key that decrypts everything. If that leaks, all secrets are exposed. But it's also one file to back up, rotate, and protect instead of 50+ scattered vars. `─────────────────────────────────────────────────`

Before you commit, a few things to reason through:

**What you gain:**

- One `DOTENV_KEY` per host per environment instead of 50+ vars in each dashboard
- Secret changes become a `git commit` + `push` → auto-redeploy (no manual dashboard editing)
- The encrypted `.env.production` files in each repo ARE the source of truth — your `~/.local_secrets/Deployed/` folder becomes unnecessary
- Discrepancies like the ones we just fixed become impossible — there's one file, one key, no drift

**What to plan for:**

1. **Per-environment keys** — dotenvx generates a different `DOTENV_KEY` per `.env` file. So each repo gets: one key for production, one for development/preview. That's 8 keys total across 4 repos × 2 envs. Still a massive reduction from 200+ individual vars.
    
2. **Build command changes per host:**
    

|Repo|Host|Current build|New build|
|---|---|---|---|
|fas-cms-fresh|Netlify| `astro build` | `dotenvx run -- astro build` |
|fas-sanity|Netlify| `sanity build` | `dotenvx run -- sanity build` |
|fas-dash|Vercel| `next build` | `dotenvx run -- next build` |
|fas-medusa|Railway| `node dist/main.js` | `dotenvx run -- node dist/main.js` |

3. **Public vars in Astro (fas-cms-fresh)** — anything prefixed `PUBLIC_` gets baked into the client bundle at build time. dotenvx handles this correctly as long as you run it before `astro build`, which the command above does.
    
4. **Railway caveat** — Railway injects env vars at the process level natively. dotenvx works fine alongside it, but you'd want to remove the native Railway vars once you've confirmed the encrypted file is working, not before.
    

---

**Proposed execution plan:**

```
Phase 1 — Set up dotenvx in each repo
  1. npm install @dotenvx/dotenvx -D in all 4 repos
  2. For each repo: dotenvx encrypt -f .env.production
     → creates .env.production (encrypted in place) + .env.keys
  3. Add .env.keys to .gitignore (NEVER commit this)
  4. Back up .env.keys to ~/.local_secrets/ (replaces the Deployed/ docs)
  5. Commit encrypted .env.production files

Phase 2 — Update build commands on hosts
  6. Netlify: update build command for fas-cms-fresh and fas-sanity
  7. Vercel: update build command for fas-dash
  8. Railway: update start command for fas-medusa

Phase 3 — Set single DOTENV_KEY per host
  9. Add DOTENV_KEY to each host dashboard (one var per environment)
  10. Trigger test deploys

Phase 4 — Strip old vars
  11. Confirm deploys are healthy
  12. Bulk-delete old individual env vars from all 4 hosts
```

Want me to start Phase 1 on a single repo first to validate the pattern before rolling it across all four? I'd suggest **fas-sanity** since it was the one with the most discrepancies — it's the most meaningful test case.