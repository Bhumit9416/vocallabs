#!/usr/bin/env node
/* Rewrite commit messages: drop Co-authored-by trailers. */
const fs = require('fs');
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { data += c; });
process.stdin.on('end', () => {
  const out = data
    .split(/\r?\n/)
    .filter((line) => !/^Co-authored-by:/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
  process.stdout.write(out ? `${out}\n` : '');
});
