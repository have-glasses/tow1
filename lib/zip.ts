type ZipEntry = {
  name: string;
  data: Uint8Array;
  crc32: number;
  offset: number;
};

const encoder = new TextEncoder();
let crcTable: Uint32Array | null = null;

function table() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  const values = table();
  for (const byte of data) crc = values[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = (year - 1980) << 9 | (date.getMonth() + 1) << 5 | date.getDate();
  return { time, day };
}

function u16(value: number) {
  const buffer = new Uint8Array(2);
  new DataView(buffer.buffer).setUint16(0, value, true);
  return buffer;
}

function u32(value: number) {
  const buffer = new Uint8Array(4);
  new DataView(buffer.buffer).setUint32(0, value >>> 0, true);
  return buffer;
}

function concat(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function safeName(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+$/, "_").trim() || "file";
}

export function zipPath(parts: string[]) {
  return parts.map(safeName).filter(Boolean).join("/");
}

export function createZip(files: Array<{ name: string; data: Uint8Array }>) {
  const { time, day } = dosDateTime();
  const entries: ZipEntry[] = [];
  const localParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(time), u16(day),
      u32(crc), u32(file.data.byteLength), u32(file.data.byteLength), u16(name.byteLength), u16(0), name, file.data
    ]);
    entries.push({ name: file.name, data: file.data, crc32: crc, offset });
    localParts.push(local);
    offset += local.byteLength;
  }

  const centralParts: Uint8Array[] = [];
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    centralParts.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(day),
      u32(entry.crc32), u32(entry.data.byteLength), u32(entry.data.byteLength), u16(name.byteLength), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(entry.offset), name
    ]));
  }

  const central = concat(centralParts);
  const end = concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(central.byteLength), u32(offset), u16(0)]);
  return concat([...localParts, central, end]);
}
