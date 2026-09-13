const encoder = new TextEncoder();
export const STUDIO_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function base64url(bytes) {
  let value = '';
  for (let i = 0; i < bytes.length; i += 32768) value += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function keyedDigest(secret, purpose, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${purpose}\u0000${value}`));
  return base64url(new Uint8Array(signature));
}

export function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left || ''));
  const b = encoder.encode(String(right || ''));
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) mismatch |= (a[i] || 0) ^ (b[i] || 0);
  return mismatch === 0;
}

export function validStudioPassword(value) {
  return typeof value === 'string' && /^\d{4}$/.test(value);
}

export async function passwordDigest(password, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(`ssulpan-studio-v1\u0000${salt}`), iterations: 120000 },
    material,
    256,
  );
  return base64url(new Uint8Array(bits));
}

export async function createPasswordRecord(password) {
  if (!validStudioPassword(password)) throw new TypeError('studio password must contain four digits');
  const passwordSalt = base64url(crypto.getRandomValues(new Uint8Array(18)));
  const sessionVersion = base64url(crypto.getRandomValues(new Uint8Array(12)));
  return { passwordSalt, passwordDigest: await passwordDigest(password, passwordSalt), sessionVersion };
}

export async function issueStudioSession(secret, sessionVersion, now = Date.now()) {
  const expiresAt = now + STUDIO_SESSION_TTL_MS;
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(18)));
  const payload = `v1.${expiresAt}.${sessionVersion}.${nonce}`;
  const signature = await keyedDigest(secret, 'studio-session-v1', payload);
  return { token: `${payload}.${signature}`, expiresAt };
}

export async function verifyStudioSession(secret, token, sessionVersion, now = Date.now()) {
  const match = String(token || '').match(/^v1\.([0-9]{13})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{24})\.([A-Za-z0-9_-]{43})$/);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + STUDIO_SESSION_TTL_MS) return false;
  if (!constantTimeEqual(match[2], sessionVersion)) return false;
  const payload = `v1.${match[1]}.${match[2]}.${match[3]}`;
  const expected = await keyedDigest(secret, 'studio-session-v1', payload);
  return constantTimeEqual(match[4], expected);
}
