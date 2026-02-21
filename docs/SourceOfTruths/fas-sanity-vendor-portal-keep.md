# KEEP IN SANITY - ALREADY CONNECTED TO FAS-CMS-FRESH/FAS-CMS

-- NEED TO IMPLEMENT SOME UPGRADES TO THE SALES PERSON PROFILE IN SANITY CAN BE MADE TO CONNECT TO RESEND FOR VENDOR COMMUNICATIONS AND ALSO TO CONNECT TO MEDUSA FOR ORDER FULFILLMENT WORKFLOW AND ALSO TO CONNECT TO SHIPPO FOR SHIPPING LABELS/TRACKING UPDATES

Purpose: Maintain vendor relations and communications, order management, and workflow processes within Sanity while integrating with external systems for a seamless experience.

## Seperation from customer facing order management and communications to keep vendor specific processes and communications organized and efficient within Sanity, while leveraging the strengths of Medusa for order fulfillment and Shippo for shipping logistics.

VENDOR PORTAL
Vendor accounts
Vendor portal connection
Vendor communications and relations
Vendor Orders
Vendor Email marketing (emails sent directly from sanity for vendors)
Workflow for Vendor ordering
Vendor creates cart in fasmotorsports.com (fas-cms / fas-cms-fresh)
Vendor checks out via website (no payment is taken at checkout for vendors) → Cart (quote) is sent to the sales persons profile (per person sanity inbox connected to resend) → vendor sales team begins to fullfill orders and communicate with vendor if products have lead time, are backordered, etc or begins to fullfill order → when order is ready, medusa is triggered to send the email with payment link to vendor → sanity gets a fetch or webhook to build onto the timeline showing order activity ( order recieved, order being processed, order fulfilled, and it will also have the email timelines built in for email activity to vendor for that order so the sales person for the vendor has easily accessible validation/proof of email records for that vendor showing email communications activity along with order update activity from sanity and from medusa in a clean simple timeline string.
 TIMELINE EXAMPLE:
key:
invoice = order
cart = quote

new order {{quoteNumber}} {{vendorName}}  
button](confirm-order) → triggers email to send from sanity to vendor notifying its being processed
↓
order processing (quote is converted to invoice) → email sent: {{invoiceNumber}} {{updateStatus}}
[button](update-order)]]--OPTIONS
   |** BACKORDERED: This triggeres backordered email template to popup for direct edit in sanity dashboard → send to vendor from sanity
   |\_\_** PARTIALLY FULLFILL: This triggered email window with partial fulfillment email template for direct edit → send to vendor from sanity
   |\_\_\_\_ORDER FULFILLED: Triggers workflow to begin on medusa/fas-dash: → they send payment linked invoice to vendor to collect payment
↓
(current-status) =backordered/partially fulfilled/fulfilled → email delivered: {{invoiceNumber}} {{orderUpdate}}
IF HAS BACKORDERED/PARTIAL STATUS then this button is clickable. if fulfilled status button is greyed out/not clickable or just not present whatever is easier
[button](fulfill-order) → triggers medusa workflow
[remains in open state if “fulfilled” status present until payment is received in medusa→ once received update auto triggered from medusa to sanity to mark order as paid]
if marked backordered/partial → sanity still owns workflow sends email to continue communication with vendor
↓
(auto filled read only email activity status from resend) [Invoice viewed/not viewed] (this can be pulled from resend)
↓
paid/unpaid → email sent: {{invoiceNumber}} {{orderStatus}} ¡¡email sent to vendor from medusa or fas-dash because they would receive payment — sanity just receives status!!
↓
tracking added → email sent to vendor from medusa or fas-dash with tracking number upon label purchase
[[Read-Only textBox with AUTO FILLED tracking #→ label purchased inside medusa from shippo]]
↓
(updated timeline activity is sent to sanity from either medusa/fas-dash or a shippo webhook to sanity — order update emails are delivered from shippo to customer)
read only order shipped
↓
read only automatic tracking updates
↓
{{invoiceNumber}} Order Delivered!
-— END OF TIMELINE UNLESS ISSUE WITH ORDER AND RETURN IS REQUESTED THEN TIMELINE GETS UPDATED WITH: RETURN STARTED → REFUNDED WORKFLOW---
