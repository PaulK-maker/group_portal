import { getToken as getClerkToken } from '@clerk/react';

const BASE = '/api';

export const getToken = getClerkToken;

export async function api(path, { method = 'GET', body, raw } = {}) {
  const token = await getClerkToken();
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) {
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const money = (cents = 0) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const toCents = (v) => Math.round(parseFloat(v || 0) * 100);

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '');

export const METHOD_LABELS = {
  cashapp: 'Cash App', zelle: 'Zelle', pushpay: 'Pushpay', cash: 'Cash', check: 'Check', other: 'Other',
};
