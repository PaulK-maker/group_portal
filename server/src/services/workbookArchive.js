import { inflateRawSync } from 'node:zlib';

const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export function validateWorkbookArchive(buffer) {
  const invalid = () => { throw new Error('Invalid or oversized Excel archive'); };
  let end = buffer.length - 22;
  const earliest = Math.max(0, buffer.length - 22 - 65535);
  while (end >= earliest) {
    if (buffer.readUInt32LE(end) === 0x06054b50 && end + 22 + buffer.readUInt16LE(end + 20) === buffer.length) break;
    end -= 1;
  }
  if (end < earliest) invalid();
  const count = buffer.readUInt16LE(end + 10);
  const size = buffer.readUInt32LE(end + 12);
  const start = buffer.readUInt32LE(end + 16);
  if (buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0 ||
      buffer.readUInt16LE(end + 8) !== count || !count || count > 1000 || start + size !== end) invalid();

  let offset = start;
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) invalid();
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const expanded = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & 1 || (method !== 0 && method !== 8) || expanded > MAX_ENTRY_BYTES ||
        local + 30 > start || buffer.readUInt32LE(local) !== 0x04034b50) invalid();
    const localNameLength = buffer.readUInt16LE(local + 26);
    const localExtraLength = buffer.readUInt16LE(local + 28);
    const dataStart = local + 30 + localNameLength + localExtraLength;
    if (buffer.readUInt16LE(local + 6) !== flags || buffer.readUInt16LE(local + 8) !== method ||
        dataStart + compressed > start ||
        !buffer.subarray(local + 30, local + 30 + localNameLength).equals(buffer.subarray(offset + 46, offset + 46 + nameLength))) invalid();
    let actual;
    if (method === 0) {
      actual = compressed;
    } else {
      try {
        actual = inflateRawSync(buffer.subarray(dataStart, dataStart + compressed), { maxOutputLength: MAX_ENTRY_BYTES }).length;
      } catch (err) {
        invalid();
      }
    }
    if (actual !== expanded) invalid();
    total += actual;
    if (total > MAX_TOTAL_BYTES) invalid();
    offset = next;
  }
  if (offset !== end) invalid();
}
