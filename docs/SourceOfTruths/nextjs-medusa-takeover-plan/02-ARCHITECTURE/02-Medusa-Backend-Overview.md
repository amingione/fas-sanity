#medusaProject #planNextjs 
---

# 🏗 Architecture Overview

```
/medusa-backend     → Medusa server (Node.js)
/backoffice         → Next.js dashboard (App Router)
/postgres           → Database
/redis              → Cache / events
```

Flow:

```
Next.js Dashboard → Medusa Admin API → Postgres
```
