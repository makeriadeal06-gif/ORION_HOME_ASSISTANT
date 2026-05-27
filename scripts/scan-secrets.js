#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Simple secrets scanner used by pre-commit and CI.
// By default scans staged files. Use --all to scan all tracked files.

function git(args) {
  return execSync(`git ${args}`, { encoding: 'utf8' }).trim();
}

function listFiles(all) {
  if (all) {
    return git('ls-files').split('\n').filter(Boolean);
  }
  // staged files
  try {
    return git('diff --cached --name-only --diff-filter=ACM').split('\n').filter(Boolean);
  } catch (e) {
    // fallback to all files if git command fails
    return git('ls-files').split('\n').filter(Boolean);
  }
}

const IGNORE_PATHS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'snapshots',
  '.next',
];

const PATTERNS = [
  { name: 'Private key header', re: /-----BEGIN (?:RSA |OPENSSH |)PRIVATE KEY-----/i },
  { name: 'Google service account JSON key', re: /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/i },
  { name: 'Service account JSON marker', re: /"type"\s*:\s*"service_account"/i },
  { name: 'Google API key (AIza)', re: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: 'Possible ElevenLabs API key (sk_)', re: /sk_[0-9a-zA-Z]{20,}/ },
  { name: 'AWS Access Key ID', re: /(?<![A-Z0-9])[A-Z0-9]{16}(?=\b)/ },
  { name: 'Generic secret assignment', re: /(?:api[_-]?key|secret|private_key|client_secret)\s*[=:\"]\s*[^\s\'\"]{8,}/i },
];

function shouldIgnore(file) {
  return IGNORE_PATHS.some(p => file.includes(p));
}

function scanFile(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const hits = [];
    for (const p of PATTERNS) {
      if (p.re.test(content)) hits.push(p.name);
    }
    return hits;
  } catch (e) {
    return [];
  }
}

function main() {
  const all = process.argv.includes('--all') || process.argv.includes('-a');
  const files = listFiles(all);
  const results = [];
  for (const f of files) {
    if (!f || shouldIgnore(f)) continue;
    // binary files can blow up, skip large files
    try {
      const stat = fs.statSync(f);
      if (stat.isDirectory()) continue;
      if (stat.size > 5 * 1024 * 1024) continue; // skip >5MB
    } catch (e) {
      continue;
    }
    const hits = scanFile(f);
    if (hits.length) results.push({ file: f, hits });
  }

  if (results.length) {
    console.error('\n[secret-scan] Potential secrets detected:');
    for (const r of results) {
      console.error(` - ${r.file}: ${r.hits.join(', ')}`);
    }
    console.error('\nAborting. Remove secrets from commits or use environment variables / secret storage.');
    process.exitCode = 1;
    return;
  }

  console.log('[secret-scan] No secrets detected.');
}

main();
