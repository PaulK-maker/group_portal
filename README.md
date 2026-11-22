# Pamo-Ledger

Treasurer and member portal for small groups: a church men's group today, any club, chama or association later.

- **Ledger**: payments via Cash App, Venmo, Zelle, Pushpay, cash or check, with each member's progress against a pledge
- **Auto-capture**: forwarded payment emails become *pending* entries; the treasurer confirms each one
- **Members**: add and edit members, roles, and the names they pay under
- **Official**: announcements, meeting minutes and events, attributed to the sender's assigned role
- **Excel export**: Summary and full Ledger sheets, plus a monthly report for the selected payment category
- **Excel import**: finance users can map and review member-by-month or one-payment-per-row spreadsheets before adding payments

MERN: MongoDB, Express, React (Vite), Node 18+.

---

## Run it locally

```bash
# 1. API
cd server
cp .env.example .env        # set MONGO_URI (local Mongo or a free Atlas cluster) and your Clerk keys (see CLERK_SETUP.md)
npm install
npm run dev                 # http://localhost:4000
npm test                    # email parser + matcher tests

# 2. Web app (second terminal)
cd client
npm install
npm run dev                 # http://localhost:5173 (proxies /api to :4000)
```

Sign in with an email or a phone number through [Clerk](https://clerk.com). Sign-in codes, rate limits, and session handling are all handled by Clerk. The first person creates the organization and group and becomes admin. Then add the other members on the Members page, with an email, a phone number, or both.

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
- Admins can assign chairman, treasurer and secretary roles. These officials and admins can post announcements and events; their role at the time of posting is displayed with their name. Chairman does not grant finance or admin access.
- **Nothing is church-specific in the code.** Organization type, categories (Dues, Event, Welfare…) and the label for "contribution" are settings.
- **Next steps toward SaaS:** an org-level admin who manages several groups, billing per organization, and a custom subdomain per org.

---

## File map

```
server/src/
  index.js                  app setup + route mounting
  config/db.js              Mongo connection
  middleware/auth.js        clerkAuth + requireAuth (Clerk session), loadMembership (tenant guard), requireRole
  models/                   Organization, Group, User, Membership, Contribution,
                            PendingPayment, Post, Event
  routes/
    auth.js                 Clerk session sync, /me
    groups.js               create org+group, group info, settings
    members.js              list/add/edit members, my progress
    contributions.js        ledger, summary, manual entry, void
    pending.js              review queue: confirm / dismiss, view member screenshots
    proofs.js               member payment screenshot uploads -> review queue
    reminders.js            treasurer email blasts, member reminder opt-out, send history
    inbound.js              webhook that receives forwarded payment emails
    board.js                posts (announcements/minutes) + events
    export.js               Excel workbook download
  services/
    emailParser.js          Cash App / Venmo / Zelle / Pushpay email -> {amount, payer, memo, ref}
    matcher.js              payer name -> member (exact, alias, initial+last name)
    totals.js               per-member totals aggregation
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
Member pays (Cash App / Venmo / Zelle / Pushpay)
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

### Importing contributions from Excel

On the Ledger page, an admin or treasurer can upload a `.xlsx` workbook (up to 750 KB). Choose the correct sheet and identify either member rows with month/event columns or individual payment rows. Column letters and example values help identify columns even when headings are blank. For twelve consecutive January–December columns, select the January column and category, then apply the month selection; enter the year. Extra contributions can be selected separately with a category and note. Check all suggested columns and leave totals and other non-payment columns out. For event columns selected individually, the column heading is kept as the payment memo. Imported payments use the `Other` payment method.

The review lets you match repeated names to active group members together, adjust individual payments, or leave them out. Blank and zero amounts are skipped; invalid amounts must be corrected or unselected. Rows marked voided in a `Voided` column are left out by default; choosing to include one records it as an active payment. Excel date cells and `YYYY-MM-DD` dates are recognized automatically. For dates written with slashes, choose whether the month or day comes first; ambiguous dates are never guessed. Missing dates use the chosen default, initially today. Dates or categories that cannot be recognized can be corrected individually or filled together, without changing valid dates or existing report months. Month-column amounts retain their selected year and month for monthly reports, independently of the payment date. A finance user can later edit an imported payment date from the ledger; the previous date and editor are retained, and the reporting month remains unchanged.

Check the source names and amounts against the person and amount shown for each payment, then confirm the review before importing. For example, a numeric value of 50 means $50.00. Check for possible duplicates before importing. Payments for the same member, category and reporting month are flagged, including other selected spreadsheet rows; each flagged row requires confirmation. These are possible matches, not proof that two payments are identical. Unmatched or ambiguous names must be matched manually, and the import never creates members; add missing members on the Members page and choose the file again. Check the ledger if an import is interrupted; retrying the same preview will not add its already-saved payments again.

Workbooks are limited to 20 worksheets, 1,000 rows and 60 columns per sheet, 60,000 cells total and 1,000 selected payments per import. The expanded workbook is limited to 20 MB total and 8 MB per internal file. Formula cells need cached values in the workbook; formulas are not recalculated during import.

### Setting up email capture
1. Make a dedicated Gmail account for the group. Point the group's Cash App, Venmo and bank (Zelle) notifications to it, or forward them there.
2. Create an inbound route with an email service, e.g. Mailgun Routes: match the address → forward to `https://YOUR-API/api/inbound/email/<inboundToken>`.
   The token is returned by `GET /api/groups/:groupId` for admins and treasurers. Treat it like a password.
3. In Gmail, add a filter that forwards Cash App, Venmo and Zelle emails to the Mailgun address.
4. Send yourself a $1 test payment and check the Pending tab.
5. Paste a few of your real receipt emails (personal details removed) into `emailParser.test.js` and tune the patterns. Each bank words Zelle alerts a bit differently.

---

## Before going live (to-do)
- [ ] Move Clerk from development to a production instance and use the production keys (see `CLERK_SETUP.md`)
- [ ] Verify the inbound provider's webhook signature (`routes/inbound.js`)
- [ ] Review sign-in rate limits in the Clerk dashboard, and set a daily spend cap in any SMS provider connected to Clerk
- [ ] File uploads for minutes PDFs (S3 or Cloudinary); for now posts take a link
- [ ] CSV import from Cash App and bank statements for monthly reconciliation
- [ ] WhatsApp or SMS notifications ("payment received", "minutes posted")
- [ ] Deploy: API on Render or Railway, client on Netlify or Vercel, MongoDB Atlas

## Money-handling notes
- Keep group funds in a group or church account, not the treasurer's personal account.
- Give a second leader view access to the ledger and export. Shared visibility is the best protection a treasurer has.
- Pushpay gifts that go through the church are usually church donations with church receipts. Record them here only if they're actually men's group money.
