// Swap this for a real provider (Resend, Postmark, SendGrid, Mailgun) later.
// In development the code is printed to the server console.
export async function sendLoginCode(email, code) {
  console.log(`[login code] ${email}: ${code}`);
}

// Swap this for an SMS provider (Twilio, Vonage, Africa's Talking) later.
export async function sendLoginSms(phone, code) {
  console.log(`[login sms] ${phone}: ${code}`);
}
