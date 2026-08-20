// Deletes a Cloudinary asset via its signed destroy endpoint. Cloudinary's
// unsigned upload preset (used everywhere else in this app, via
// uploadToCloudinary in helpers.js) has no delete equivalent — destroy
// requires a signature built from the API secret. There's no existing
// edge function for this (checked supabase/functions/ before writing this),
// and adding a new native/npm crypto dependency wasn't warranted for one
// SHA-1 call, so this is a small, self-contained SHA-1 implementation
// instead — verified against the standard "abc" test vector in
// scripts/verifyCloudinaryDelete.js before this was wired into anything.
import { CLOUDINARY_CONFIG } from '../config';

function sha1(message) {
  function rotl(n, s) { return (n << s) | (n >>> (32 - s)); }

  const utf8 = unescape(encodeURIComponent(message));
  const bytes = [];
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));

  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);

  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;

  for (let chunkStart = 0; chunkStart < bytes.length; chunkStart += 64) {
    const w = new Array(80).fill(0);
    for (let i = 0; i < 16; i++) {
      w[i] = (bytes[chunkStart + i * 4] << 24) |
             (bytes[chunkStart + i * 4 + 1] << 16) |
             (bytes[chunkStart + i * 4 + 2] << 8) |
             (bytes[chunkStart + i * 4 + 3]);
    }
    for (let i = 16; i < 80; i++) {
      w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }

      const temp = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = temp;
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4].map(h => h.toString(16).padStart(8, '0')).join('');
}

export function sha1Hex(message) {
  return sha1(message);
}

export async function deleteCloudinaryAsset(publicId, resourceType = 'image') {
  if (!publicId) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sha1(`public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_CONFIG.apiSecret}`);

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: CLOUDINARY_CONFIG.apiKey,
    signature,
  });

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/${resourceType}/destroy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json();
  if (data.result !== 'ok' && data.result !== 'not found') {
    throw new Error(data.error?.message || 'Cloudinary delete failed');
  }
}
