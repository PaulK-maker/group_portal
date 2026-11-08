// Turns a Cash App / Zelle / Pushpay notification email into a structured
// payment. These are heuristics: collect a few of your real receipt emails
// and add them to emailParser.test.js, then tune the patterns.

const METHOD_HINTS = [
  ['cashapp', /cash\s?app|square\.com|\$cashtag/i],
  ['zelle', /zelle/i],
  ['pushpay', /pushpay/i],
];

const AMOUNT = /\$\s?([\d,]+(?:\.\d{1,2})?)/;

const PAYER_PATTERNS = [
  /^(?:(?:fwd?|re):\s*)*(.+?)\s+sent you(?:\s+money|\s+a payment|\s+\$)/im,
  /you(?:'ve| have)? received\s+(?:\$[\d,]+(?:\.\d{2})?\s+)?(?:money\s+)?from\s+([^\n.,$]+?)(?:\s+(?:on|via|for|with)\b|[.\n,]|$)/im,
  /payment from\s+([^\n.,$]+?)(?:\s+(?:on|via|for)\b|[.\n,]|$)/im,
];

const MEMO_PATTERNS = [
  /sent you \$[\d,]+(?:\.\d{2})?\s+for\s+(.+)$/im,
  /^\s*(?:memo|note|message|for)\s*:\s*(.+)$/im,
];

const REFERENCE =
  /(?:confirmation|transaction|reference|identifier)(?:\s*(?:number|no\.?|id|#))?\s*[:#]?\s*#?([A-Z0-9][A-Z0-9-]{5,})/i;

export function toCents(value) {
  const n = parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function firstMatch(patterns, ...texts) {
  for (const re of patterns) {
    for (const t of texts) {
      const m = t && t.match(re);
      if (m) return m[1].trim();
    }
  }
  return null;
}

function cleanName(name) {
  if (!name) return null;
  const n = name.replace(/[*_"“”]/g, '').replace(/\s+/g, ' ').trim();
  // Guard against grabbing a sentence instead of a name
  if (n.length > 60 || /\b(you|your|cash app|zelle|bank)\b/i.test(n)) return null;
  return n;
}

export function parsePaymentEmail({ from = '', subject = '', text = '' } = {}) {
  const all = `${from}\n${subject}\n${text}`;
  const method = METHOD_HINTS.find(([, re]) => re.test(all))?.[0];
  if (!method) return null;

  // Ignore money going OUT of the account
  if (/\byou (sent|paid)\b/i.test(subject) || /^\s*you (sent|paid)\b/im.test(text)) return null;

  const amountMatch = subject.match(AMOUNT) || text.match(AMOUNT);
  if (!amountMatch) return null;
  const amountCents = toCents(amountMatch[1]);
  if (!amountCents) return null;

  return {
    method,
    amountCents,
    payerName: cleanName(firstMatch(PAYER_PATTERNS, subject, text)),
    memo: firstMatch(MEMO_PATTERNS, subject, text),
    reference: firstMatch([REFERENCE], text, subject),
  };
}

// Pick a category from the memo, e.g. "event fee" -> "Event".
export function guessCategory(memo, categories = []) {
  const m = (memo || '').toLowerCase();
  const hit = categories.find((c) => m.includes(c.toLowerCase()));
  return hit || categories[0] || 'Other';
}
