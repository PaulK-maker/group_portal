import twilio from 'twilio';

// Initialize Twilio client (no-op if credentials are not set)
const twilioClient = process.env.TWILIO_ACCOUNT_SID
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// True once an email provider is set up. Until then, email is only logged.
export function emailConfigured() {
  return Boolean(process.env.EMAIL_PROVIDER);
}

// Send a member reminder email.
// TODO: Integrate Resend, Postmark, SendGrid, or Mailgun (same as sendLoginCode).
export async function sendEmail({ to, subject, text }) {
  if (!emailConfigured()) {
    console.log(`[email] to ${to}: ${subject}`);
    return;
  }
  throw new Error('Email provider is not connected yet');
}

// Send login code via email.
// In development without email provider configured, prints to console.
export async function sendLoginCode(email, code) {
  if (!process.env.EMAIL_PROVIDER) {
    console.log(`[login code] ${email}: ${code}`);
    return;
  }
  // TODO: Integrate Resend, Postmark, SendGrid, or Mailgun
  console.log(`[login code] ${email}: ${code}`);
}

// Send login code via SMS using Twilio.
// In development without Twilio configured, prints to console.
export async function sendLoginSms(phone, code) {
  if (!twilioClient) {
    console.log(`[login sms] ${phone}: ${code}`);
    return;
  }

  try {
    await twilioClient.messages.create({
      body: `Your Pamo-Ledger login code is: ${code}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });
  } catch (err) {
    console.error(`[SMS failed] ${phone}:`, err.message);
    throw err;
  }
}
