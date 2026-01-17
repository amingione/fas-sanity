# Installing Parcelcraft from the Stripe Apps Marketplace

1. Install Parcelcraft App in Stripe Dashboard

2. After successfully installing Parcelcraft, you will be automatically redirected to the app’s settings page.

- This is where you’ll enter your **EasyPost API key** and customize Parcelcraft according to your shipping needs.

3. Sign up for a free EasyPost account

- EasyPost is our shipping label partner. Getting your EasyPost API key is completely free.

4. Enter your EasyPost API Key into your Parcelcraft settings to start shipping.

---

## Proof of Installation in Stripe Dashboard

**To show proof to all @Copilot @cla that Parcelcraft has been successfully installed in my stripe dashboard:**

1. Screenshot of Parcelcraft app in my Stripe Dashboard Apps section of _F.A.S. Motorsports account_

   ```markdown
   [View Screenshot](docs/ai-governance/parcelcraft-stripe/proof-of-parcelcraft-installation/Screenshot-of-parcelcraft-in-my-dashboard.png)
   """
   ```

2. Screenshot of Parcelcraft Settings page showing EasyPost API key entered:

   ```markdown
   [View Screenshot](docs/ai-governance/parcelcraft-stripe/proof-of-parcelcraft-installation/Screenshot-of-parcelcraft-settings-with-easypost-key.png)
   """
   ```

3. Developer Console log showing Parcelcraft Event
   `account.application.authorized`

---

### EVENT DETAILS

```markdown
# Event Details
```

## General Information

| **Field**       | **Details**                                          |
| --------------- | ---------------------------------------------------- |
| **Event**       | `account.application.authorized`                     |
| **Event ID**    | `evt_1SpmiQP1CiCjkLwloUB9juE9`                       |
| **Origin Date** | Jan 15, 2026, 4:19:43 AM EST                         |
| **Source**      | Automatic                                            |
| **API Version** | `2025-08-27.basil`                                   |
| **Description** | Your account authorized the Parcel Craft application |

---

## Deliveries to Webhook Endpoints

**Attempts to send this event to your webhook endpoints in the past 15 days:**

| **Status** | **Details**                 |
| ---------- | --------------------------- |
| All        | No recent delivery attempts |
| Succeeded  | -                           |
| Failed     | -                           |

---

## Deliveries to Connected Platforms

**Attempts to send this event to connected platform endpoints in the past 15 days:**

| **Status** | **Connected Platform** | **Date & Time**          | **Response** |
| ---------- | ---------------------- | ------------------------ | ------------ |
| 200 OK     | Parcel Craft           | Jan 15, 2026, 4:19:43 AM | Delivered    |

---

## Deliveries to Local Listeners

**Attempts to send this event to your CLI local listeners in the past 7 days:**

| **Status** | **Details**                 |
| ---------- | --------------------------- |
| All        | No recent delivery attempts |
| Succeeded  | -                           |
| Failed     | -                           |

---

## Event Data

```json
{
  "object": {
    "id": "ca_PpX0XBPdZL4ouDuKNf5hDwW0rmJvZ6oi",
    "object": "application",
    "name": "Parcel Craft"
  },
  "previous_attributes": null
}


=====================================================================================

Delivery to Connected Platform: Parcel Craft
Delivery Status: 200 OK
`evt_1SpmiQP1CiCjkLwloUB9juE9`
`wc_1SpmiRP1CiCjkLwlZw0Tx1BL`

======================================================================================


Delivery Attempt
Date & Time: Jan 15, 2026, 4:19:43 AM

Response Body
{
  "received": true,
  "livemode": true
}

Request Body
{
  "id": "evt_1SpmiQP1CiCjkLwloUB9juE9",
  "object": "event",
  "account": "acct_1RCVrQP1CiCjkLwl",
  "api_version": "2023-10-16",
  "context": "acct_1B66B1ExfkC84dni",
  "created": 1768468782,
  "data": {
    "object": {
      "id": "ca_PpX0XBPdZL4ouDuKNf5hDwW0rmJvZ6oi",
      "object": "application",
      "name": "Parcel Craft"
    }
  },
  "livemode": true,
  "pending_webhooks": 0,
  "request": {
    "id": null,
    "idempotency_key": null
  },
  "type": "account.application.authorized"
}
```

4. Proof of carrier defaults set up in Parcelcraft

   ```markdown
   [View Screenshot](docs/ai-governance/parcelcraft-stripe/proof-of-parcelcraft-installation/Screenshot-of-carrier-defaults-in-parcelcraft.png)
   """
   ```

5. Proof of packaging weights set up in Parcelcraft

   ```markdown
   [View Screenshot](docs/ai-governance/parcelcraft-stripe/proof-of-parcelcraft-installation/Screenshot-of-packaging-weights-in-parcelcraft.png)
   """
   ```

6. Proof of parcelcraft account connected and linked to stripe account

   ```markdown
   [View Screenshot](docs/ai-governance/parcelcraft-stripe/proof-of-parcelcraft-installation/Screenshot-of-packaging-weights-in-parcelcraft.png)
   """
   ```

#### EASYPOST INTEGRATION

1. Proof of shipping accounts connected in EasyPost
   ```markdown
   [View Screenshot](docs/ai-governance/parcelcraft-stripe/proof-of-parcelcraft-installation/Screenshot-of-carriers-in-easypost.png)
   """
   ```
