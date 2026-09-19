const { randomBytes, scrypt, pbkdf2, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(scrypt);
const legacyDerive = promisify(pbkdf2);
const options = { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
function validPassword(value) {
  return typeof value === 'string' && value.length >= 10 && value.length <= 128 && value.trim().length >= 10;
}
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, options);
  return `scrypt-v1$${salt}$${key.toString('hex')}`;
}
async function verifyPassword(password, encoded = '') {
  if (/^120000:[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded)) {
    const [, salt, hash] = encoded.split(':');
    const actual = await legacyDerive(password, salt, 120000, 64, 'sha512');
    return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
  }
  const [format, salt, hash] = encoded.split('$');
  const valid = format === 'scrypt-v1' && /^[a-f0-9]{32}$/.test(salt || '') && /^[a-f0-9]{128}$/.test(hash || '');
  // Perform the same expensive work for an unknown account or unset password.
  const actual = await derive(password, valid ? salt : '0'.repeat(32), 64, options);
  const expected = Buffer.from(valid ? hash : '0'.repeat(128), 'hex');
  return timingSafeEqual(actual, expected) && valid;
}
function loginPhone(value) {
  if (typeof value !== 'string') return '';
  const phone = value.trim().replace(/[\s()-]/g, '');
  const normalized = /^[6-9]\d{9}$/.test(phone) ? '+91' + phone : phone;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : '';
}
module.exports = { validPassword, hashPassword, verifyPassword, loginPhone };
