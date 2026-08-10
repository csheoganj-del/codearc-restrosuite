const { ESLint } = require('eslint');

(async function main() {
  const eslint = new ESLint();
  const results = await eslint.lintFiles(['assets/modules/**/*.js']);

  console.log('=== DETAILED ERROR BREAKDOWN ===\n');

  results.forEach(f => {
    const errors = f.messages.filter(m => m.severity === 2);
    if (errors.length === 0) return;
    const fname = f.filePath.split(/[\\/]/).pop();
    console.log(`\n--- ${fname} (${errors.length} errors) ---`);
    errors.forEach(m => {
      console.log(`  L${m.line}:${m.column}  ${m.ruleId}  ${m.message.split('\n')[0]}`);
    });
  });
})();
