const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('WA Ads sends a validated real image with each personalized caption', () => {
  const ads = read('assets/modules/sa-ads-portal.js');
  const admin = read('supabase/functions/tenant-admin/index.ts');
  const gateway = read('whatsapp-gateway.js');

  assert.match(ads, /accept = 'image\/jpeg,image\/png/);
  assert.match(ads, /imageData: image && image\.data/);
  assert.match(ads, /await sendOne\(row\.phone, body, imagePayload\)/);
  assert.match(admin, /imageData,[\s\S]*imageMime,[\s\S]*imageFilename/);
  assert.match(gateway, /function decodeCampaignImage/);
  assert.match(gateway, /Only real JPG and PNG image files are supported/);
  assert.match(gateway, /image: imagePayload\.buffer/);
  assert.match(gateway, /caption: textOut \|\| undefined/);
  assert.match(gateway, /deliveredType = imagePayload \? 'image' : 'text'/);
});
