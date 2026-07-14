const crypto = require('crypto');

const getKey = () => {
  const value = process.env.ENCRYPTION_KEY;
  if (!value) throw new Error('ENCRYPTION_KEY is not configured');

  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, 'hex');
  return crypto.createHash('sha256').update(value).digest();
};

const encrypt = (plainText) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

const decrypt = (payload) => {
  const [ivHex, tagHex, encryptedHex] = String(payload || '').split(':');
  if (!ivHex || !tagHex || !encryptedHex) throw new Error('Invalid encrypted value');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final()
  ]).toString('utf8');
};

module.exports = { encrypt, decrypt };
