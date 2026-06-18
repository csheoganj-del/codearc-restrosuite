const { pbkdf2Sync, randomBytes } = require('node:crypto');

const password = process.argv[2] || '';
if (password.length < 14) {
  console.error('Provide a superadmin password of at least 14 characters.');
  process.exit(1);
}

const iterations = 210000;
const salt = randomBytes(18).toString('base64url');
const derived = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64url');
console.log(`pbkdf2$${iterations}$${salt}$${derived}`);
