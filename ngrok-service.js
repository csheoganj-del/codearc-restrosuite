const { spawn } = require('child_process');

console.log("Starting Ngrok tunnel to goldsmith-finalist-guise.ngrok-free.dev on port 3000 (SILENT MODE)...");

// Use spawn with windowsHide: true to completely hide the cmd window on Windows!
const ngrokProcess = spawn('npx', ['ngrok', 'http', '3000', '--domain=goldsmith-finalist-guise.ngrok-free.dev'], {
    shell: true,
    windowsHide: true
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
