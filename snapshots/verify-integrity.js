/**
 * ORION - Cryptographic Integrity Verification Engine
 * Used to verify the architectural freeze status of core modules from Phase 14 to Phase 18.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// List of critical stabilized files subject to architectural freeze
const FROZEN_FILES = [
  'client/core/task-runtime/TaskIntentTiming.ts',
  'client/core/task-runtime/TaskRuntime.ts',
  'client/core/task-runtime/types.ts',
  'client/core/voice-runtime/VoiceRuntimeManager.ts',
  'client/core/voice-runtime/types.ts',
  'client/core/android-runtime/AndroidRuntimeManager.ts',
  'client/core/android-runtime/types.ts',
  'client/core/presence/PresenceRuntime.ts',
  'client/core/presence/types.ts',
  'client/core/environment-runtime/EnvironmentRuntime.ts',
  'client/core/environment-runtime/types.ts',
  'client/core/automation-runtime/AutomationAssetRegistry.ts',
  'client/core/automation-runtime/AutomationStore.ts',
  'client/core/automation-runtime/types.ts',
  'client/core/runtime/RuntimeIdentity.ts',
  'client/core/runtime/RuntimeManager.ts',
  'client/core/command-runtime/types.ts',
  'server/services/TriggerCMDService.ts'
];

const versionStatePath = path.join(__dirname, 'VERSION_STATE.json');

// Helper to compute MD5 hash of a file
function computeMD5(filePath) {
  const fullPath = path.join(projectRoot, filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(fullPath);
  const hash = crypto.createHash('md5');
  hash.update(content);
  return {
    hash: hash.digest('hex'),
    size: content.length
  };
}

// Function to generate the lock manifest
function writeLockManifest() {
  console.log('\n==================================================');
  console.log('🔒 ORION INTEGRITY SYSTEM: Generating Lock Manifest');
  console.log('==================================================\n');

  const fileMap = {};

  for (const file of FROZEN_FILES) {
    try {
      const { hash, size } = computeMD5(file);
      fileMap[file] = {
        path: file,
        expectedHash: hash,
        expectedSize: size,
        lastLockedAt: new Date().toISOString()
      };
      console.log(`✅ Locked file: ${file} [size: ${size}B, md5: ${hash.substring(0, 8)}...]`);
    } catch (error) {
      console.error(`❌ Failed to hash file ${file}:`, error.message);
    }
  }

  const manifest = {
    version: '0.1.0-freeze',
    phase: 'PHASE_18_STABLE',
    lockedAt: new Date().toISOString(),
    filesCount: Object.keys(fileMap).length,
    files: fileMap
  };

  fs.writeFileSync(versionStatePath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\n💾 Saved version state successfully to: ${versionStatePath}\n`);
}

// Function to verify current files against locked manifest
function verifyIntegrity() {
  console.log('\n==================================================');
  console.log('🔍 ORION INTEGRITY SYSTEM: Verifying Code Freeze');
  console.log('==================================================\n');

  if (!fs.existsSync(versionStatePath)) {
    console.error(`❌ Lock manifest not found at ${versionStatePath}`);
    console.error('Run "node snapshots/verify-integrity.js --lock" first to generate the baseline lock.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(versionStatePath, 'utf-8'));
  let violations = 0;
  let matches = 0;

  for (const [filePath, metadata] of Object.entries(manifest.files)) {
    const fullPath = path.join(projectRoot, filePath);
    
    if (!fs.existsSync(fullPath)) {
      console.error(`🚨 VIOLATION: Frozen file has been DELETED!`);
      console.error(`   File: ${filePath}`);
      violations++;
      continue;
    }

    const { hash, size } = computeMD5(filePath);

    if (hash !== metadata.expectedHash) {
      console.error(`🚨 VIOLATION: Frozen file has been MODIFIED!`);
      console.error(`   File: ${filePath}`);
      console.error(`   Expected MD5: ${metadata.expectedHash}`);
      console.error(`   Actual MD5:   ${hash}`);
      console.error(`   Expected Size: ${metadata.expectedSize}B`);
      console.error(`   Actual Size:   ${size}B`);
      violations++;
    } else {
      console.log(`❇️  VERIFIED: ${filePath} is intact.`);
      matches++;
    }
  }

  console.log('\n--------------------------------------------------');
  console.log(`📊 Integrity Check Summary:`);
  console.log(`   Total Monitored Files: ${Object.keys(manifest.files).length}`);
  console.log(`   Intact & Valid:        ${matches}`);
  console.log(`   Violations Detected:   ${violations}`);
  console.log('--------------------------------------------------\n');

  if (violations > 0) {
    console.error('❌ INTEGRITY CHECK FAILED: Structural modifications detected in stabilized systems!');
    process.exit(1);
  } else {
    console.log('💚 INTEGRITY CHECK PASSED: All architectural freezes are perfectly intact!');
    process.exit(0);
  }
}

// CLI Routing
const args = process.argv.slice(2);
if (args.includes('--lock')) {
  writeLockManifest();
} else {
  verifyIntegrity();
}
