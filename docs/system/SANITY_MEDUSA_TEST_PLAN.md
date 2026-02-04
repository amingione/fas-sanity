# Sanity <=> Medusa Test Plan

This document outlines the testing strategy for the Sanity <=> Medusa data synchronization.

## Phase 2: Products Sync

### Unit Tests
- **How to run:** `npm run contract:test:transforms`
- **Expected output:** Successful test run.
- **Validates:** Correctness of data transformations between Sanity, Medusa, and the canonical format.

### Integration Tests
- **How to run:** `npm run sync:products:dry`
- **Expected output:** A dry run of the product sync, showing proposed changes.
- **Validates:** The end-to-end product sync process.

## Phase 3: Customers Sync
_(Tests to be defined)_

## Phase 4: Orders + Fulfillment Sync
_(Tests to be defined)_
