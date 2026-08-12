// biome-ignore-all lint/suspicious/noBitwiseOperators: a CRC-32 and a packed DOS date are bit manipulation by definition — the rule guards against bitwise used where logical was meant, which is not what any of this is
/**
 * A minimal ZIP writer, stored rather than compressed.
 *
 * fal's LoRA trainer takes a dataset as one archive at a public URL, so the
 * images on a board have to become a zip somewhere. This is that somewhere, and
 * it is deliberately not a dependency: every file going in is a JPEG, PNG or
 * WebP, all of which are already compressed, so deflating them again would cost
 * CPU and save almost nothing. With compression off the format is small enough
 * to write correctly in one file.
 *
 * Stored entries (method 0) with no data descriptors, which is the simplest
 * shape every reader accepts.
 */

/** Table-driven CRC-32, the checksum ZIP requires for each entry. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) {
      c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
};

export interface ZipEntry {
  bytes: Uint8Array;
  name: string;
}

/** DOS time and date. Fixed, because a zip's mtimes are not information here. */
const DOS_TIME = 0;
// 1 January 1980, the epoch the format uses: bits 15-9 are the year since
// 1980, bits 8-5 the month, bits 4-0 the day. Written the other way round it
// produced a day of zero, which is not a date at all.
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

const LOCAL_HEADER = 0x04_03_4b_50;
const CENTRAL_HEADER = 0x02_01_4b_50;
const END_OF_DIRECTORY = 0x06_05_4b_50;

/**
 * Builds the archive.
 *
 * Everything is held in memory, which is the right trade here: a training set
 * is a few dozen images and the alternative — streaming — would mean giving up
 * the single Buffer the blob store wants anyway.
 */
export const zipSync = (entries: ZipEntry[]): Buffer => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.bytes);
    const crc = crc32(entry.bytes);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // method: stored
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42); // where the local header sits
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_DIRECTORY, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with the directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, directory, end]);
};
