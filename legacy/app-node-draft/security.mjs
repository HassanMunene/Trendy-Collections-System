import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 10) throw new Error('Password must have at least 10 characters');
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, encoded) {
  try {
    const [algorithm, saltHex, hashHex] = encoded.split(':');
    if (algorithm !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return timingSafeEqual(actual, expected);
  } catch { return false; }
}

export function sessionToken() { return randomBytes(32).toString('base64url'); }
export function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
