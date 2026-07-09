const crypto = require('crypto');

const target = '08d5d451bb6b879a6f602d4aff7202ba6f527a70792fa0e30ed944ebe90ec35a';

const passwords = [
  'password', '123456', '12345678', 'admin', 'claude', 'manager', 'cashier', 'waiter',
  'kitchen', 'qa-manager', 'qa-cashier', 'qa-waiter', 'qa-kitchen', 'qa-captain', 'qa-inventory',
  'claude-qa', 'test', 'restrosuite', 'pin', '1234', 'welcome', 'welcome123', 'qapassword',
  'qa-pass', 'qapass', 'doppio', 'doppiocl', 'doppiohc', 'claude-qa-kitchen', 'qa-owner',
  '12345', 'qwerty', 'letmein', 'pass123', 'staff', 'staff123', 'password123'
];

for (const p of passwords) {
  const hash = crypto.createHash('sha256').update(p).digest('hex');
  if (hash === target) {
    console.log(`FOUND IT! The password is: "${p}"`);
    process.exit(0);
  }
}

console.log("Not found in the simple list.");
