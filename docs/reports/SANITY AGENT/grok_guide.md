# GROK Guide

Description: Grok Querrys for backfills and fetch calls
Category: operations

---


Introduction

This reference guide contains GROQ queries for identifying and backfilling missing data in the FAS Motorsports system. Use these queries to find incomplete records and maintain data quality across products, orders, customers, and content.

Product Backfilling

Use these queries to find products with missing critical data.

Products Missing SKUs

Finds all products without SKU numbers. Products need SKUs for inventory tracking and order processing. Fix by assigning unique SKU codes to each product.

Products Without Categories

Finds products not assigned to any category. Categories are essential for navigation and organization. Assign appropriate categories based on product type.

Products Missing Pricing

Identifies products without retail pricing set. All products should have a price greater than zero for proper e-commerce functionality.

Products Missing Wholesale Pricing

Finds products missing wholesale pricing tiers needed for B2B sales. Both standard and preferred wholesale prices should be set for wholesale customers.

Products Without Compatible Vehicles

Lists products without vehicle compatibility data. Link products to compatible vehicle models for better customer filtering and search.

Products Missing Images

Products without product images. Add high-quality product photos for better customer experience and conversion rates.

Order and Invoice Backfilling

Queries for finding incomplete order and invoice data.

Orders Missing Customer References

Orders that need to be linked to customer records. Match orders to existing customers by email or create new customer records.

Orders Without Invoices

Completed orders that should have invoices but don't. Generate invoices for all completed and shipped orders.

Invoices Missing Payment Info

Paid invoices without payment date recorded. Update with actual payment dates for accurate financial records.

Customer Data Backfilling

Find customers with incomplete profile data.

Customers Missing Email

Customer records without email addresses. Email is essential for communication and order notifications.

Customers Without Stripe IDs

Wholesale customers who need Stripe integration for payment processing. Create Stripe customer records and sync IDs.

Content Backfilling

Queries for blog and content management.

Posts Without Featured Images

Blog posts missing featured images. Add featured images for better social sharing and visual appeal.

Posts Missing Authors

Posts that need author attribution. Assign appropriate authors to all published content.

Unpublished Posts

Posts marked published but missing publish date. Set publishedAt date for proper chronological ordering.

Reference Integrity

Check for broken relationships and orphaned data.

Find Broken Product References

Orders referencing deleted or missing products. Review and either restore products or update order records.

Orphaned Invoices

Invoices not linked to any order or work order. Link to appropriate orders or work orders for proper tracking.

Metadata Backfilling

Find documents missing standard metadata.

Documents Missing Slugs

Documents that need URL-friendly slugs. Generate slugs from titles for proper URL routing.

Products Without Status

Products missing status field. Set status to active, inactive, or discontinued as appropriate.

Usage Tips

Run these queries in Sanity Vision or via the Sanity CLI. Use the results to identify documents that need updates, then batch update them through the Studio interface or API. Always test queries on a small subset before running bulk updates.