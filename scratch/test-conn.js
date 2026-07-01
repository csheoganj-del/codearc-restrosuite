const https = require('https');

console.log('Testing HTTPS connection to google.com...');
https.get('https://www.google.com', (res) => {
    console.log('Google connection SUCCESS! Status:', res.statusCode);
}).on('error', (err) => {
    console.error('Google connection FAILED:', err.message);
});

console.log('Testing HTTPS connection to web.whatsapp.com...');
https.get('https://web.whatsapp.com', (res) => {
    console.log('WhatsApp Web connection SUCCESS! Status:', res.statusCode);
}).on('error', (err) => {
    console.error('WhatsApp Web connection FAILED:', err.message);
});
