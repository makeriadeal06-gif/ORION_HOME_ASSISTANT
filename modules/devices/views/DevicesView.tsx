import React from 'react';
import {
  LucideLightbulb,
  LucideThermometer,
  LucideShield,
  LucideTv,
  LucidePlus,
  LucideSearch
} from 'lucide-react';

import { Input } from '@ui/input';
import { Tabs, TabsList, TabsTrigger } from '@ui/tabs';

import { OrionDeviceTile, OrionButton } from '@client/components/OrionUI';
import DeviceCapabilityRenderer from '@client/components/DeviceCapabilityRenderer';

import { useDeviceStore } from '@core/google-home/state/useDeviceStore';

// sample devices are kept minimal; actual device inventory comes from google-home runtime device store
const devices = [
  { id: 'LIV_01', name: 'Living Room Light', type: 'LIGHT', room: 'LIVING', status: 'ON', value: '80%', battery: '94%' },
  { id: 'KIT_01', name: 'Kitchen Pendant', type: 'LIGHT', room: 'KITCHEN', status: 'OFF', value: '0%', battery: '82%' },
  { id: 'THR_01', name: 'Main Thermostat', type: 'CLIMATE', room: 'HALLWAY', status: 'AUTO', value: '22.5°C', battery: 'AC' },
  { id: 'ENT_01', name: 'Media Center', type: 'MEDIA', room: 'LIVING', status: 'IDLE', value: 'OFFLINE', battery: 'AC' },
];

export function DevicesView() {
  const deviceState = useDeviceStore();

  const runtimeDevices = Object.values(deviceState.devices || {});
  const list = runtimeDevices.length > 0 ? runtimeDevices : devices;

  const [selected, setSelected] = React.useState<string | null>(null);

  const [adding, setAdding] = React.useState(false);
  const [newId, setNewId] = React.useState('');
  const [newName, setNewName] = React.useState('');

  const [actionsOpen, setActionsOpen] = React.useState<string | null>(null);
  const [cooldowns, setCooldowns] = React.useState<Record<string, boolean>>({});
  const cooldownTimersRef = React.useRef<Record<string, number>>({});

  React.useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      Object.values(cooldownTimersRef.current).forEach(window.clearTimeout);
    };
  }, []);

  const triggerDeviceAction = (deviceId: string, fn?: () => void, duration = 2000) => {
    if (cooldowns[deviceId]) return;
    if (cooldownTimersRef.current[deviceId]) {
      window.clearTimeout(cooldownTimersRef.current[deviceId]);
    }

    setCooldowns(prev => ({ ...prev, [deviceId]: true }));
    try { fn && fn(); } catch (e) { /* noop */ }

    cooldownTimersRef.current[deviceId] = window.setTimeout(() => {
      setCooldowns(prev => { const next = { ...prev }; delete next[deviceId]; return next; });
      delete cooldownTimersRef.current[deviceId];
    }, duration);
  };

  return (
    <div className="space-y-12 pb-20">
      {/* HEADER HUD */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 px-4 lg:px-0">
        <div className="space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.5em] text-neutral-600">
            Infrastructure_Registry
          </p>

          <h1 className="text-3xl lg:text-5xl font-display font-black text-white italic tracking-tighter uppercase leading-tight">
            Device_Matrix
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          <div className="relative flex-1 sm:w-80 h-10 group">
            <LucideSearch
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-600 group-focus-within:text-primary transition-colors"
              size={14}
            />

            <Input
              placeholder="IDENTIFY_NODE_ID..."
              className="h-full bg-white/[0.03] border-white/5 rounded-lg pl-10 focus-visible:ring-primary/20 text-[10px] font-mono uppercase tracking-widest"
            />
          </div>

          <OrionButton
            variant="primary"
            size="icon"
            className="rounded-xl h-10 w-10"
            onClick={() => setAdding(true)}
          >
            <LucidePlus size={20} />
          </OrionButton>
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full px-2 lg:px-0">
        <div className="flex flex-col xl:flex-row justify-between items-center mb-10 border-b border-white/5 pb-6 gap-6">
          <TabsList className="bg-white/[0.02] border border-white/5 p-1 h-12 sm:h-10 rounded-xl overflow-x-auto overflow-y-hidden max-w-full no-scrollbar">
            <TabsTrigger
              value="all"
              className="rounded-lg px-4 sm:px-8 font-display text-[10px] uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-black"
            >
              All_Nodes
            </TabsTrigger>

            <TabsTrigger
              value="living"
              className="rounded-lg px-4 sm:px-8 font-display text-[10px] uppercase tracking-widest"
            >
              Living
            </TabsTrigger>

            <TabsTrigger
              value="kitchen"
              className="rounded-lg px-4 sm:px-8 font-display text-[10px] uppercase tracking-widest"
            >
              Kitchen
            </TabsTrigger>

            <TabsTrigger
              value="bedroom"
              className="rounded-lg px-4 sm:px-8 font-display text-[10px] uppercase tracking-widest"
            >
              Bedroom
            </TabsTrigger>
          </TabsList>

          <div className="hidden md:flex items-center gap-6 text-[9px] font-mono uppercase text-neutral-600 tracking-widest">
            <span>Total: {list.length}</span>

            <span>
              Online:{' '}
              {
                list.filter((d: any) =>
                  ['ON', 'LOCKED', 'AUTO'].includes(d.status)
                ).length
              }
            </span>

            <span>Mesh: Optimizing</span>
          </div>
        </div>

        {/* MATRIX GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {list.map((device: any) => (
            <div key={device.id} className="relative">
              <OrionDeviceTile
                name={device.name}
                type={`${device.id} // ${device.room || 'UNASSIGNED'}_DOMAIN`}
                status={device.status as any}
                value={
                  device.value ||
                  (device.traits
                    ? device.traits['brightness']?.value ?? ''
                    : '')
                }
                icon={
                  device.type === 'LIGHT'
                    ? LucideLightbulb
                    : device.type === 'THERMOSTAT'
                      ? LucideThermometer
                      : device.type === 'SECURITY'
                        ? LucideShield
                        : LucideTv
                }
                onClick={() =>
                  setSelected(selected === device.id ? null : device.id)
                }
              />

              {/* ACTION BUTTON */}
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() =>
                    setActionsOpen(
                      actionsOpen === device.id ? null : device.id
                    )
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-mono uppercase tracking-widest text-neutral-300 hover:bg-white/[0.06] transition-all"
                >
                  Device_Actions
                </button>
              </div>

              {/* CUSTOM DROPDOWN */}
              {actionsOpen === device.id && (
                <div className="absolute z-30 mt-2 w-full rounded-xl border border-white/10 bg-[#071018] backdrop-blur-xl shadow-2xl overflow-hidden">
                  <button
                    onClick={() => {
                      if (cooldowns[device.id]) return;
                      triggerDeviceAction(device.id, () => deviceState.connectDevice?.(device.id));
                      setActionsOpen(null);
                    }}
                    disabled={!!cooldowns[device.id]}
                    className={`w-full text-left px-4 py-3 ${cooldowns[device.id] ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/[0.05]'} text-sm transition-colors`}
                  >
                    Connect
                  </button>

                  <button
                    onClick={() => {
                      if (cooldowns[device.id]) return;
                      triggerDeviceAction(device.id, () => deviceState.disconnectDevice?.(device.id));
                      setActionsOpen(null);
                    }}
                    disabled={!!cooldowns[device.id]}
                    className={`w-full text-left px-4 py-3 ${cooldowns[device.id] ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/[0.05]'} text-sm transition-colors`}
                  >
                    Disconnect
                  </button>

                  <button
                    onClick={() => {
                      if (cooldowns[device.id]) return;
                      triggerDeviceAction(device.id, () => deviceState.markBluetooth?.(device.id, !device.bluetooth));
                      setActionsOpen(null);
                    }}
                    disabled={!!cooldowns[device.id]}
                    className={`w-full text-left px-4 py-3 ${cooldowns[device.id] ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/[0.05]'} text-sm transition-colors`}
                  >
                    Toggle Bluetooth
                  </button>

                  <button
                    onClick={() => {
                      if (cooldowns[device.id]) return;
                      triggerDeviceAction(device.id, () => deviceState.markWifi?.(device.id, device.wifi ? null : 'orion-wifi'));
                      setActionsOpen(null);
                    }}
                    disabled={!!cooldowns[device.id]}
                    className={`w-full text-left px-4 py-3 ${cooldowns[device.id] ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/[0.05]'} text-sm transition-colors`}
                  >
                    Toggle WiFi
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm('Remove device?')) {
                        deviceState.removeDevice?.(device.id);
                      }

                      setActionsOpen(null);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-red-500/10 text-red-400 text-sm transition-colors"
                  >
                    Remove Device
                  </button>
                </div>
              )}

              {/* CAPABILITY RENDER */}
              {selected === device.id && (
                <div className="mt-3">
                  <DeviceCapabilityRenderer device={device} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Tabs>

      {/* ADD DEVICE MODAL */}
      {adding && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="bg-[#071018] p-6 rounded-xl border border-white/5 w-96">
            <h3 className="text-lg font-semibold mb-4">
              Add Device (presentation-safe)
            </h3>

            <div className="mb-3">
              <input
                className="w-full p-2 bg-transparent border border-white/10 rounded"
                placeholder="Device ID"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <input
                className="w-full p-2 bg-transparent border border-white/10 rounded"
                placeholder="Device Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3">
              <OrionButton
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setNewId('');
                  setNewName('');
                }}
              >
                Cancel
              </OrionButton>

              <OrionButton
                variant="primary"
                onClick={() => {
                  if (!newId) {
                    return alert('Provide id');
                  }

                  deviceState.addDevice?.({
                    id: newId,
                    name: newName || newId,
                    type: 'UNKNOWN',
                    room: 'UNASSIGNED',
                    status: 'OFFLINE',
                  } as any);

                  setAdding(false);
                  setNewId('');
                  setNewName('');
                }}
              >
                Add
              </OrionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
