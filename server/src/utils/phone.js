// Normalizes a phone number to E.164 (+15551234567) so the same person always
// maps to one User. Numbers without a "+" use DEFAULT_COUNTRY_CODE (default 1 = US/Canada).
export function normalizePhone(input, defaultCode = process.env.DEFAULT_COUNTRY_CODE || '1') {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  let e164;
  if (raw.startsWith('+')) e164 = digits;
  else if (raw.startsWith('00')) e164 = digits.slice(2);
  else if (defaultCode === '1' && digits.length === 11 && digits.startsWith('1')) e164 = digits;
  else if (digits.startsWith('0')) e164 = defaultCode + digits.slice(1);
  else e164 = defaultCode + digits;
  return /^[1-9]\d{7,14}$/.test(e164) ? `+${e164}` : null;
}

// SMS_ALLOWED_COUNTRIES="1,254" limits texting to those country codes; unset allows all.
export function isCountryAllowed(e164, allowed = process.env.SMS_ALLOWED_COUNTRIES) {
  const codes = String(allowed || '').split(',').map((c) => c.trim().replace(/\D/g, '')).filter(Boolean);
  if (!codes.length) return true;
  return codes.some((c) => e164.startsWith(`+${c}`));
}
