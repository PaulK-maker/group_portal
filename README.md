# PayPortal

Treasurer and member portal for small groups: a church men's group today, any club, chama or association later.

- **Ledger**: payments via Cash App, Zelle, Pushpay, cash or check, with each member's progress against a pledge
- **Auto-capture**: forwarded payment emails become *pending* entries; the treasurer confirms each one
- **Members**: add and edit members, roles, and the names they pay under
- **Board**: announcements, meeting minutes, events
- **Excel export**: Summary sheet + full Ledger sheet

MERN: MongoDB, Express, React (Vite), Node 18+.

---

## Run it locally

```bash
# 1. API
cd server
cp .env.example .env        # set MONGO_URI (local Mongo or a free Atlas cluster) and JWT_SECRET
npm install
npm run dev                 # http://localhost:4000
npm test                    # email parser + matcher tests

# 2. Web app (second terminal)
cd client
npm install
npm run dev                 # http://localhost:5173 (proxies /api to :4000)
```

Sign in with an email **or a phone number**. **In development the 6-digit code prints in the server terminal** (email and SMS both). Phone numbers are stored in international format (`+15551234567`); numbers without a `+` use `DEFAULT_COUNTRY_CODE` (default `1`). The first person creates the organization and group and becomes admin. Then add the other members on the Members page, with an email, a phone number, or both.

---

## How it scales past one church group

```
Organization  (church, club, chama, association…)
   └── Group  (Men's Fellowship, Women's Group, Youth…)
         ├── Membership  (user + role + pledge + payment aliases)
         ├── Contribution  (ledger entries)
         ├── PendingPayment  (from emails, awaiting review)
         ├── Post  (announcements, minutes)
         └── Event
User  (one person, can belong to many groups)
```

- **Every record carries `group`.** The `loadMembership` middleware checks that the signed-in user is an active member of `:groupId` before any group route runs. That is the tenant wall.
- **Roles are per group.** Someone can be treasurer of the men's group and a plain member of another.
- **Nothing is church-specific in the code.** Organization type, categories (Dues, Event, Welfare…) and the label for "contribution" are settings.
- **Next steps toward SaaS:** an org-level admin who manages several groups, billing per organization, and a custom subdomain per org.

---

## File map

```
server/src/
  index.js                  app setup + route mounting
  config/db.js              Mongo connection
  middleware/auth.js        requireAuth (JWT), loadMembership (tenant guard), requireRole
  models/                   Organization, Group, User, Membership, Contribution,
                            PendingPayment, Post, Event
  routes/
    auth.js                 email code sign-in, /me
    groups.js               create org+group, group info, settings
    members.js              list/add/edit members, my progress
    contributions.js        ledger, summary, manual entry, void
    pending.js              review queue: confirm / dismiss
    inbound.js              webhook that receives forwarded payment emails
    board.js                posts (announcements/minutes) + events
    export.js               Excel workbook download
  services/
    emailParser.js          Cash App / Zelle / Pushpay email -> {amount, payer, memo, ref}
    matcher.js              payer name -> member (exact, alias, initial+last name)
    totals.js               per-member totals aggregation
    mailer.js               sends login codes (console in dev)
    emailParser.test.js

client/src/
  api.js                    fetch wrapper, money helpers
  context/AuthContext.jsx   session, current group, role flags
  components/               Layout (nav, group switcher), ProgressBar
  pages/                    Login, Setup, Dashboard, Members, Ledger, Pending, Board
```

---

## Payment flow

```
Member pays (Cash App / Zelle / Pushpay)
      │
      ▼
Receipt email → group's Gmail inbox → forwarding rule
      │
      ▼
Inbound email service (Mailgun / Postmark / SendGrid)
      │  POST /api/inbound/email/<inboundToken>
      ▼
emailParser  →  matcher  →  PendingPayment (status: pending)
      │
      ▼
Treasurer opens "Pending", checks the member, taps Confirm
      │
      ▼
Contribution (source: email)  →  progress bars, totals, Excel export
```

Manual entry goes straight to Contribution (source: manual). Money records are never deleted, only **voided with a reason**, so the audit trail stays intact.

### Setting up email capture
1. Make a dedicated Gmail account for the group. Point the group's Cash App and bank (Zelle) notifications to it, or forward them there.
2. Create an inbound route with an email service, e.g. Mailgun Routes: match the address → forward to `https://YOUR-API/api/inbound/email/<inboundToken>`.
   The token is returned by `GET /api/groups/:groupId` for admins and treasurers. Treat it like a password.
3. In Gmail, add a filter that forwards Cash App and Zelle emails to the Mailgun address.
4. Send yourself a $1 test payment and check the Pending tab.
5. Paste a few of your real receipt emails (personal details removed) into `emailParser.test.js` and tune the patterns. Each bank words Zelle alerts a bit differently.

---

## Before going live (to-do)
- [ ] Send login codes with a real email provider (`services/mailer.js`) and a real SMS provider (`sendLoginSms`)
- [ ] Verify the inbound provider's webhook signature (`routes/inbound.js`)
- [x] Rate-limit sign-in codes (per IP, per email/phone, country allowlist). Still to do: set a daily spend cap in your SMS provider's dashboard, and move the per-identity limits to Redis/Mongo if you run more than one API instance.
- [ ] File uploads for minutes PDFs (S3 or Cloudinary); for now posts take a link
- [ ] CSV import from Cash App and bank statements for monthly reconciliation
- [ ] WhatsApp or SMS notifications ("payment received", "minutes posted")
- [ ] Deploy: API on Render or Railway, client on Netlify or Vercel, MongoDB Atlas

## Money-handling notes
- Keep group funds in a group or church account, not the treasurer's personal account.
- Give a second leader view access to the ledger and export. Shared visibility is the best protection a treasurer has.
- Pushpay gifts that go through the church are usually church donations with church receipts. Record them here only if they're actually men's group money.
