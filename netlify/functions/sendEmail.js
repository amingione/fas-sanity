const fetch = require('node-fetch');

exports.handler = async (event) => {
  const { email, name, message } = JSON.parse(event.body);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer re_edfmT3JW_CnUp5D9rcGwFH7w1X6q9Wc13`, // Replace
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'FAS Garage <onboarding@resend.dev>', // use Resend-verified sender
      to: ['sales@fasmotorsports.com'], // ← replace this
      subject: 'New Garage Build Submitted',
      html: `<strong>${name}</strong> submitted a build:<br>${message}<br>Email: ${email}`,
    }),
  });

  const data = await res.json();

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, data }),
  };
};