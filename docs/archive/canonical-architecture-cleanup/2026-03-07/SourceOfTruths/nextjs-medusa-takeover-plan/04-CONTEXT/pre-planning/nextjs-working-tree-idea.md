# ARCHIVED DOCUMENT

This file is superseded by the canonical architecture package:

- docs/governance/checkout-architecture-governance.md
- docs/governance/commerce-authority-checklist.md
- docs/architecture/canonical-commerce-architecture.md

Do not use this file as implementation authority.

---

# FAS Next.js - NEW working tree vision

/admin
  /login
  /logout
  /dashboard
    /sales-overview
    /operations-feed            # alerts: failed payments, returns, low stock, etc.
    /tasks                      # manual tasks, follow-ups

  /orders
    /                          # list + filters
    /:orderId
      /overview                # items, payments, fulfillment, status timeline
      /payments                # captures, refunds, adjustments
      /fulfillments            # shipments, labels, tracking
      /returns                 # returns tied to this order
      /claims                  # claims/swaps tied to this order
      /notes                   # internal notes
      /emails                  # emails sent for this order, resend actions[web:62][web:90][web:93][web:95]
      /activity                # audit log (events, changes)

  /returns-claims
    /returns
      /                        # all returns queue
      /:returnId
    /claims
      /                        # all claims/swap cases
      /:claimId                # damaged/wrong item resolutions[web:62][web:90][web:93]

  /quotes
    /                          # quote list (open, sent, accepted, expired)[web:67][web:73]
    /new
    /:quoteId
      /edit                    # lines, custom prices, discounts, expiry
      /emails                  # send/resend quote email
      /convert-to-order        # quote → order
      /activity

  /invoices
    /                          # invoices list (draft, sent, paid, overdue)
    /:invoiceId
      /overview
      /payments                # internal record of invoice payments
      /pdf                     # render/download
      /emails                  # send/resend invoice email

  /customers
    /                          # customers list + filters
    /:customerId
      /overview                # core Medusa customer data[web:63][web:97]
      /orders
      /quotes
      /invoices
      /returns-claims
      /credits                 # store credit / gift card balance if used
      /notes                   # internal notes
      /emails                  # emails sent to this customer
      /activity

  /products
    /                          # product list
    /new
    /:productId
      /overview                # variants, options, status[web:63][web:66]
      /pricing                 # region/channel pricing
      /inventory               # stock summary per location
      /shipping-tax            # shipping profiles, tax class
      /relations               # related, upsell, bundles
      /sales                   # basic sales metrics
      /linked-content          # link out to Sanity product doc(s), guides

  /inventory
    /                          # inventory per SKU/location
    /locations
      /                        # locations list (warehouse, store, etc.)
      /new
      /:locationId
        /stock                 # all SKUs at this location
        /adjustments           # manual adjustments + reasons
        /transfers             # in/out transfers
    /transfers
      /                        # global transfers list
      /:transferId

  /shipping
    /shipments
      /                        # all shipments list
      /:shipmentId             # detail, tracking, label reprint
    /exceptions                # failed labels, address issues
    /carriers
      /                        # list of carriers/providers
      /:carrierId              # services, credentials (if surfaced)[web:25]
    /profiles
      /                        # shipping profiles
      /:profileId              # rules per product group
    /zones
      /                        # shipping zones/matrices if you add them

  /vendors
    /                          # vendor list
    /new
    /:vendorId
      /overview                # contact, terms, lead times
      /products                # products they supply
      /purchase-orders
        /                      # POs to this vendor
        /new
        /:poId
          /overview
          /lines
          /receiving           # receive against PO, increments inventory
          /invoices            # vendor invoices, if tracked here
          /activity

  /channels
    /                          # sales channels list (web, POS, marketplaces)
    /:channelId
      /overview
      /pricing-overrides
      /assortment              # which products are on this channel

  /pos
    /registers                 # physical registers/devices
    /sessions                  # open/close cash sessions
    /orders                    # in-person orders view

  /marketing-links             # optional: link layer to Sanity/editorial
    /campaigns                 # list of campaigns, UTM, etc.
    /landing-pages             # read-only list w/ “Open in Sanity Studio” link

  /reports
    /sales
    /inventory
    /customers
    /operations                # e.g. return rate, claim reasons, SLA

  /notifications               # admin-facing notifications feed
    /feed                      # feed from Medusa admin notification channel[web:94][web:95]
    /rules                     # optional: internal “rules” pointing to Medusa workflows

  /settings
    /store
      /general                 # store name, logo, timezone, default currency
      /branding                # base brand/theme tokens used by admin UI
    /regions
      /                        # regions list
      /:regionId
        /taxes                 # tax rates/overrides
        /currencies
        /payment-providers
        /shipping-options
    /payment
      /providers               # Stripe, etc. mapping/config (surface safe subset)
    /shipping
      /profiles                # manage shipping profiles
      /options                 # shipping options per region/profile
      /return-reasons          # reasons used in returns UI[web:62][web:90]
    /notifications
      /providers               # email/SMS providers wired to Medusa Notification module[web:75][web:76]
      /templates
        /order-confirmation
        /shipping-confirmation
        /delivery-confirmation
        /refund-notice
        /account-created
        /quote-sent
        /invoice-sent
        /password-reset
      /events                  # toggle which events send which template[web:75][web:78]
    /customers
      /tags
      /groups
      /fields                  # custom fields config if you add them
    /products
      /tags
      /collections
      /attributes              # your custom attribute/option metadata
    /returns-claims
      /reasons                 # return/claim reason sets[web:62][web:90]
      /policies                # internal policy references
    /inventory
      /locations               # global location settings
      /thresholds              # low-stock thresholds, alerts
    /security
      /users
      /roles-permissions
      /api-keys
    /developer
      /webhooks                # outbound webhooks for events
      /integrations            # references to external systems, sandbox keys

  /profile                      # currently logged-in admin profile
    /account
    /notifications              # personal notification prefs, email frequency
    /activity
