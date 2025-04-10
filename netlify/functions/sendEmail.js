const fetch = require('node-fetch');

exports.handler = async (event) => {
  const { email, name, message } = JSON.parse(event.body);
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'FAS Garage <support@updates.fasmotorsports.com>',
      to: ['you@your-email.com'],
      subject: '🚗 New Garage Submission',
      html: `
        <h2>New Submission from ${name}</h2>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong> ${message}</p>
      `,
    }),
  });

  const data = await response.json();

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, data }),
  };
};