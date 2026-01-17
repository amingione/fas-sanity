# FAS Product Identifier Specification

## Overview

This document defines the canonical structure for all FAS product identifiers. These identifiers are immutable after publication and serve as the source of truth for SKUs, MPNs, slugs, and internal codes.

---

## Identifier Structure Reference

| Identifier        | Format                     | Purpose                                    | Mutability | Example               |
| ----------------- | -------------------------- | ------------------------------------------ | ---------- | --------------------- |
| **SKU**           | `ENGINE-PACKAGECODE-BRAND` | Primary system identifier (Stripe-safe)    | Immutable  | `HC-A8FI-FAS`         |
| **MPN**           | `ENGINE-PACKAGECODE`       | Manufacturer part number (Google Merchant) | Immutable  | `HC-A8FI`             |
| **SLUG**          | `lowercase-hyphenated`     | URL identifier (SEO-friendly)              | Mutable    | `fas-850-package-trx` |
| **DISPLAY TITLE** | `Free text`                | Marketing name                             | Mutable    | `FAS 850 TRX Package` |
| **INTERNAL CODE** | Same as SKU                | Operations/shipping reference              | Immutable  | `HC-A8FI-FAS`         |

---

## Detailed Field Definitions

### ENGINE (2 characters)

| Code   | Platform(s)                                                                       |
| ------ | --------------------------------------------------------------------------------- |
| `HC`   | Hellcat-based: TRX, Trackhawk, Charger Hellcat, Challenger Hellcat, Redeye, Demon |
| `HEMI` | Non-Hellcat HEMI engines                                                          |
| `LS`   | GM LS-based platforms                                                             |
| `COY`  | Ford Coyote                                                                       |
| `PWR`  | Ford Powerstroke                                                                  |

---

### PACKAGECODE (4 characters — deterministic)

Structure: `<P><T><F><I>`

| Position | Field | Meaning       | Allowed Values                                                  |
| -------- | ----- | ------------- | --------------------------------------------------------------- |
| 1        | `P`   | Package Class | `A` = Complete, `S` = Standalone, `B` = Bundle, `T` = Tune-only |
| 2        | `T`   | Power Tier    | `6–9` = 600–999 whp class                                       |
| 3        | `F`   | Fuel Type     | `P` = Pump, `F` = Flex, `E` = E85-only, `R` = Race-only         |
| 4        | `I`   | Induction     | `I` = Factory SC, `U` = Upgraded SC, `T` = Turbo, `N` = NA      |

**Example:** `A8FI` = Complete 850-class package, flex fuel, factory supercharger

---

### BRAND (3 characters)

| Code  | Meaning         |
| ----- | --------------- |
| `FAS` | FAS Motorsports |

---

## Validation Rules

### SKU

**Regex:** `^[A-Z]{2}-[A-Z0-9]{4}-[A-Z]{3}$`

**Sanity Rule:**
