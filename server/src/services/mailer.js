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
