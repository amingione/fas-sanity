# AI Development Guidelines

## 🚨 Architecture Authority Notice

This repository follows a **Medusa-first commerce architecture**.

- **Medusa** is the single source of truth for all commerce data (products, variants, pricing, inventory, cart, checkout, orders, shipping).
- **Sanity** is content-only (descriptions, images, SEO, marketing content).
- **Sanity must NEVER implement or duplicate commerce logic.**

If any UI, schema, or code guidance conflicts with this rule, this notice overrides it.

## UI Development Standards

### Scope Clarification (Important)

The UI standards in this document apply **only to Sanity Studio UI** (admin/editor interfaces).

They do NOT apply to:

- Storefront UI (fas-cms-fresh)
- Checkout, cart, pricing, or shipping logic
- Any Medusa-owned commerce behavior

UI consistency must never introduce or imply commerce responsibility inside Sanity.

All UI development in this repository must follow the Sanity UI Enforcement Policy.

### Sanity UI Enforcement Policy

#### Core Principle

Treat the Sanity UI library (Figma + @sanity/ui for React) as the single source of truth for all UI in this repository.

#### Rules for Every UI Change

For every UI-related change in any file, you must:

1. Use @sanity/ui primitives and design tokens for:
   - Layout (Box, Card, Container, Flex, Grid, Stack)
   - Spacing (space prop with theme tokens: 2, 3, 4, 5, etc.)
   - Colors (tone prop: "primary", "positive", "caution", "critical", "default")
   - Typography (Text component with size, weight props)
   - Badges (Badge component with tone and mode props)

2. Match official Sanity UI patterns:
   - Reference: https://www.sanity.io/ui/docs
   - Use documented component variants (tone, mode, size, radius)
   - Never create ad-hoc HTML/CSS for UI elements that exist in @sanity/ui

3. Prefer refactoring over custom styling:
   - If existing code uses custom CSS/HTML, propose a Sanity UI refactor
   - If a Sanity UI component exists for the use case, use it instead of building custom

#### Scope

This applies to the entire codebase, not just the current file or feature.

#### Safety Protocol

Before making any UI changes:

1. Assess impact: Identify all files that import or use the component/pattern you're changing
2. Check dependencies: Look for props, callbacks, or state that might break
3. Propose first: For large refactors (more than 3 files affected), show a diff/plan before implementing
4. Incremental migration: If refactoring existing UI:
   - Start with leaf components (lowest in the tree)
   - Test each change before moving up the component hierarchy
   - Keep existing props/APIs stable when possible
5. Preserve functionality: Ensure all existing behaviors (click handlers, state, data flow) remain intact

#### When to Stop and Ask

If a change would:

- Introduce UI that doesn't match Sanity UI patterns: Stop and propose a Sanity UI alternative
- Break existing functionality: Stop and explain the conflict
- Require refactoring more than 5 files: Stop and present a migration plan
- Need a Sanity UI component that doesn't exist: Stop and ask if a custom wrapper is acceptable

#### Repo-Wide Conventions

- All badges: Use Badge component with tone and mode props, never custom badge HTML/CSS
- All status indicators: Use Sanity UI tone system ("positive", "caution", "critical")
- All spacing: Use theme tokens (space={3}), never hardcoded px/rem values
- All colors: Use theme colors via tone/scheme props, never hex codes in components

#### Proactive Behavior

When you see existing UI not following these rules:

1. Flag it in your response
2. Suggest a specific Sanity UI refactor
3. Show before/after code snippets
4. Explain benefits (consistency, theme support, accessibility)

#### Example Refactor Pattern

Non-compliant (before):

```tsx
<div style={{padding: '16px', backgroundColor: '#f0f0f0'}}>
  <span className="custom-badge">Active</span>
</div>
```

Compliant (after):

```tsx
import {Box, Badge} from '@sanity/ui'
;<Box padding={4} tone="default">
  <Badge tone="positive" mode="outline">
    Active
  </Badge>
</Box>
```

#### Verification Checklist

For every UI change, verify:

- Uses @sanity/ui components
- Uses theme tokens (not hardcoded values)
- Matches documented Sanity UI patterns
- No breaking changes introduced
- If refactoring, all functionality preserved
- If uncertain, change proposed before implementation

#### Enforcement

Consistency and safety over speed. When in doubt, propose and discuss before implementing.

## Additional Standards

Add any other coding standards, architecture decisions, or process notes here as needed.

Refer to the docs/ai-governance/PROD_IDENTIFICATION_RULES.md for:
| SKU | MPN |

### Commerce Boundaries (Non-Negotiable)

- Sanity schemas must not contain prices, inventory counts, shipping rules, cart state, or order lifecycle logic.
- Any field that mirrors Medusa commerce data must be explicitly labeled as **read-only**, **derived**, or **content-only**.
- If a feature requires pricing, checkout, inventory, or shipping decisions, it belongs in **Medusa**, not Sanity.

If unsure, stop and ask before adding fields or logic.
