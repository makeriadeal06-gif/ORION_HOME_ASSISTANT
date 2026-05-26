import { VoiceProfile } from '../types';
import { logger } from '../../logger/Logger';

export class VoiceProfileManager {
  private static instance: VoiceProfileManager;
  private profiles: Map<string, VoiceProfile> = new Map();
  private defaultProfile: VoiceProfile = {
    id: 'eleven_rachel',
    name: 'Rachel (ElevenLabs)',
    pitch: 1.0,
    rate: 0.96,
    provider: 'elevenlabs'
  };

  private constructor() {
    this.registerProfile(this.defaultProfile);
    
    // Register some preset profiles
    this.registerProfile({
      id: 'aurora',
      name: 'Aurora Soft',
      pitch: 1.1,
      rate: 0.93,
      provider: 'browser'
    });
  }

  public static getInstance(): VoiceProfileManager {
    if (!VoiceProfileManager.instance) {
      VoiceProfileManager.instance = new VoiceProfileManager();
    }
    return VoiceProfileManager.instance;
  }

  public registerProfile(profile: VoiceProfile) {
    this.profiles.set(profile.id, profile);
    logger.trace('VOICE_PROFILE', `Registered profile: ${profile.name} (${profile.id})`);
  }

  public getProfile(id: string): VoiceProfile {
    const profile = this.profiles.get(id);
    if (!profile) {
      logger.warn('VOICE_PROFILE', `Requested profile "${id}" not found. Falling back to default.`);
      return this.defaultProfile;
    }
    return profile;
  }

  public listProfiles(): VoiceProfile[] {
    return Array.from(this.profiles.values());
  }

  public getDefaultProfile(): VoiceProfile {
    return this.defaultProfile;
  }
}

export const voiceProfileManager = VoiceProfileManager.getInstance();
