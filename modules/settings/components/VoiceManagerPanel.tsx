import React, { useState, useEffect } from 'react';
import { 
  LucideMic2, 
  LucidePlus, 
  LucideTrash2, 
  LucideCheckCircle2, 
  LucidePlay, 
  LucideAlertCircle,
  LucideLoader2,
  LucideFingerprint
} from 'lucide-react';
import { OrionPanel, OrionButton, OrionStatusBadge, OrionCard } from '@client/components/OrionUI';
import { Input } from '@ui/input';
import { useVoiceManagerStore, CustomVoice } from '@core/voice-runtime/state/useVoiceManagerStore';
import { useVoiceStore } from '@core/voice-runtime/state/useVoiceStore';
import { voiceRuntimeManager } from '@core/voice-runtime/VoiceRuntimeManager';
import { logger } from '@core/logger/Logger';
import { cn } from '@lib/utils';

export function VoiceManagerPanel() {
  const { customVoices, activeCustomVoiceId, addVoice, removeVoice, setActiveVoice } = useVoiceManagerStore();
  const { activeProfile, authority, setProfile } = useVoiceStore();
  
  const [newName, setNewName] = useState('');
  const [newVoiceId, setNewVoiceId] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

  const activeCustomVoice = customVoices.find(v => v.id === activeCustomVoiceId);
  const currentVoiceName = activeCustomVoice ? activeCustomVoice.name : activeProfile.name;
  const currentVoiceId = activeCustomVoice ? activeCustomVoice.voiceId : authority.activeVoiceId;

  // Sync VoiceManager active voice with VoiceStore
  useEffect(() => {
    if (activeCustomVoice && authority.activeVoiceId !== activeCustomVoice.voiceId) {
      logger.info('VOICE_MANAGER', `Syncing active voice to ${activeCustomVoice.name} (${activeCustomVoice.voiceId})`);
      setProfile(activeProfile, { voiceId: activeCustomVoice.voiceId, persistAsStable: true });
    }
  }, [activeCustomVoiceId]);

  const handleAddVoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName && newVoiceId) {
      addVoice(newName, newVoiceId);
      setNewName('');
      setNewVoiceId('');
    }
  };

  const handleSelectVoice = (voice: CustomVoice) => {
    setActiveVoice(voice.id);
    setProfile(activeProfile, { voiceId: voice.voiceId, persistAsStable: true });
  };

  const handleRemoveVoice = (id: string) => {
    removeVoice(id);
  };

  const handleTestVoice = async () => {
    if (isTesting) return;
    
    setIsTesting(true);
    setValidationStatus('validating');
    
    try {
      // Use existing speech pipeline infrastructure
      await voiceRuntimeManager.speak("Teste de áudio do sistema Orion. Validando configuração de voz ElevenLabs.");
      setValidationStatus('valid');
    } catch (err) {
      logger.error('VOICE_MANAGER', `Voice test failed: ${err}`);
      setValidationStatus('invalid');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* ACTIVE VOICE STATUS */}
      <OrionPanel title="Active_Voice_Engine">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className={cn(
              "p-4 rounded-2xl border transition-all duration-500",
              validationStatus === 'valid' ? "bg-primary/10 border-primary/20 text-primary" : "bg-white/5 border-white/10 text-neutral-500"
            )}>
              <LucideMic2 size={32} strokeWidth={1.5} />
            </div>
            <div className="space-y-1">
              <h4 className="text-xl font-display font-black text-white italic uppercase tracking-tighter">
                {currentVoiceName}
              </h4>
              <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                ID: {currentVoiceId}
                {validationStatus === 'valid' && <LucideCheckCircle2 size={12} className="text-primary" />}
                {validationStatus === 'invalid' && <LucideAlertCircle size={12} className="text-red-500" />}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <OrionStatusBadge 
              status={validationStatus === 'valid' ? 'operational' : validationStatus === 'invalid' ? 'critical' : 'recovery'} 
              label={validationStatus === 'valid' ? 'verified_nominal' : validationStatus === 'invalid' ? 'verification_failed' : 'pending_validation'} 
            />
            <OrionButton 
              variant="outline" 
              size="sm" 
              onClick={handleTestVoice}
              disabled={isTesting}
              className="h-10"
            >
              {isTesting ? <LucideLoader2 size={16} className="animate-spin mr-2" /> : <LucidePlay size={16} className="mr-2" />}
              TEST_AUDIO
            </OrionButton>
          </div>
        </div>
      </OrionPanel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* VOICE REPOSITORY */}
        <OrionPanel title="Voice_Repository">
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {/* DEFAULT VOICE */}
            <VoiceItem 
              name="Rachel (Orion Default)" 
              voiceId="eleven_rachel" 
              isActive={!activeCustomVoiceId} 
              onSelect={() => {
                setActiveVoice(null);
                setProfile(activeProfile, { voiceId: 'eleven_rachel', persistAsStable: true });
              }}
              isDefault
            />

            {customVoices.map((voice) => (
              <VoiceItem 
                key={voice.id}
                name={voice.name}
                voiceId={voice.voiceId}
                isActive={activeCustomVoiceId === voice.id}
                onSelect={() => handleSelectVoice(voice)}
                onRemove={() => handleRemoveVoice(voice.id)}
              />
            ))}

            {customVoices.length === 0 && (
              <div className="py-12 flex flex-col items-center justify-center text-neutral-600 space-y-3">
                <LucideFingerprint size={32} strokeWidth={1} className="opacity-20" />
                <p className="text-[10px] font-mono uppercase tracking-[0.2em]">No custom profiles detected</p>
              </div>
            )}
          </div>
        </OrionPanel>

        {/* ADD NEW PROFILE */}
        <OrionPanel title="Initialize_New_Profile">
          <form onSubmit={handleAddVoice} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest ml-1">Profile_Alias</label>
                <Input 
                  placeholder="EX: ORION_BETA_VOICE" 
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="bg-white/5 border-white/10 rounded-xl h-12 focus:border-primary/50 transition-all uppercase font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest ml-1">ElevenLabs_Voice_ID</label>
                <Input 
                  placeholder="EX: kxGXJuL3rT7BVU1BGnK4" 
                  value={newVoiceId}
                  onChange={(e) => setNewVoiceId(e.target.value)}
                  className="bg-white/5 border-white/10 rounded-xl h-12 focus:border-primary/50 transition-all font-mono text-xs"
                />
              </div>
            </div>
            
            <OrionButton 
              type="submit" 
              variant="primary" 
              className="w-full h-14 italic"
              disabled={!newName || !newVoiceId}
            >
              <LucidePlus size={20} className="mr-2" />
              INJECT_PROFILE
            </OrionButton>
          </form>
        </OrionPanel>
      </div>
    </div>
  );
}

function VoiceItem({ 
  name, 
  voiceId, 
  isActive, 
  onSelect, 
  onRemove,
  isDefault = false
}: { 
  name: string, 
  voiceId: string, 
  isActive: boolean, 
  onSelect: () => void, 
  onRemove?: () => void,
  isDefault?: boolean
}) {
  return (
    <div className={cn(
      "p-4 rounded-xl border transition-all group flex items-center justify-between",
      isActive ? "bg-primary/5 border-primary/30" : "bg-white/[0.02] border-white/5 hover:border-white/20"
    )}>
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-2 h-2 rounded-full",
          isActive ? "bg-primary animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.5)]" : "bg-neutral-800"
        )} />
        <div>
          <p className="text-xs font-display font-bold text-white uppercase tracking-wider">{name}</p>
          <p className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest truncate max-w-[150px]">{voiceId}</p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {!isActive && (
          <OrionButton variant="ghost" size="sm" onClick={onSelect} className="h-8 text-[9px]">
            SELECT
          </OrionButton>
        )}
        {isActive && (
          <span className="text-[9px] font-mono text-primary uppercase tracking-[0.2em] px-2">ACTIVE</span>
        )}
        {!isDefault && (
          <button 
            onClick={onRemove}
            className="p-2 text-neutral-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
          >
            <LucideTrash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
