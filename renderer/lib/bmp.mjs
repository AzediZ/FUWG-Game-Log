// Minimal BMP reader for HOI4 map files (24-bit and 32-bit uncompressed, plus 8-bit paletted).
// Returns { width, height, rgb } where rgb is a top-down Uint8Array of width*height*3.
export function readBmp(buf) {
  if (buf[0] !== 0x42 || buf[1] !== 0x4d) throw new Error('Not a BMP file');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const dataOffset = dv.getUint32(10, true);
  const headerSize = dv.getUint32(14, true);
  const width = dv.getInt32(18, true);
  const rawHeight = dv.getInt32(22, true);
  const bpp = dv.getUint16(28, true);
  const compression = headerSize >= 40 ? dv.getUint32(30, true) : 0;
  if (compression !== 0 && compression !== 3) throw new Error(`Unsupported BMP compression ${compression}`);
  const height = Math.abs(rawHeight);
  const bottomUp = rawHeight > 0;
  const rowSize = Math.floor((bpp * width + 31) / 32) * 4;
  const rgb = new Uint8Array(width * height * 3);

  let palette = null;
  if (bpp === 8) {
    const colours = dv.getUint32(46, true) || 256;
    const palStart = 14 + headerSize;
    palette = new Uint8Array(colours * 3);
    for (let i = 0; i < colours; i++) {
      palette[i * 3] = buf[palStart + i * 4 + 2];
      palette[i * 3 + 1] = buf[palStart + i * 4 + 1];
      palette[i * 3 + 2] = buf[palStart + i * 4];
    }
  } else if (bpp !== 24 && bpp !== 32) {
    throw new Error(`Unsupported BMP bit depth ${bpp}`);
  }

  for (let y = 0; y < height; y++) {
    const srcRow = dataOffset + (bottomUp ? height - 1 - y : y) * rowSize;
    let o = y * width * 3;
    for (let x = 0; x < width; x++, o += 3) {
      if (bpp === 8) {
        const idx = buf[srcRow + x];
        rgb[o] = palette[idx * 3]; rgb[o + 1] = palette[idx * 3 + 1]; rgb[o + 2] = palette[idx * 3 + 2];
      } else {
        const s = srcRow + x * (bpp / 8);
        rgb[o] = buf[s + 2]; rgb[o + 1] = buf[s + 1]; rgb[o + 2] = buf[s];
      }
    }
  }
  return { width, height, rgb };
}

// 24-bit bottom-up BMP writer (used by the synthetic test-data generator).
export function writeBmp24(width, height, rgb) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const size = 54 + rowSize * height;
  const out = Buffer.alloc(size);
  out.write('BM', 0, 'ascii');
  out.writeUInt32LE(size, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(rowSize * height, 34);
  for (let y = 0; y < height; y++) {
    const dst = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 3;
      out[dst + x * 3] = rgb[s + 2];
      out[dst + x * 3 + 1] = rgb[s + 1];
      out[dst + x * 3 + 2] = rgb[s];
    }
  }
  return out;
}
