const { ESLint } = require('eslint');

(async function main() {
  const eslint = new ESLint();
  const results = await eslint.lintFiles(['assets/modules/**/*.js']);

  let totalErrors = 0;
  let totalWarnings = 0;
  const errorTypes = {};
  const filesWithErrors = [];

  results.forEach(f => {
    totalErrors += f.errorCount;
    totalWarnings += f.warningCount;
    f.messages.forEach(m => {
      if (m.severity === 2) {
        const key = m.ruleId || 'fatal';
        errorTypes[key] = (errorTypes[key] || 0) + 1;
      }
    });
    if (f.errorCount > 0 || f.warningCount > 0) {
      const fname = f.filePath.split(/[\\/]/).pop();
      filesWithErrors.push({ file: fname, errors: f.errorCount, warnings: f.warningCount });
    }
  });

  console.log('=== TOTAL ===');
  console.log('Errors:', totalErrors);
  console.log('Warnings:', totalWarnings);
  console.log('');
  console.log('=== ERROR COUNT BY RULE ===');
  Object.entries(errorTypes).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(k + ':', v));
  console.log('');
  console.log('=== FILES WITH ISSUES ===');
  filesWithErrors.forEach(f => console.log(f.file + ': errors=' + f.errors + ', warnings=' + f.warnings));
})();
