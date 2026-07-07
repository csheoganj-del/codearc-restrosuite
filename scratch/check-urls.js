const https = require('https');

const urls = [
  'https://restrosuite.codearc.co.in/',
  'https://restrosuite.codearc.co.in/index.html',
  'https://restrosuite.codearc.co.in/login.html',
  'https://restrosuite.codearc.co.in/home.html',
  'https://restrosuite.codearc.co.in/order.html',
  'https://restrosuite.codearc.co.in/qr-order.html',
  'https://restrosuite.codearc.co.in/tokens.html',
  'https://restrosuite.codearc.co.in/404.html',
  'https://restrosuite.codearc.co.in/styles.css',
  'https://restrosuite.codearc.co.in/dashboard-styles.css',
  'https://restrosuite.codearc.co.in/script.js',
  'https://restrosuite.codearc.co.in/pwa.js',
  'https://restrosuite.codearc.co.in/config.js',
  'https://restrosuite.codearc.co.in/assets/restrosuite.css',
  'https://restrosuite.codearc.co.in/assets/supabase-config.js',
  'https://restrosuite.codearc.co.in/assets/saas-core.js',
  'https://restrosuite.codearc.co.in/assets/db.js'
];

function checkUrl(url) {
  return new Promise((resolve) => {
    https.request(url, { method: 'HEAD' }, (res) => {
      resolve({ url, status: res.statusCode });
    }).on('error', (err) => {
      resolve({ url, status: 'ERROR: ' + err.message });
    }).end();
  });
}

async function main() {
  console.log('Checking URLs...');
  for (const url of urls) {
    const res = await checkUrl(url);
    console.log(`${res.url} -> ${res.status}`);
  }
}

main();
