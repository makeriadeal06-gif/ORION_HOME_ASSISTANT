import { triggerCmdService } from './server/services/TriggerCMDService.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  console.log('Initializing TriggerCMDService...');
  
  // mock io to avoid socket errors
  const mockIo = {
    to: () => ({ emit: () => {} }),
    on: () => {}
  } as any;

  triggerCmdService.init(mockIo);
  
  // Give it a moment to load configs from firebase
  console.log('Waiting for configs to load...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const userId = 'TkOA4D6sywhUn5OfHE9w0IIYbTG2';
  const deviceId = '6a0fb439b09782001469aff6';
  
  const config = triggerCmdService.getUserConfigRaw(userId);
  if (!config) {
    console.error('Config not found for user', userId);
    process.exit(1);
  }

  console.log('Config loaded. Syncing devices...');
  await triggerCmdService.syncUserDevices(userId);

  console.log('Executing for user...');
  try {
    const result = triggerCmdService.executeForUser(userId, deviceId);
    console.log('Execution result:', result);
  } catch(e) {
    console.error('Execute error:', e);
  }

  // Wait for the async executeRemoteWithToken to finish and print logs
  await new Promise(resolve => setTimeout(resolve, 5000));
  process.exit(0);
}

run();
