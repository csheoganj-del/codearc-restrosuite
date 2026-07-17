/**
 * Optional local ngrok helper for WhatsApp gateway development.
 *
 * Requires env:
 *   NGROK_DOMAIN  — reserved ngrok domain (e.g. your-subdomain.ngrok-free.dev)
 *   GATEWAY_PORT  — local gateway port (default 3000)
 *
 * Never hardcodes a free shared tunnel hostname.
 */
const { spawn } = require('child_process');

const domain = (process.env.NGROK_DOMAIN || process.env.NGROK_GATEWAY_DOMAIN || '').trim();
const port = String(process.env.GATEWAY_PORT || process.env.PORT || '3000').trim();

if (!domain) {
  console.error('[ngrok-service] Set NGROK_DOMAIN to your reserved ngrok hostname before starting.');
  console.error('Example: set NGROK_DOMAIN=your-name.ngrok-free.dev && node ngrok-service.js');
  process.exit(1);
}

console.log(`Starting Ngrok tunnel ${domain} → localhost:${port}`);

const ngrokProcess = spawn('npx', ['ngrok', 'http', port, `--domain=${domain}`], {
  shell: true,
  windowsHide: true,
});

ngrokProcess.stdout.on('data', (data) => {
  console.log(`[Ngrok STDOUT] ${data.toString().trim()}`);
});

ngrokProcess.stderr.on('data', (data) => {
  console.error(`[Ngrok STDERR] ${data.toString().trim()}`);
});

ngrokProcess.on('close', (code) => {
  console.log(`Ngrok tunnel process exited with code ${code}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Killing Ngrok tunnel...');
  ngrokProcess.kill();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Killing Ngrok tunnel...');
  ngrokProcess.kill();
  process.exit(0);
});
