const crypto = require('crypto');

const HASH_PREFIX = 'scrypt';

function pbkdf(input, salt) {
  return crypto.scryptSync(input, salt, 64).toString('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = pbkdf(password, salt);
  return `${HASH_PREFIX}$${salt}$${hash}`;
}

function verifyPassword(password, storedValue) {
  if (typeof storedValue !== 'string' || !storedValue) {
    return false;
  }

  if (!storedValue.startsWith(`${HASH_PREFIX}$`)) {
    return storedValue === password;
  }

  const [, salt, originalHash] = storedValue.split('$');

  if (!salt || !originalHash) {
    return false;
  }

  const candidateHash = pbkdf(password, salt);
  return crypto.timingSafeEqual(
    Buffer.from(originalHash, 'hex'),
    Buffer.from(candidateHash, 'hex')
  );
}

module.exports = {
  hashPassword,
  verifyPassword
};
