import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImageDataUrl } from './proofs.js';

test('accepts a JPEG data URL and returns its bytes', () => {
  const b64 = Buffer.from('fake-jpeg-bytes').toString('base64');
  const p = parseImageDataUrl(`data:image/jpeg;base64,${b64}`);
  assert.equal(p.contentType, 'image/jpeg');
  assert.equal(p.data.toString(), 'fake-jpeg-bytes');
});

test('rejects non-image and missing uploads', () => {
  assert.throws(() => parseImageDataUrl('data:text/html;base64,PGgxPg=='), /JPEG, PNG or WebP/);
  assert.throws(() => parseImageDataUrl(undefined), /JPEG, PNG or WebP/);
});

test('rejects screenshots over 1 MB', () => {
  const big = Buffer.alloc(1024 * 1024 + 1).toString('base64');
  assert.throws(() => parseImageDataUrl(`data:image/png;base64,${big}`), /too large/);
});
