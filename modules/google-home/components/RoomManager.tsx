import React from 'react';
import { OrionCard, OrionPanel, OrionButton } from '@client/components/OrionUI';
import { useDeviceStore } from '@core/google-home/state/useDeviceStore';
import { LucidePlus, LucideEdit2, LucideTrash2, LucideSearch, LucideChevronLeft, LucideChevronRight } from 'lucide-react';

const STORAGE_KEY = 'orion_google_home_rooms_v1';
const BINDINGS_KEY = 'orion.googlehome.room.bindings';

type LocalRoom = { id: string; name: string; devices: string[] };
type LocalRoomsState = { rooms: Record<string, LocalRoom>; unassigned: string[]; lastUpdated: number };

function loadFromStorage(): LocalRoomsState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (e) {
    return null;
  }
}

function saveToStorage(state: LocalRoomsState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // ignore storage failures
  }
}

function makeId(prefix = 'r') {
  return `${prefix}_${Math.random().toString(36).substr(2, 8)}`;
}

function getDeviceIcon(type?: string) {
  switch (type) {
    case 'LIGHT': return '💡';
    case 'TV': return '📺';
    case 'SPEAKER': return '🔊';
    case 'OUTLET': return '⚡';
    case 'SENSOR': return '🌡️';
    default: return '🔧';
  }
}

export default function RoomManager() {
  const store = useDeviceStore();
  const devices = store.devices || {};
  const deviceList = Object.values(devices);

  // Initialize local rooms state from storage or runtime ecosystem (presentation-only)
  const [local, setLocal] = React.useState<LocalRoomsState>(() => {
    const saved = typeof window !== 'undefined' ? loadFromStorage() : null;
    if (saved) return saved;

    // Build initial rooms from runtime ecosystem (skip placeholders)
    const eco = store.ecosystem || { rooms: {}, unassigned: [] } as any;
    const rooms: Record<string, LocalRoom> = {};
    Object.values(eco.rooms || {}).forEach((r: any) => {
      const devs = (r.devices || []).filter((id: string) => devices[id]);
      const name = (r.name || '').toString();
      const skip = !name || name.toLowerCase().includes('placeholder') || devs.length === 0;
      if (!skip) rooms[r.id] = { id: r.id, name: name || r.id, devices: devs };
    });

    const assigned = new Set(Object.values(rooms).flatMap(x => x.devices));
    const unassigned = Object.keys(devices).filter(id => !assigned.has(id));

    const initial = { rooms, unassigned, lastUpdated: Date.now() };
    try { saveToStorage(initial); } catch (e) {}
    return initial;
  });

  // Sync read-only ecosystem mapping if needed
  React.useEffect(() => {
    try {
      store.syncEcosystem?.();
    } catch (e) {
      // noop
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ensure local state stays consistent with runtime devices: remove devices that no longer exist
  React.useEffect(() => {
    let changed = false;
    const newRooms = { ...local.rooms };
    Object.keys(newRooms).forEach(rid => {
      const before = newRooms[rid].devices.length;
      newRooms[rid].devices = newRooms[rid].devices.filter(id => devices[id]);
      if (newRooms[rid].devices.length !== before) changed = true;
    });
    const unassigned = local.unassigned.filter(id => devices[id]);
    if (unassigned.length !== local.unassigned.length) changed = true;

    // also, add newly discovered devices to unassigned
    const known = new Set(Object.values(newRooms).flatMap(r => r.devices).concat(unassigned));
    const newly = Object.keys(devices).filter(id => !known.has(id));
    if (newly.length > 0) {
      changed = true;
      unassigned.push(...newly);
    }

    if (changed) {
      const next = { rooms: newRooms, unassigned, lastUpdated: Date.now() };
      setLocal(next);
      saveToStorage(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.devices]);

  const createRoom = (name: string) => {
    if (!name || name.trim() === '') return;
    const id = makeId();
    const next = { ...local, rooms: { ...local.rooms, [id]: { id, name: name.trim(), devices: [] } }, lastUpdated: Date.now() };
    setLocal(next); saveToStorage(next);
  };

  const renameRoom = (id: string, name: string) => {
    const r = local.rooms[id]; if (!r) return;
    const nextRooms = { ...local.rooms, [id]: { ...r, name: name.trim() } };
    const next = { ...local, rooms: nextRooms, lastUpdated: Date.now() };
    setLocal(next); saveToStorage(next);
  };

  const deleteRoom = (id: string) => {
    const r = local.rooms[id]; if (!r) return;
    const nextRooms = { ...local.rooms }; delete nextRooms[id];
    const nextUnassigned = Array.from(new Set([...(local.unassigned || []), ...(r.devices || [])]));
    const next = { rooms: nextRooms, unassigned: nextUnassigned, lastUpdated: Date.now() };
    setLocal(next); saveToStorage(next);
  };

  const assignDevice = (deviceId: string, roomId: string) => {
    // remove from any room
    const nextRooms: Record<string, LocalRoom> = {};
    Object.entries(local.rooms).forEach(([rid, rm]) => {
      nextRooms[rid] = { ...rm, devices: rm.devices.filter(d => d !== deviceId) };
    });
    // remove from unassigned
    const nextUnassigned = local.unassigned.filter(d => d !== deviceId);
    if (!nextRooms[roomId]) return; // invalid
    nextRooms[roomId] = { ...nextRooms[roomId], devices: Array.from(new Set([...nextRooms[roomId].devices, deviceId])) };
    const next = { rooms: nextRooms, unassigned: nextUnassigned, lastUpdated: Date.now() };
    setLocal(next); saveToStorage(next);
  };

  const unassignDevice = (deviceId: string) => {
    const nextRooms: Record<string, LocalRoom> = {};
    Object.entries(local.rooms).forEach(([rid, rm]) => {
      nextRooms[rid] = { ...rm, devices: rm.devices.filter(d => d !== deviceId) };
    });
    const nextUnassigned = Array.from(new Set([...(local.unassigned || []), deviceId]));
    const next = { rooms: nextRooms, unassigned: nextUnassigned, lastUpdated: Date.now() };
    setLocal(next); saveToStorage(next);
  };

  // UI state
  const [newRoomName, setNewRoomName] = React.useState('');
  const [expandedRoom, setExpandedRoom] = React.useState<string | null>(null);
  const [editingRoom, setEditingRoom] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const pageSize = 10;

  const [bindings, setBindings] = React.useState<Record<string, { triggerId?: string; automationId?: string }>>(() => {
    try {
      const raw = localStorage.getItem(BINDINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  });

  const saveBinding = (roomId: string, payload: { triggerId?: string; automationId?: string }) => {
    const next = { ...(bindings || {}), [roomId]: { ...(bindings[roomId] || {}), ...payload } };
    setBindings(next);
    try { localStorage.setItem(BINDINGS_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
  };

  const roomEntries = Object.values(local.rooms).sort((a,b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-mono uppercase tracking-[0.4em] text-neutral-500">Rooms</h3>
          <span className="text-[10px] font-mono text-neutral-600">Local mapping (presentation-only)</span>
        </div>
        <div className="flex items-center gap-2">
          <input placeholder="New room name..." value={newRoomName} onChange={e => setNewRoomName(e.target.value)} className="bg-white/[0.02] p-2 rounded-md text-sm outline-none" />
          <OrionButton size="sm" variant="primary" onClick={() => { createRoom(newRoomName); setNewRoomName(''); }}> <LucidePlus size={14} /> Create</OrionButton>
          <OrionButton size="sm" variant="outline" onClick={() => { try { store.syncEcosystem?.(); } catch (e) {} }}>Refresh</OrionButton>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roomEntries.map(room => {
              const preview = room.devices.slice(0,4).map(id => devices[id]).filter(Boolean);
              const activeCount = (room.devices || []).filter(id => devices[id]?.status === 'ONLINE').length;
              return (
                <OrionCard key={room.id} className={`p-4 ${expandedRoom === room.id ? 'ring-2 ring-primary/20' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="font-display font-bold text-white">{room.name}</h4>
                        <span className="text-[10px] font-mono text-neutral-500">{room.devices.length} devices</span>
                        <span className="text-[10px] font-mono text-neutral-500">•</span>
                        <span className="text-[10px] font-mono text-neutral-400">{activeCount} online</span>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        {preview.map(d => (
                          <div key={d.id} className="text-[14px] p-1 rounded-md bg-white/[0.02] border border-white/5">{getDeviceIcon(d.type)}</div>
                        ))}
                        {room.devices.length > 4 && <div className="text-[12px] text-neutral-500">+{room.devices.length - 4}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <OrionButton size="sm" variant="outline" onClick={() => { setExpandedRoom(expandedRoom === room.id ? null : room.id); }}>Manage</OrionButton>
                      <OrionButton size="sm" variant="ghost" onClick={() => { setEditingRoom(room.id); setEditingName(room.name); }}><LucideEdit2 size={14} /></OrionButton>
                      <OrionButton size="sm" variant="destructive" onClick={() => deleteRoom(room.id)}><LucideTrash2 size={14} /></OrionButton>
                    </div>
                  </div>

                  {editingRoom === room.id && (
                    <div className="mt-3 flex gap-2">
                      <input value={editingName} onChange={e => setEditingName(e.target.value)} className="bg-white/[0.02] p-2 rounded-md text-sm outline-none w-full" />
                      <OrionButton size="sm" onClick={() => { renameRoom(room.id, editingName); setEditingRoom(null); }}>Save</OrionButton>
                      <OrionButton size="sm" variant="outline" onClick={() => setEditingRoom(null)}>Cancel</OrionButton>
                    </div>
                  )}

                  {expandedRoom === room.id && (
                    <div className="mt-4">
                      <div className="text-[12px] font-mono text-neutral-400 mb-2">Devices</div>
                      <div className="space-y-2">
                  {room.devices.map((did, idx) => {
                    const d = devices[did]; if (!d) return null;
                    return (
                      <div key={did} className="flex items-center justify-between p-2 rounded-md bg-white/[0.02]">
                              <div className="flex items-center gap-3">
                                <div className="text-[14px]">{getDeviceIcon(d.type)}</div>
                                <div>
                                  <div className="text-sm text-white">{d.name}</div>
                                  <div className="text-[10px] text-neutral-500">{d.status} • last {new Date(d.lastSeen).toLocaleTimeString()}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <OrionButton size="sm" variant="outline" onClick={() => unassignDevice(d.id)}>Unassign</OrionButton>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-4">
                        <div className="mb-4 p-3 rounded-md border border-white/5 bg-white/[0.01]">
                          <div className="text-[12px] font-mono text-neutral-400 mb-2">Room Bindings (presentation-only)</div>
                          <div className="flex items-center gap-2">
                            <input placeholder="Trigger ID" defaultValue={bindings[room.id]?.triggerId || ''} id={`trigger_${room.id}`} className="bg-transparent p-2 rounded border border-white/10 w-full" />
                            <OrionButton size="sm" onClick={() => { const v = (document.getElementById(`trigger_${room.id}`) as HTMLInputElement).value; saveBinding(room.id, { triggerId: v || undefined }); }}>Bind</OrionButton>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <input placeholder="Automation ID" defaultValue={bindings[room.id]?.automationId || ''} id={`automation_${room.id}`} className="bg-transparent p-2 rounded border border-white/10 w-full" />
                            <OrionButton size="sm" onClick={() => { const v = (document.getElementById(`automation_${room.id}`) as HTMLInputElement).value; saveBinding(room.id, { automationId: v || undefined }); }}>Bind</OrionButton>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </OrionCard>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <OrionPanel title={`Unassigned Devices (${local.unassigned.length})`} className="p-0">
            <div className="p-3 flex items-center gap-2">
              <LucideSearch />
              <input placeholder="search devices..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent outline-none w-full" />
            </div>
            <div className="max-h-[420px] overflow-y-auto p-3 space-y-2">
              {local.unassigned.length === 0 ? (
                <div className="text-[12px] text-neutral-500">No unassigned devices.</div>
              ) : (
                (() => {
                  const filtered = local.unassigned.filter(id => {
                    const d = devices[id]; if (!d) return false;
                    return `${d.name} ${d.type}`.toLowerCase().includes(search.toLowerCase());
                  });
                  const start = page * pageSize;
                  const pageItems = filtered.slice(start, start + pageSize);
                  return (
                    <div>
                      {pageItems.map(id => {
                        const d = devices[id]; if (!d) return null;
                        return (
                          <div key={id} className="flex items-center justify-between p-2 rounded-md bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                              <div className="text-[14px]">{getDeviceIcon(d.type)}</div>
                              <div>
                                <div className="text-sm text-white">{d.name}</div>
                                <div className="text-[10px] text-neutral-500">{d.status} • {d.type}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <select className="bg-transparent text-sm p-1 rounded-md" onChange={(e) => { const val = e.target.value; if (val === '') return; assignDevice(id, val); }} defaultValue="">
                                <option value="">Assign →</option>
                                {Object.values(local.rooms).map(r => (
                                  <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}

                      <div className="flex items-center justify-between mt-3">
                        <div className="text-[12px] text-neutral-500">Page {page+1} / {Math.max(1, Math.ceil(filtered.length / pageSize))}</div>
                        <div className="flex items-center gap-2">
                          <button className="p-2" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}><LucideChevronLeft /></button>
                          <button className="p-2" disabled={(page+1)*pageSize >= filtered.length} onClick={() => setPage(p => p + 1)}><LucideChevronRight /></button>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </OrionPanel>
        </div>
      </div>
    </div>
  );
}
