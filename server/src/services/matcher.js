// Matches a payer name from an email to a group member.
// Returns a membership only when exactly one member fits; otherwise null,
// and the treasurer picks the member by hand in the Pending queue.

export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const words = (s) => String(s || '').toLowerCase().split(/\s+/).filter(Boolean);

export function matchPayer(memberships, payerName) {
  if (!payerName) return null;
  const p = norm(payerName);
  if (!p) return null;

  // 1. Exact match on the member's name or a saved alias ($cashtag, Zelle name...)
  const exact = memberships.filter((m) =>
    [m.user?.name, m.user?.email, ...(m.paymentIdentities || []).map((i) => i.value)].some((v) => v && norm(v) === p)
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  // 2. First initial + last name: "J Mwangi" -> "John Mwangi"
  const t = words(payerName);
  if (t.length >= 2) {
    const first = t[0][0];
    const last = norm(t.at(-1));
    const fuzzy = memberships.filter((m) => {
      const mt = words(m.user?.name);
      return mt.length >= 2 && mt[0][0] === first && norm(mt.at(-1)) === last;
    });
    if (fuzzy.length === 1) return fuzzy[0];
  }
  return null;
}
