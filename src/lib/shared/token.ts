export function generateOpaqueToken(length = 48): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    // Node.js
    const { randomBytes } = require('crypto');
    const b: Buffer = randomBytes(length);
    for (let i = 0; i < length; i++) bytes[i] = b[i] as unknown as number;
  }
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}



