import { getToken as getClerkToken } from '@clerk/react';

const BASE = '/api';

export const getToken = getClerkToken;

export async function api(path, { method = 'GET', body, raw, token: providedToken, signal } = {}) {
  const token = providedToken === undefined ? await getClerkToken() : providedToken;
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (raw) {
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function apiWithTimeout(path, options, timeoutMessage) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
      controller.abort();
    }, 30000);
  });
  try {
    return await Promise.race([api(path, { ...options, signal: controller.signal }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export const money = (cents = 0) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const toCents = (v) => Math.round(parseFloat(v || 0) * 100);

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '');

export const METHOD_LABELS = {
  cashapp: 'Cash App', venmo: 'Venmo', zelle: 'Zelle', pushpay: 'Pushpay', cash: 'Cash', check: 'Check', other: 'Other',
};
