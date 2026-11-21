import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { validateWorkbookArchive } from './workbookArchive.js';

function archiveWithExpandedSize(actualSize, declaredSize) {
  const name = Buffer.from('large.xml');
  const compressed = deflateRawSync(Buffer.alloc(actualSize, 65));
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(declaredSize, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + compressed.length, 16);
  return Buffer.concat([local, name, compressed, central, name, end]);
}

test('accepts a normal xlsx and rejects oversized or falsely declared compressed content', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Payments').addRow(['Member', 'JAN']);
  const data = Buffer.from(await workbook.xlsx.writeBuffer());
  assert.doesNotThrow(() => validateWorkbookArchive(data));
  assert.throws(() => validateWorkbookArchive(Buffer.from('not a zip')));
  assert.throws(() => validateWorkbookArchive(archiveWithExpandedSize(9 * 1024 * 1024, 1024)));
  assert.throws(() => validateWorkbookArchive(archiveWithExpandedSize(100, 99)));
});
