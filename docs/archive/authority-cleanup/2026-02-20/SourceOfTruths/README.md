# FAS Motorsports Source of Truth Documentation

**📖 Primary Document:** [System Architecture & API Reference](./System_Architecture_And_API_Reference.md)

---

## Quick Start

**Looking for endpoint/route information?** → Go directly to **[System_Architecture_And_API_Reference.md](./System_Architecture_And_API_Reference.md)**

This is the **single source of truth** containing all 399 endpoints, functions, and routes across the FAS Motorsports system.

---

## Purpose

This directory contains the complete API/route authority mapping for the FAS Motorsports multi-repository system, documenting:
- Every route, API endpoint, webhook, and scheduled function
- Ownership and authority per endpoint
- Cross-repo traffic flow
- External service integrations (Stripe, Shippo, Sanity)

---

## Multi-Repo System

This project spans three interconnected repositories:

### fas-cms-fresh (Astro Storefront)
- **Location:** `/mnt/GitHub/fas-cms-fresh`
- **Purpose:** Public-facing e-commerce storefront
- **Items:** 277 (129 UI routes, 98 API routes, 50 Netlify functions)
- **IDs:** `CMS-UI-*`, `CMS-API-*`, `CMS-NF-*`

### fas-medusa (Medusa v2 Backend)
- **Location:** `/mnt/GitHub/fas-medusa`
- **Purpose:** Commerce backend (products, cart, checkout, orders)
- **Items:** 30 (3 custom routes, 27 core endpoints)
- **IDs:** `MED-STORE-*`, `MED-ADMIN-*`, `MED-WH-*`, `MED-CORE-*`

### fas-sanity (Sanity CMS)
- **Location:** `/mnt/GitHub/fas-sanity`
- **Purpose:** Content management + internal operations
- **Items:** 92 (88 functions, 4 cron jobs)
- **IDs:** `SAN-*-*`, `SAN-CRON-*`

---

## Architecture Principles (Medusa-First)

**Critical:** This system follows a **Medusa-first commerce architecture**:

✅ **Medusa is authoritative for:**
- Products, variants, pricing, inventory
- Cart operations
- Checkout and payment processing
- Orders and fulfillment
- Shipping logic

✅ **Sanity is for:**
- Content and editorial (blog, marketing pages)
- Internal ops mirrors (read-only data copies)
- **NOT** for duplicating commerce logic

✅ **fas-cms-fresh is for:**
- UI rendering
- Consuming Medusa/Sanity APIs
- **NOT** for owning commerce rules

---

## Documentation Files

### Primary Reference
- **[System_Architecture_And_API_Reference.md](./System_Architecture_And_API_Reference.md)** ← **START HERE**
  - Complete inventory of all 399 items
  - Re-indexed with descriptive IDs
  - Architecture principles and authority rules
  - Legacy endpoint identification
  - Cross-repository call graph

### Data Files (Machine-Readable)
- `phase1a-fas-cms-fresh-inventory.json` - fas-cms-fresh data
- `phase1b-fas-medusa-inventory.json` - fas-medusa data
- `phase1c-fas-sanity-inventory.json` - fas-sanity data

### Archive (Historical Reference)
- `archive/` - Original Phase 1 reports and scanner scripts
  - `phase1a-fas-cms-fresh-inventory.md`
  - `phase1b-fas-medusa-inventory.md`
  - `phase1c-fas-sanity-inventory.md`
  - `phase-summary.md`
  - `scripts/` - Scanner and consolidation scripts

---

## Quick Stats

| Repository | Items Discovered | ID Prefix |
|------------|------------------|-----------|
| **fas-cms-fresh** | 277 | CMS-* |
| **fas-medusa** | 30 | MED-* |
| **fas-sanity** | 92 | SAN-* |
| **TOTAL** | **399** | - |

**Key Findings:**
- ✅ Medusa-first architecture validated
- ⚠️ 6 legacy routes identified in fas-cms-fresh (need migration)
- ✅ Clear domain boundaries established
- ✅ Minimal custom code (relies on Medusa core)

---

## Usage

### For Developers
Use the main reference document when:
- Adding new routes/endpoints
- Debugging cross-repo calls
- Understanding which service owns what functionality
- Migrating legacy code
- Finding specific endpoint by ID (e.g., `CMS-API-045`)

### For AI Assistants
Reference this documentation to:
- Determine correct endpoint authority
- Prevent misrouting (calling wrong repo)
- Understand traffic flow
- Generate accurate code that respects system boundaries

### For Code Reviews
Check that new code:
- Respects Medusa-first architecture
- Doesn't duplicate commerce logic in Sanity
- Calls correct authoritative endpoints
- Follows established patterns

---

## ID System

All items use descriptive, unique IDs:

| Prefix | Meaning | Example |
|--------|---------|---------|
| `CMS-UI-###` | fas-cms-fresh UI route | CMS-UI-001 |
| `CMS-API-###` | fas-cms-fresh API route | CMS-API-045 |
| `CMS-NF-###` | fas-cms-fresh Netlify function | CMS-NF-012 |
| `MED-STORE-##` | fas-medusa store endpoint | MED-STORE-01 |
| `MED-ADMIN-##` | fas-medusa admin endpoint | MED-ADMIN-01 |
| `MED-WH-##` | fas-medusa webhook | MED-WH-01 |
| `MED-CORE-*-##` | Medusa core endpoint | MED-CORE-STORE-05 |
| `SAN-*-##` | fas-sanity function | SAN-DAT-03 |
| `SAN-CRON-##` | fas-sanity scheduled job | SAN-CRON-01 |

---

## Phase Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Repository inventories (consolidated) |
| Phase 2 | 🔄 Ready | Dependency analysis |
| Phase 3 | 📋 Planned | Cross-repo relationship mapping |
| Phase 4 | 📋 Planned | Authority rules & misroute prevention |
| Phase 5 | 📋 Planned | Critical flow traces |
| Phase 6 | 📋 Planned | Final synthesis & recommendations |

---

## Contributing

When adding new endpoints/routes:
1. Add to the main reference document
2. Assign appropriate ID using established prefix system
3. Update JSON data files if using programmatic tools
4. Follow Medusa-first architecture principles
5. Document cross-repo dependencies

---

**Last Updated:** 2026-02-03
**Maintained By:** Amber Mingione (@ambermingione)
**Repository:** fas-medusa/docs/SourceOfTruths
