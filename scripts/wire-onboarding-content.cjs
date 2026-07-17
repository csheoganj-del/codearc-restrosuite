'use strict';
const fs = require('fs');
const path = require('path');

function wire(file, isMobile) {
  let t = fs.readFileSync(file, 'utf8');
  if (!t.includes('onboarding-content.cjs')) {
    t = t.replace(
      "'use strict';\n",
      "'use strict';\n\nconst { buildOnboardingContent } = require('./lib/onboarding-content.cjs');\n"
    );
  }

  const startMarker = '/** Ordered guide steps';
  const endMarker = 'function ensureDirs()';
  const si = t.indexOf(startMarker);
  const ei = t.indexOf(endMarker);
  if (si < 0 || ei < 0) throw new Error('markers not found in ' + file + ' ' + si + ' ' + ei);

  const inject =
    '/** Ordered guide steps — exhaustive client coverage from shared module */\n' +
    'const __OB = buildOnboardingContent({\n' +
    '  SUPPORT: SUPPORT,\n' +
    '  SITE: SITE,\n' +
    '  mobile: ' +
    isMobile +
    ',\n' +
    '});\n' +
    'const STEPS = __OB.STEPS;\n' +
    'const DETAIL = __OB.DETAIL;\n\n';

  t = t.slice(0, si) + inject + t.slice(ei);

  const detailStart = t.indexOf('/** Exhaustive control maps');
  if (detailStart >= 0) {
    const detailAssign = t.indexOf('const DETAIL = {', detailStart);
    if (detailAssign >= 0) {
      let i = detailAssign + 'const DETAIL = {'.length;
      let depth = 1;
      while (i < t.length && depth > 0) {
        if (t[i] === '{') depth++;
        else if (t[i] === '}') depth--;
        i++;
      }
      while (t[i] === ';' || t[i] === '\r' || t[i] === '\n' || t[i] === ' ') i++;
      t = t.slice(0, detailStart) + t.slice(i);
    }
  }

  // Remove leftover step() function if present before __OB
  t = t.replace(
    /function step\(def\) \{[\s\S]*?\n\}\n\n\/\/ ─── Discovery[\s\S]*?(?=\/\*\* Ordered guide steps)/,
    ''
  );

  fs.writeFileSync(file, t);
  console.log('wired', file);
}

wire(path.join(__dirname, 'generate-onboarding-guide.cjs'), false);
wire(path.join(__dirname, 'generate-onboarding-guide-mobile.cjs'), true);

const { buildOnboardingContent } = require('./lib/onboarding-content.cjs');
const d = buildOnboardingContent({ SUPPORT: 'x', SITE: 'y', mobile: false });
console.log('desktop steps', d.STEPS.length, 'detail', Object.keys(d.DETAIL).length);
console.log(
  'ids',
  d.STEPS.map((s) => s.id).join(', ')
);
