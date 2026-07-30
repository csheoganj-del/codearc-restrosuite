'use strict';

const autocannon = require('autocannon');

function hasFlag(name) {
  return process.argv.includes(name);
}

function pickArg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) { return ''; }
  return process.argv[i + 1] || '';
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const url = pickArg('--url') || process.env.LOADTEST_URL || process.env.E2E_BASE_URL || '';
  if (!url) {
    process.stderr.write('Missing URL. Provide --url or LOADTEST_URL/E2E_BASE_URL.\n');
    process.exit(2);
  }

  const confirm = hasFlag('--confirm') || process.env.LOADTEST_CONFIRM === '1';
  if (!confirm) {
    process.stderr.write('Refusing to run without confirmation. Pass --confirm or set LOADTEST_CONFIRM=1.\n');
    process.exit(2);
  }

  const connections = num(pickArg('--connections') || process.env.LOADTEST_CONNECTIONS, 25);
  const duration = num(pickArg('--duration') || process.env.LOADTEST_DURATION, 20);
  const pipelining = num(pickArg('--pipelining') || process.env.LOADTEST_PIPELINING, 1);
  const timeout = num(pickArg('--timeout') || process.env.LOADTEST_TIMEOUT, 10);

  const maxP99 = num(process.env.MAX_P99_MS, 1500);
  const minRps = num(process.env.MIN_RPS, 0);

  process.stdout.write(
    `Load test: ${url}\n` +
    `connections=${connections} duration=${duration}s pipelining=${pipelining} timeout=${timeout}s\n`
  );

  const result = await new Promise((resolve, reject) => {
    const inst = autocannon(
      {
        url,
        connections,
        duration,
        pipelining,
        timeout,
        headers: {
          'user-agent': 'restrosuite-loadtest/1.0',
          'accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
        },
      },
      (err, res) => {
        if (err) { reject(err); }
        else { resolve(res); }
      }
    );
    autocannon.track(inst, { renderProgressBar: true });
  });

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');

  const fails = [];
  if (result.errors && result.errors > 0) { fails.push(`errors=${result.errors}`); }
  if (result.non2xx && result.non2xx > 0) { fails.push(`non2xx=${result.non2xx}`); }
  if (result.latency && Number.isFinite(result.latency.p99) && result.latency.p99 > maxP99) {
    fails.push(`p99=${Math.round(result.latency.p99)}ms > ${maxP99}ms`);
  }
  if (minRps > 0 && result.requests && Number.isFinite(result.requests.average) && result.requests.average < minRps) {
    fails.push(`rps=${Math.round(result.requests.average)} < ${minRps}`);
  }

  if (fails.length) {
    process.stderr.write('Load test gate failed:\n' + fails.map((f) => ' - ' + f).join('\n') + '\n');
    process.exit(1);
  }
}

main().catch((e) => {
  process.stderr.write((e && e.stack) ? e.stack + '\n' : String(e) + '\n');
  process.exit(1);
});
