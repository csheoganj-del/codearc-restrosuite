#!/usr/bin/env node
'use strict';

const expectedBuildId = String(
  process.env.EXPECTED_BUILD_ID || process.env.GITHUB_SHA || ''
).trim();
const feedUrl = String(
  process.env.PRODUCTION_UPDATE_URL ||
    'https://restrosuite.codearc.co.in/app-update.json'
).trim();
const timeoutMs = Number(process.env.DEPLOY_VERIFY_TIMEOUT_MS || 10 * 60 * 1000);
const pollMs = Number(process.env.DEPLOY_VERIFY_POLL_MS || 15 * 1000);

if (!expectedBuildId) {
  console.error('[verify-production] EXPECTED_BUILD_ID is required');
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const deadline = Date.now() + timeoutMs;
  let last = 'no response';

  while (Date.now() < deadline) {
    try {
      const separator = feedUrl.includes('?') ? '&' : '?';
      const response = await fetch(feedUrl + separator + 'v=' + Date.now(), {
        headers: { 'cache-control': 'no-cache' },
      });
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }

      const feed = await response.json();
      const liveBuildId = String(feed.buildId || '').trim();
      last = 'version=' + String(feed.version || 'unknown') + ' buildId=' + (liveBuildId || 'missing');
      console.log('[verify-production]', last);

      if (liveBuildId === expectedBuildId) {
        console.log('[verify-production] production is live for ' + expectedBuildId);
        return;
      }
    } catch (error) {
      last = String(error && error.message ? error.message : error);
      console.warn('[verify-production] waiting:', last);
    }

    await sleep(pollMs);
  }

  throw new Error(
    'Production did not publish build ' + expectedBuildId +
      ' within ' + timeoutMs + 'ms; last observation: ' + last
  );
}

main().catch((error) => {
  console.error('[verify-production]', error.message || error);
  process.exit(1);
});
