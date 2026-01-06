import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

dotenv.config()

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN || ''

const client =
  projectId && dataset && token
    ? createClient({
        projectId,
        dataset,
        apiVersion: '2024-10-01',
        token,
        useCdn: false,
      })
    : null

const PORTAL_URL = 'https://www.fasmotorsports.com'

const commonFooter = `
  <div style="margin-top: 30px; padding-top: 20px; font-size: 13px; color: #666; text-align: center;">
    <p style="margin: 5px 0;"><strong>FAS Motorsports</strong></p>
    <p style="margin: 5px 0;">6161 Riverside Dr, Punta Gorda, FL 33982</p>
    <p style="margin: 5px 0;">(812) 200-9012 | sales@fasmotorsports.com</p>
    <p style="margin: 5px 0;"><a href="http://www.fasmotorsports.com" style="color: #ea1d26;">www.fasmotorsports.com</a></p>
  </div>`

const email1HTML = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background-color: white; padding: 40px; border-radius: 8px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="http://www.fasmotorsports.com/logo/faslogo150.webp" alt="FAS Motorsports" style="max-width: 150px;">
    </div>
    <h1 style="color: #ea1d26; font-size: 28px; margin-bottom: 20px; text-align: center;">Welcome to FAS Motorsports!</h1>
    <p style="font-size: 16px;">Hi {{companyName}},</p>
    <p style="font-size: 16px;">We're excited to partner with you! You've been invited to access the FAS Motorsports Vendor Portal, where you can manage orders, invoices, inventory, and communicate with our team.</p>
    <div style="text-align: center; margin: 40px 0;">
      <a href="{{setupLink}}" style="display: inline-block; padding: 16px 32px; background-color: #ea1d26; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 18px;">
        Set Up Your Account
      </a>
    </div>
    <p style="font-size: 14px; color: #666; text-align: center;">
      Or copy and paste this link:<br>
      <a href="{{setupLink}}" style="color: #ea1d26; word-break: break-all;">{{setupLink}}</a>
    </p>
    <div style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 30px 0;">
      <h3 style="margin-top: 0; color: #1a1a1a; font-size: 18px;">What you can do in the portal:</h3>
      <ul style="margin: 0; padding-left: 20px; font-size: 15px;">
        <li style="margin-bottom: 8px;">📦 Submit and track purchase orders</li>
        <li style="margin-bottom: 8px;">📄 Upload and manage invoices</li>
        <li style="margin-bottom: 8px;">📊 Update product inventory levels</li>
        <li style="margin-bottom: 8px;">💳 View payment history and status</li>
        <li style="margin-bottom: 8px;">💬 Message our team directly</li>
        <li style="margin-bottom: 8px;">📁 Access important documents</li>
      </ul>
    </div>
    <div style="border-left: 4px solid #ea1d26; padding-left: 16px; margin: 24px 0;">
      <p style="font-size: 14px; color: #666; margin: 0;">
        <strong style="color: #ea1d26;">Important:</strong> This invitation link will expire in 24 hours for security reasons.
      </p>
    </div>
    <p style="font-size: 15px;">If you have any questions, reply to this email or call us at <strong>(812) 200-9012</strong>.</p>
    <p style="font-size: 15px;">We're looking forward to working with you!</p>
    <p style="font-size: 15px;">Best regards,<br><strong>The FAS Motorsports Team</strong></p>
  </div>
  ${commonFooter}
</body>
</html>
`

const email2HTML = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background-color: white; padding: 40px; border-radius: 8px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="http://www.fasmotorsports.com/logo/faslogo150.webp" alt="FAS Motorsports" style="max-width: 150px;">
    </div>
    <h1 style="color: #ea1d26; font-size: 24px;">Welcome aboard, {{companyName}}! 🎉</h1>
    <p>We noticed you've set up your account. Great! Here are some tips to help you get the most out of the portal.</p>
    <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #ea1d26; margin-top: 0;">Quick Tips to Get Started</h3>
      <div style="margin-bottom: 20px;">
        <h4 style="color: #1a1a1a; margin-bottom: 8px;">1. Complete Your Profile</h4>
        <p style="margin: 0; font-size: 14px;">Go to Settings and add your shipping addresses and notification preferences.</p>
      </div>
      <div style="margin-bottom: 20px;">
        <h4 style="color: #1a1a1a; margin-bottom: 8px;">2. Update Your Inventory</h4>
        <p style="margin: 0; font-size: 14px;">Head to Inventory and update your product quantities and lead times so we know what's available.</p>
      </div>
      <div style="margin-bottom: 20px;">
        <h4 style="color: #1a1a1a; margin-bottom: 8px;">3. Explore the Dashboard</h4>
        <p style="margin: 0; font-size: 14px;">Your dashboard shows key metrics, recent activity, and quick actions for common tasks.</p>
      </div>
    </div>
    <h3 style="color: #1a1a1a;">Helpful Resources</h3>
    <ul style="font-size: 15px;">
      <li><a href="${PORTAL_URL}/vendor-portal/onboarding" style="color: #ea1d26;">📚 Full Onboarding Guide</a></li>
      <li><a href="${PORTAL_URL}/vendor-portal/onboarding/getting-started" style="color: #ea1d26;">⚡ Quick Start Guide</a></li>
      <li><a href="${PORTAL_URL}/vendor-portal/onboarding/faq" style="color: #ea1d26;">❓ Frequently Asked Questions</a></li>
    </ul>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${PORTAL_URL}/vendor-portal" style="display: inline-block; padding: 14px 28px; background-color: #ea1d26; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
        Go to Portal
      </a>
    </div>
    <p>Need help? Just reply to this email or call us at <strong>(812) 200-9012</strong>.</p>
    <p>Best,<br><strong>The FAS Motorsports Team</strong></p>
  </div>
  ${commonFooter}
</body>
</html>
`

const email3HTML = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background-color: white; padding: 40px; border-radius: 8px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="http://www.fasmotorsports.com/logo/faslogo150.webp" alt="FAS Motorsports" style="max-width: 150px;">
    </div>
    <h1 style="color: #ea1d26; font-size: 24px;">Let's Submit Your First Order!</h1>
    <p>Hi {{companyName}},</p>
    <p>You're all set up! Now let's walk through submitting your first order. It's quick and easy.</p>
    <div style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 24px 0;">
      <h3 style="color: #1a1a1a; margin-top: 0;">How to Submit an Order (3 minutes)</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="width: 40px; vertical-align: top; padding-bottom: 20px;">
            <div style="width: 32px; height: 32px; background-color: #ea1d26; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; text-align: center; line-height: 32px;">1</div>
          </td>
          <td style="vertical-align: top; padding-bottom: 20px;">
            <h4 style="margin: 0 0 8px 0; color: #1a1a1a;">Click "Orders" → "New Order"</h4>
            <p style="margin: 0; font-size: 14px; color: #666;">Find it in the sidebar navigation</p>
          </td>
        </tr>
        <tr>
          <td style="width: 40px; vertical-align: top; padding-bottom: 20px;">
            <div style="width: 32px; height: 32px; background-color: #ea1d26; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; text-align: center; line-height: 32px;">2</div>
          </td>
          <td style="vertical-align: top; padding-bottom: 20px;">
            <h4 style="margin: 0 0 8px 0; color: #1a1a1a;">Browse or search for products</h4>
            <p style="margin: 0; font-size: 14px; color: #666;">Use the search bar or filter by category</p>
          </td>
        </tr>
        <tr>
          <td style="width: 40px; vertical-align: top; padding-bottom: 20px;">
            <div style="width: 32px; height: 32px; background-color: #ea1d26; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; text-align: center; line-height: 32px;">3</div>
          </td>
          <td style="vertical-align: top; padding-bottom: 20px;">
            <h4 style="margin: 0 0 8px 0; color: #1a1a1a;">Add items to cart</h4>
            <p style="margin: 0; font-size: 14px; color: #666;">Click "Add to Cart" and adjust quantities</p>
          </td>
        </tr>
        <tr>
          <td style="width: 40px; vertical-align: top;">
            <div style="width: 32px; height: 32px; background-color: #ea1d26; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; text-align: center; line-height: 32px;">4</div>
          </td>
          <td style="vertical-align: top;">
            <h4 style="margin: 0 0 8px 0; color: #1a1a1a;">Review and submit</h4>
            <p style="margin: 0; font-size: 14px; color: #666;">Check your order and click "Submit Order"</p>
          </td>
        </tr>
      </table>
    </div>
    <div style="border-left: 4px solid #ea1d26; padding-left: 16px; margin: 24px 0;">
      <h4 style="color: #1a1a1a; margin-top: 0;">💡 Pro Tips</h4>
      <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
        <li style="margin-bottom: 8px;">Save frequently ordered items as templates</li>
        <li style="margin-bottom: 8px;">Use the "Reorder" button on past orders</li>
        <li style="margin-bottom: 8px;">Check inventory availability before ordering</li>
      </ul>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${PORTAL_URL}/vendor-portal/orders/new" style="display: inline-block; padding: 14px 28px; background-color: #ea1d26; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
        Submit Your First Order
      </a>
    </div>
    <p>Questions? We're here to help! Reply to this email or call <strong>(812) 200-9012</strong>.</p>
    <p>Cheers,<br><strong>The FAS Motorsports Team</strong></p>
  </div>
  ${commonFooter}
</body>
</html>
`

const email4HTML = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background-color: white; padding: 40px; border-radius: 8px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="http://www.fasmotorsports.com/logo/faslogo150.webp" alt="FAS Motorsports" style="max-width: 150px;">
    </div>
    <h1 style="color: #ea1d26; font-size: 24px;">Hidden Gems in Your Portal 💎</h1>
    <p>Hi {{companyName}},</p>
    <p>You've been using the portal for a week now. Here are some powerful features you might not have discovered yet:</p>
    <div style="margin: 30px 0;">
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
        <h3 style="color: #ea1d26; margin-top: 0;">1. 📊 Analytics Dashboard</h3>
        <p style="margin: 0; font-size: 15px;">Track your performance metrics, see top-selling products, and generate reports. Go to <strong>Analytics</strong> to explore.</p>
      </div>
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
        <h3 style="color: #ea1d26; margin-top: 0;">2. 📋 Order Templates</h3>
        <p style="margin: 0; font-size: 15px;">Save your frequently ordered items as templates for one-click reordering. Create one when submitting an order.</p>
      </div>
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
        <h3 style="color: #ea1d26; margin-top: 0;">3. 📁 Document Library</h3>
        <p style="margin: 0; font-size: 15px;">Access price lists, catalogs, and marketing materials. Upload your own compliance documents. Check out <strong>Documents</strong>.</p>
      </div>
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
        <h3 style="color: #ea1d26; margin-top: 0;">4. 🔔 Custom Notifications</h3>
        <p style="margin: 0; font-size: 15px;">Choose exactly which notifications you want to receive. Go to <strong>Settings → Notifications</strong> to customize.</p>
      </div>
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px;">
        <h3 style="color: #ea1d26; margin-top: 0;">5. 📤 Bulk Inventory Upload</h3>
        <p style="margin: 0; font-size: 15px;">Update hundreds of products at once with a CSV file. Go to <strong>Inventory → Bulk Upload</strong> and download the template.</p>
      </div>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${PORTAL_URL}/vendor-portal" style="display: inline-block; padding: 14px 28px; background-color: #ea1d26; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
        Explore the Portal
      </a>
    </div>
    <p>Want to learn more? Check out our <a href="${PORTAL_URL}/vendor-portal/onboarding" style="color: #ea1d26;">full onboarding guide</a>.</p>
    <p>Happy selling!<br><strong>The FAS Motorsports Team</strong></p>
  </div>
  ${commonFooter}
</body>
</html>
`

const email5HTML = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background-color: white; padding: 40px; border-radius: 8px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="http://www.fasmotorsports.com/logo/faslogo150.webp" alt="FAS Motorsports" style="max-width: 150px;">
    </div>
    <h1 style="color: #ea1d26; font-size: 24px;">How's Your Experience So Far?</h1>
    <p>Hi {{companyName}},</p>
    <p>You've been using the FAS Motorsports Vendor Portal for two weeks now. We hope it's making your life easier!</p>
    <p>We'd love to hear your feedback:</p>
    <div style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 24px 0;">
      <ul style="margin: 0; padding-left: 20px; font-size: 15px;">
        <li style="margin-bottom: 12px;">Is the portal easy to use?</li>
        <li style="margin-bottom: 12px;">Are there any features you'd like to see?</li>
        <li style="margin-bottom: 12px;">Have you encountered any issues?</li>
        <li style="margin-bottom: 12px;">What could we improve?</li>
      </ul>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      <a href="mailto:sales@fasmotorsports.com?subject=Portal Feedback from {{companyName}}" style="display: inline-block; padding: 14px 28px; background-color: #ea1d26; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
        Send Us Feedback
      </a>
    </div>
    <p style="font-size: 14px; color: #666; text-align: center;">Or simply reply to this email with your thoughts</p>
    <div style="border: 2px solid #ea1d26; border-radius: 8px; padding: 24px; margin: 30px 0;">
      <h3 style="color: #ea1d26; margin-top: 0; text-align: center;">Need Help?</h3>
      <p style="text-align: center; margin-bottom: 20px;">We're always here to support you.</p>
      <div style="text-align: center;">
        <p style="margin: 8px 0;"><strong>📧 Email:</strong> <a href="mailto:sales@fasmotorsports.com" style="color: #ea1d26;">sales@fasmotorsports.com</a></p>
        <p style="margin: 8px 0;"><strong>📞 Phone:</strong> <a href="tel:8122009012" style="color: #ea1d26;">(812) 200-9012</a></p>
        <p style="margin: 8px 0;"><strong>💬 Portal:</strong> <a href="${PORTAL_URL}/vendor-portal/messages" style="color: #ea1d26;">Send us a message</a></p>
      </div>
    </div>
    <h3 style="color: #1a1a1a;">Helpful Resources</h3>
    <ul style="font-size: 15px;">
      <li><a href="${PORTAL_URL}/vendor-portal/onboarding" style="color: #ea1d26;">📚 Full Onboarding Guide</a></li>
      <li><a href="${PORTAL_URL}/vendor-portal/onboarding/faq" style="color: #ea1d26;">❓ FAQ</a></li>
      <li><a href="${PORTAL_URL}/vendor-portal/onboarding/support" style="color: #ea1d26;">🆘 Get Support</a></li>
    </ul>
    <p>Thank you for being a valued partner. We're committed to making this the best vendor experience possible.</p>
    <p>With gratitude,<br><strong>The FAS Motorsports Team</strong></p>
  </div>
  ${commonFooter}
</body>
</html>
`

export async function seedVendorOnboardingCampaign() {
  if (!client) {
    throw new Error(
      'Missing Sanity project/dataset/token env vars. Set SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, and SANITY_API_TOKEN.',
    )
  }

  const existing = await client.fetch(
    `*[_type == "emailCampaign" && campaignType == "vendor_onboarding"][0]._id`,
  )
  if (existing) {
    console.log('Vendor onboarding campaign already exists:', existing)
    return existing
  }

  const campaign = await client.create({
    _type: 'emailCampaign',
    title: 'Vendor Onboarding Campaign',
    campaignType: 'vendor_onboarding',
    active: true,
    emails: [
      {
        _type: 'email',
        _key: 'email1',
        emailNumber: 1,
        delayDays: 0,
        subject: 'Welcome to FAS Motorsports Vendor Portal 🏁',
        previewText: 'Set up your account and start managing orders, invoices, and inventory',
        htmlContent: email1HTML,
        active: true,
      },
      {
        _type: 'email',
        _key: 'email2',
        emailNumber: 2,
        delayDays: 1,
        subject: 'Getting Started with Your FAS Motorsports Portal',
        previewText: 'Quick tips to help you get the most out of the portal',
        htmlContent: email2HTML,
        active: true,
      },
      {
        _type: 'email',
        _key: 'email3',
        emailNumber: 3,
        delayDays: 3,
        subject: 'Ready to submit your first order? 📦',
        previewText: 'Learn how to submit orders in just 3 minutes',
        htmlContent: email3HTML,
        active: true,
      },
      {
        _type: 'email',
        _key: 'email4',
        emailNumber: 4,
        delayDays: 7,
        subject: '5 Portal Features You Might Have Missed ✨',
        previewText: 'Discover powerful features to make your work easier',
        htmlContent: email4HTML,
        active: true,
      },
      {
        _type: 'email',
        _key: 'email5',
        emailNumber: 5,
        delayDays: 14,
        subject: "How's it going? We'd love your feedback 💬",
        previewText: 'Share your experience and help us improve',
        htmlContent: email5HTML,
        active: true,
      },
    ],
    createdAt: new Date().toISOString(),
  })

  console.log('Campaign created:', campaign._id)
  return campaign._id
}

// Allow CLI usage with: pnpm tsx scripts/seed-vendor-onboarding-campaign.ts
if (process.argv[1]?.includes('seed-vendor-onboarding-campaign')) {
  seedVendorOnboardingCampaign()
    .then((id) => {
      console.log('Done. Campaign id:', id)
    })
    .catch((err) => {
      console.error('[seed-vendor-onboarding-campaign] failed', err)
      process.exit(1)
    })
}
