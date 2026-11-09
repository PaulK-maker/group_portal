# Twilio SMS Integration Setup

PayPortal now supports **SMS-based authentication** via Twilio. Members can sign in with a phone number and receive a 6-digit code via text message.

## ✅ What's Included

- ✅ Twilio dependency added (`twilio` npm package)
- ✅ `sendLoginSms()` function fully implemented in `server/src/services/mailer.js`
- ✅ Graceful fallback: logs to console if Twilio credentials are not set
- ✅ Environment variables defined in `.env.example`
- ✅ Rate limiting already in place (auth.js)

## 🚀 Quick Start (5 minutes)

### Step 1: Get a Free Twilio Account

1. Go to [twilio.com/console](https://www.twilio.com/console)
2. Sign up (free account includes $15 credit + free incoming SMS)
3. Verify your phone number (you'll receive a code)
4. Request a phone number (e.g., +1-234-567-8900)

### Step 2: Get Credentials

In the Twilio Console:
- **Account SID**: Home page, top right
- **Auth Token**: Home page, top right (click "show")
- **Phone Number**: Phone Numbers > Manage Numbers > Active Numbers

Example values:
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token-here
TWILIO_PHONE_NUMBER=+1234567890
```

### Step 3: Update `.env`

In `server/.env`, add:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token-here
TWILIO_PHONE_NUMBER=+1234567890
```

### Step 4: Restart the Server

```bash
cd server
npm run dev
```

Twilio is now **live**. Try signing in with a phone number!

---

## 💡 How It Works

### Development Mode (No Twilio Credentials)

If `TWILIO_ACCOUNT_SID` is not set, SMS codes are printed to the server console:

```
[login sms] +15551234567: 123456
```

Perfect for testing—no cost, no SMS sent.

### Production Mode (Twilio Configured)

1. Member enters phone number on login page
2. Server calls `sendLoginSms(phone, code)`
3. Twilio sends SMS: *"Your PayPortal login code is: 123456"*
4. Member enters code on next screen
5. Server verifies & issues JWT

---

## 📊 Cost & Limits

- **Free tier**: $15 credit (enough for ~100 SMS)
- **After credits**: ~$0.0075 per SMS ($0.75 per 100 messages)
- **Rate limits**: Already enforced per-IP + per-identity in `auth.js`
  - Max 10 code requests per IP per 15 minutes
  - Max 5 wrong guesses per code
  - Code expires in 10 minutes

---

## 🌍 International Numbers

- ✅ Works with any E.164 format: `+15551234567`, `+44123456789`, `+254700123456`, etc.
- ✅ Optional country allowlist in `.env`: `SMS_ALLOWED_COUNTRIES=1,44,254` (US, UK, Kenya)
- ✅ Leave blank to allow all countries

---

## 🔒 Security Checklist

Before going live:

- [ ] Store `TWILIO_AUTH_TOKEN` in a secrets manager (never in git)
- [ ] Use environment variables (`.env` never committed)
- [ ] Review Twilio rate limits & set daily spend cap in dashboard
- [ ] Test with real phone numbers
- [ ] Monitor Twilio usage & costs in the console
- [ ] Rotate auth token periodically

---

## ❌ Troubleshooting

### SMS Not Sending

1. **Check console**: Does it say `[login sms]` or `[SMS failed]`?
   - Console log = Twilio not configured (expected in dev)
   - Failed message = Check error details below

2. **Verify credentials**: Copy-paste from Twilio console carefully
   - Typos in SID/token = "Unauthorized" error
   - Wrong phone number format = validation error

3. **Check Twilio logs**:
   - [twilio.com/console/sms/logs](https://www.twilio.com/console/sms/logs)
   - Look for delivery status (sent, failed, bounced)

4. **Verify phone number format**:
   - Must be E.164: `+[country][number]`
   - Example: `+15551234567` (not `(555) 123-4567`)

5. **Check country allowlist**:
   - If `SMS_ALLOWED_COUNTRIES=1,44` only US and UK work
   - Leave blank to allow all

### Auth Still Works Without Twilio

✅ This is expected! The fallback logs to console:
```
[login sms] +15551234567: 123456
```

To test email, set `EMAIL_PROVIDER=true` in `.env` and check console logs.

---

## 📚 Next Steps

### For Email (Optional)

Email sign-in currently logs to console. To send real emails:

1. Pick a provider: Resend, Postmark, SendGrid, or Mailgun
2. Update `sendLoginCode()` in `services/mailer.js`
3. Add credentials to `.env`

### For Production

- [ ] Deploy API to Render, Railway, or AWS
- [ ] Set `TRUST_PROXY=1` if behind a proxy (for IP rate limits)
- [ ] Rotate Twilio credentials in the dashboard
- [ ] Monitor costs & usage
- [ ] Set up Twilio error alerts

---

## 📖 Resources

- [Twilio SMS Docs](https://www.twilio.com/docs/sms)
- [Twilio Console](https://www.twilio.com/console)
- [E.164 Phone Format](https://en.wikipedia.org/wiki/E.164)
- [PayPortal Auth Flow](../README.md#payment-flow)
