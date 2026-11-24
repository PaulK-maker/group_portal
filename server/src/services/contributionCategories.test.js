import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contributionCategories } from './contributionCategories.js';

test('preserves group categories and adds missing standard options without duplicates', () => {
  const categories = ['Dues', 'monthly contribution'];
  assert.deepEqual(contributionCategories(categories), [
    'Dues', 'monthly contribution', 'One-time special contribution',
  ]);
  assert.deepEqual(categories, ['Dues', 'monthly contribution']);
});
