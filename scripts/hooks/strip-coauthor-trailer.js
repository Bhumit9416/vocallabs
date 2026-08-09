#!/usr/bin/env node
/* Remove Co-authored-by trailers from commit message file (prepare-commit-msg hook). */
const fs = require('fs');
const file = process.argv[2];
if (!file) process.exit(0);
const text = fs.readFileSync(file, 'utf8');
const cleaned = text
  .split(/\r?\n/)
  .filter((line) => !/^Co-authored-by:/i.test(line))
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trimEnd();
fs.writeFileSync(file, cleaned ? `${cleaned}\n` : '');
process.exit(0);
