# ARCHIVED DOCUMENT

This file is superseded by the canonical architecture package:

- docs/governance/checkout-architecture-governance.md
- docs/governance/commerce-authority-checklist.md
- docs/architecture/canonical-commerce-architecture.md

Do not use this file as implementation authority.

---

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
