#!/usr/bin/env node
// Lightweight test script to validate Firestore read/write using firebase-admin.
// Behavior:
// - If FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT is present, uses it to initialize
//   firebase-admin and performs a write/read/delete cycle on collection 'triggercmd_configs_test'.
// - If FIRESTORE_EMULATOR_HOST is present, the script will connect to the emulator (no service account required).
// - Otherwise the script prints instructions and exits with code 0 (skipped).

async function main() {
  const keyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;

  if (!keyEnv && !emulator) {
    console.log('Firestore test skipped: no FIREBASE_SERVICE_ACCOUNT_JSON and no FIRESTORE_EMULATOR_HOST set.');
    console.log('To run the test against a real project set FIREBASE_SERVICE_ACCOUNT_JSON with the service account JSON.');
    console.log('Or run the Firestore emulator and set FIRESTORE_EMULATOR_HOST=localhost:8080');
    process.exit(0);
  }

  let admin;
  try {
    admin = require('firebase-admin');
  } catch (err) {
    console.error('firebase-admin not available. Please install dependencies (npm install).');
    process.exit(2);
  }

  try {
    if (keyEnv && !emulator) {
      // keyEnv may be raw JSON or a path
      let serviceAccount;
      if (keyEnv.trim().startsWith('{')) {
        serviceAccount = JSON.parse(keyEnv);
      } else {
        // treat as path
        const fs = require('fs');
        serviceAccount = JSON.parse(fs.readFileSync(keyEnv, 'utf8'));
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || process.env.GCLOUD_PROJECT
      });
      console.log('Initialized firebase-admin using provided service account.');
    } else if (emulator) {
      // Use emulator connection — require a project id to initialize
      const projectId = process.env.GCLOUD_PROJECT || process.env.FB_PROJECT_ID || 'orion-home-assistant-emulator';
      process.env.FIRESTORE_EMULATOR_HOST = emulator;
      admin.initializeApp({ projectId });
      console.log('Initialized firebase-admin to connect to emulator at', emulator);
    }

    const db = admin.firestore();
    const testCol = db.collection('triggercmd_configs_test');
    const docId = `orion_auto_test_${Date.now()}`;
    const docRef = testCol.doc(docId);
    console.log('Writing test document', docId);
    await docRef.set({ test: true, ts: Date.now() });

    console.log('Reading back document', docId);
    const snap = await docRef.get();
    if (!snap.exists) throw new Error('Document not found after write');
    const data = snap.data();
    console.log('Read data:', data);

    console.log('Deleting test document', docId);
    await docRef.delete();

    console.log('Firestore read/write test succeeded');
    process.exit(0);
  } catch (err) {
    console.error('Firestore test failed:', err);
    process.exit(3);
  }
}

main();
