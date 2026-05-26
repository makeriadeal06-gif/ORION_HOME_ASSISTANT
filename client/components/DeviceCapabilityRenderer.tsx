import React from 'react';
import { OrionButton, OrionCard } from './OrionUI';
import { LucideSpeaker, LucideTv, LucideLightbulb, LucideSliders } from 'lucide-react';
import { SecureCommandPipeline } from '@core/command-runtime/pipeline/SecureCommandPipeline';
import { OrionDevice } from '@core/google-home/types';

export function DeviceCapabilityRenderer({ device }: { device: OrionDevice }) {
  // Capability-driven rendering (presentation only)
  const onToggle = async () => {
    try {
      await SecureCommandPipeline.execute(1 as any, device.id, 'TOGGLE_STATE');
    } catch (e) {
      // best-effort UI feedback
      // eslint-disable-next-line no-console
      console.error('command failed', e);
    }
  };

  if (!device) return null;

  switch (device.type) {
    case 'TV':
      return (
        <OrionCard className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LucideTv size={20} />
              <div>
                <div className="text-sm font-display font-bold">{device.name}</div>
                <div className="text-[10px] text-neutral-500">Media device • {device.activity}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <OrionButton variant="outline" size="sm" onClick={() => SecureCommandPipeline.execute(1 as any, device.id, 'MEDIA_PLAY')}>Play</OrionButton>
              <OrionButton variant="secondary" size="sm" onClick={() => SecureCommandPipeline.execute(1 as any, device.id, 'MEDIA_PAUSE')}>Pause</OrionButton>
            </div>
          </div>
        </OrionCard>
      );
    case 'SPEAKER':
      return (
        <OrionCard className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LucideSpeaker size={20} />
              <div>
                <div className="text-sm font-display font-bold">{device.name}</div>
                <div className="text-[10px] text-neutral-500">Speaker • {device.activity}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <OrionButton variant="outline" size="sm" onClick={() => SecureCommandPipeline.execute(1 as any, device.id, 'VOLUME_DOWN')}>-</OrionButton>
              <OrionButton variant="outline" size="sm" onClick={() => SecureCommandPipeline.execute(1 as any, device.id, 'VOLUME_UP')}>+</OrionButton>
            </div>
          </div>
        </OrionCard>
      );
    case 'LIGHT':
      return (
        <OrionCard className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LucideLightbulb size={20} />
              <div>
                <div className="text-sm font-display font-bold">{device.name}</div>
                <div className="text-[10px] text-neutral-500">Light • {device.activity}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <OrionButton variant="outline" size="sm" onClick={onToggle}>Toggle</OrionButton>
              <OrionButton variant="ghost" size="sm" onClick={() => SecureCommandPipeline.execute(1 as any, device.id, 'BRIGHTNESS_UP')}>Bright +</OrionButton>
            </div>
          </div>
        </OrionCard>
      );
    default:
      return (
        <OrionCard className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LucideSliders size={20} />
              <div>
                <div className="text-sm font-display font-bold">{device.name}</div>
                <div className="text-[10px] text-neutral-500">{device.type} • {device.activity}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <OrionButton variant="outline" size="sm" onClick={() => SecureCommandPipeline.execute(1 as any, device.id, 'INSPECT')}>Inspect</OrionButton>
            </div>
          </div>
        </OrionCard>
      );
  }
}

export default DeviceCapabilityRenderer;
