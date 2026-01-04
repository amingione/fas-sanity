export async function handler(event) {
  try {
    let payload = {}
    try {
      payload = event.body ? JSON.parse(event.body) : {}
    } catch (parseError) {
      return {
        statusCode: 400,
        body: JSON.stringify({error: 'Invalid JSON payload'}),
      }
    }

    const {email, name, message} = payload || {}
    if (!email || !name || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({error: 'Missing required fields: email, name, message'}),
      }
    }
    const RESEND_API_KEY = process.env.RESEND_API_KEY

    if (!RESEND_API_KEY) {
      console.error('[sendEmail] RESEND_API_KEY is missing or empty', {
        hasEnvVar: Boolean(process.env.RESEND_API_KEY),
        availableResendVars: Object.keys(process.env).filter((key) => key.includes('RESEND')),
        timestamp: new Date().toISOString(),
      })
      throw new Error('Missing RESEND_API_KEY in environment variables.')
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FAS Garage <support@updates.fasmotorsports.com>',
        to: [email], // <- use the form-submitted email safely here
        subject: '🚗 New Garage Submission',
        html: `
          <h2>New Submission from ${name}</h2>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Message:</strong> ${message}</p>
        `,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Resend API error: ${errorBody}`)
    }

    const data = await response.json()

    return {
      statusCode: 200,
      body: JSON.stringify({success: true, data}),
    }
  } catch (error) {
    console.error(error)
    return {
      statusCode: 500,
      body: JSON.stringify({error: error.message}),
    }
  }
}
