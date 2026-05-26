import React, { useState, useEffect, useCallback } from 'react';
import {
  LucideTerminal, LucidePlay, LucideCommand, LucideSave,
  LucideRefreshCw, LucideKey, LucideShield, LucideInfo,
  LucideCheckCircle2, LucideXCircle, LucideAlertCircle, LucideLoader2,
  LucidePlugZap, LucidePlug
} from 'lucide-react';
import { OrionCard, OrionPanel, OrionButton, OrionStatusBadge } from '@client/components/OrionUI';
import { Input } from '@ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerManager, TriggerDevice, BridgeConnectionStatus } from '@core/runtime/TriggerManager';
import { useAuthStore } from '@core/state/stores/useAuthStore';
import { cn } from '@lib/utils';

const STATUS_META: Record<BridgeConnectionStatus, { label: string; color: string; dot: string }> = {
  connected:       { label: 'connected',     color: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10', dot: 'bg-emerald-500' },
  disconnected:   { label: 'disconnected',   color: 'text-red-500 border-red-500/20 bg-red-500/10',             dot: 'bg-red-500' },
  syncing:         { label: 'syncing',        color: 'text-amber-500 border-amber-500/20 bg-amber-500/10',         dot: 'bg-amber-500' },
  invalid_token:   { label: 'invalid token',  color: 'text-red-500 border-red-500/20 bg-red-500/10',             dot: 'bg-red-500' },
  no_token:        { label: 'no token',       color: 'text-neutral-500 border-neutral-500/20 bg-neutral-500/10',   dot: 'bg-neutral-500' },
};

export function TriggerCMDView() {
  const [devices, setDevices] = useState<TriggerDevice[]>([]);
  const [status, setStatus] = useState<BridgeConnectionStatus>('no_token');
  const [token, setToken] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(true);
  const [hasSavedToken, setHasSavedToken] = useState(false);
  const syncResultTimerRef = React.useRef<number | null>(null);

  const authUser = useAuthStore((s) => s.user);

  useEffect(() => {
    const unsubDevices = triggerManager.subscribe((newDevices) => {
      console.log('[TRIGGER_UI_STATE] devices_hydrated count=' + newDevices.length);
      setDevices(newDevices);
    });
    const unsubStatus = triggerManager.subscribeStatus((newStatus) => {
      console.log('[TRIGGER_UI_STATE] status_changed status=' + newStatus);
      setStatus(newStatus);
    });

    return () => {
      unsubDevices();
      unsubStatus();
      if (syncResultTimerRef.current) {
        window.clearTimeout(syncResultTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    console.log('[TRIGGER_HYDRATE] mount authUser=' + (authUser ? authUser.uid : 'null'));
    if (authUser) {
      console.log('[TRIGGER_HYDRATE] loading persisted config userId=' + authUser.uid);
      triggerManager.loadConfig().then((cfg) => {
        const hasToken = Boolean(cfg?.hasToken);
        console.log('[TRIGGER_HYDRATE] config received hasToken=' + hasToken + ' endpoint=' + (cfg?.endpoint || 'none'));
        setHasSavedToken(hasToken);
        if (cfg?.endpoint) {
          console.log('[TRIGGER_HYDRATE] applying hydrated state endpoint=' + cfg.endpoint);
          setEndpoint(cfg.endpoint);
        }
        if (hasToken) {
          setShowConfig(false);
          // Auto-sync on page load with saved token
          console.log('[TRIGGER_HYDRATE] auto-syncing on page load');
          triggerManager.syncDevices().then((result) => {
            console.log('[TRIGGER_HYDRATE] auto-sync result success=' + result.success + ' count=' + result.count + ' status=' + result.status);
            if (result.success) {
              setSyncResult('synced_' + result.count);
            } else {
              setSyncResult(result.status);
            }
            scheduleClearSyncResult(5000);
          });
        }
        console.log('[TRIGGER_HYDRATE] render completed token_length=' + token.length + ' showConfig=' + showConfig);
      });
    }
  }, [authUser?.uid]);

  const handleSave = useCallback(async () => {
    if (!token.trim()) return;
    console.log('[TRIGGER_SAVE] save_clicked token_length=' + token.length + ' endpoint=' + (endpoint || 'default'));
    setSaving(true);
    const ok = await triggerManager.saveConfig(token.trim(), endpoint.trim() || undefined);
    if (!ok) {
      setSaving(false);
      console.log('[TRIGGER_SAVE] save_failed');
      setSyncResult('save_failed');
      scheduleClearSyncResult(3000);
      return;
    }
    console.log('[TRIGGER_SAVE] save_completed persisted hasToken=true');
    setHasSavedToken(true);
    setToken('');
    setShowConfig(false);
    // Auto-sync immediately after save
    console.log('[TRIGGER_SAVE] auto-syncing after save');
    const result = await triggerManager.syncDevices();
    setSaving(false);
    console.log('[TRIGGER_SAVE] auto-sync result success=' + result.success + ' count=' + result.count + ' status=' + result.status);
    if (result.success) {
      setSyncResult('synced_' + result.count);
    } else {
      setSyncResult(result.status);
    }
    scheduleClearSyncResult(5000);
  }, [token, endpoint]);

  const handleSync = useCallback(async () => {
    console.log('[TRIGGER_SAVE] sync_clicked userId=' + triggerManager.getUserId());
    setSyncResult(null);
    const result = await triggerManager.syncDevices();
    console.log('[TRIGGER_SAVE] sync_result success=' + result.success + ' count=' + result.count + ' status=' + result.status);
    if (result.success) {
      setSyncResult(`synced_${result.count}`);
    } else {
      setSyncResult(result.status);
    }
    scheduleClearSyncResult(5000);
  }, []);

  const handleRun = useCallback((id: string) => {
    triggerManager.execute(id);
  }, []);

  const scheduleClearSyncResult = useCallback((delayMs: number) => {
    if (syncResultTimerRef.current) {
      window.clearTimeout(syncResultTimerRef.current);
    }
    syncResultTimerRef.current = window.setTimeout(() => {
      setSyncResult(null);
      syncResultTimerRef.current = null;
    }, delayMs);
  }, []);

  const meta = STATUS_META[status];

  const renderSyncResult = () => {
    if (!syncResult) return null;
    if (syncResult === 'config_saved') {
      return (
        <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-500 uppercase tracking-widest">
          <LucideCheckCircle2 size={12} />
          Configuration saved
        </div>
      );
    }
    if (syncResult.startsWith('synced_')) {
      const count = syncResult.split('_')[1];
      return (
        <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-500 uppercase tracking-widest">
          <LucideCheckCircle2 size={12} />
          Synced {count} devices
        </div>
      );
    }
    if (syncResult === 'no_token') {
      return (
        <div className="flex items-center gap-2 text-[10px] font-mono text-amber-500 uppercase tracking-widest">
          <LucideAlertCircle size={12} />
          Token required — save a token first
        </div>
      );
    }
    if (syncResult === 'invalid_token') {
      return (
        <div className="flex items-center gap-2 text-[10px] font-mono text-red-500 uppercase tracking-widest">
          <LucideXCircle size={12} />
          Token rejected by remote API
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 text-[10px] font-mono text-red-500 uppercase tracking-widest">
        <LucideXCircle size={12} />
        Sync failed — {syncResult}
      </div>
    );
  };

  return (
    <div className="space-y-12 pb-20">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 px-2">
        <div className="space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.5em] text-neutral-600">Remote_Sequence_Engine</p>
          <h1 className="text-5xl font-display font-black text-white italic tracking-tighter uppercase">Trigger_Bridge</h1>
        </div>
        <OrionButton
          variant="outline"
          size="lg"
          className="h-14 px-12 italic"
          onClick={() => setShowConfig(!showConfig)}
        >
          <LucideKey size={20} className="mr-3" />
          {showConfig ? 'VIEW_DEVICES' : 'BRIDGE_CONFIG'}
        </OrionButton>
      </div>

      <AnimatePresence mode="wait">
        {showConfig ? (
          <motion.div
            key="config"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {/* ────────────── BRIDGE CONFIG ────────────── */}
            <OrionCard variant="default" className="p-10 border-white/10">
              <div className="flex items-center gap-6 mb-10">
                <div className="p-4 bg-cyan-500/10 text-cyan-500 rounded-[1.5rem] border border-cyan-500/20 shadow-[0_0_40px_rgba(6,182,212,0.1)]">
                  <LucidePlugZap size={28} strokeWidth={1.5} />
                </div>
                <div className="space-y-1">
                  <h2 className="text-3xl font-display font-black text-white italic tracking-tighter uppercase">Bridge_Configuration</h2>
                  <div className="flex items-center gap-3">
                    <div className={cn('w-2 h-2 rounded-full', meta.dot)} />
                    <span className={cn('text-[10px] font-mono uppercase tracking-widest', meta.color)}>{meta.label}</span>
                  </div>
                </div>
              </div>

              <div className="max-w-2xl space-y-8">
                {/* Token Input */}
                <div className="space-y-3">
                  <label className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                    <LucideKey size={12} />
                    TriggerCMD Token
                    {hasSavedToken && !token && (
                      <span className="ml-2 text-[8px] text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 tracking-widest">
                        TOKEN_SAVED
                      </span>
                    )}
                  </label>
                  <div className="flex gap-3">
                    <Input
                      type="password"
                      placeholder="••••••••••••••••"
                      value={token}
                      onChange={(e) => {
                        console.log('[TRIGGER_UI_STATE] input_changed token_length=' + e.target.value.length);
                        setToken(e.target.value);
                      }}
                      className="flex-1 bg-white/[0.03] border-white/5 rounded-xl font-mono text-[11px] tracking-widest h-12 placeholder:text-neutral-700"
                    />
                    <OrionButton
                      variant="primary"
                      size="lg"
                      className="h-12 px-8 italic shrink-0"
                      onClick={handleSave}
                      disabled={saving || !token.trim()}
                    >
                      {saving ? (
                        <LucideLoader2 size={16} className="animate-spin mr-2" />
                      ) : (
                        <LucideSave size={16} className="mr-2" />
                      )}
                      SAVE
                    </OrionButton>
                  </div>
                </div>

                {/* Endpoint Input (Optional) */}
                <div className="space-y-3">
                  <label className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                    <LucideTerminal size={12} />
                    Endpoint / Bridge URL (optional)
                  </label>
                  <Input
                    type="text"
                    placeholder="https://api.triggercmd.com/user/command/list"
                    value={endpoint}
                    onChange={(e) => {
                      console.log('[TRIGGER_UI_STATE] endpoint_changed value=' + (e.target.value || '(empty)'));
                      setEndpoint(e.target.value);
                    }}
                    className="w-full bg-white/[0.03] border-white/5 rounded-xl font-mono text-[11px] tracking-widest h-12 placeholder:text-neutral-700"
                  />
                </div>

                {/* Guidance */}
                <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                  <LucideShield size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest leading-relaxed">
                    Your token is private and linked only to your account.
                  </p>
                </div>

                {/* Sync & Status */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-4 border-t border-white/5">
                  <OrionButton
                    variant="outline"
                    size="lg"
                    className="h-12 px-8 italic"
                    onClick={handleSync}
                    disabled={status === 'syncing'}
                  >
                    {status === 'syncing' ? (
                      <LucideLoader2 size={16} className="animate-spin mr-2" />
                    ) : (
                      <LucideRefreshCw size={16} className="mr-2" />
                    )}
                    SYNC
                  </OrionButton>

                  <div className="flex-1">
                    {renderSyncResult()}
                  </div>
                </div>

                {/* Empty fallback for device section when no config */}
                {!triggerManager.getConfig()?.hasToken && (
                  <div className="col-span-full py-16 text-center border-2 border-dashed border-white/5 rounded-[2rem]">
                    <LucidePlug size={32} className="mx-auto mb-4 text-neutral-700" />
                    <p className="text-neutral-600 font-mono uppercase tracking-[0.3em] mb-2">No TriggerCMD bridge configured.</p>
                    <p className="text-[10px] font-mono text-neutral-700 uppercase tracking-widest">
                      Add your TriggerCMD token to connect your devices.
                    </p>
                  </div>
                )}
              </div>
            </OrionCard>
          </motion.div>
        ) : (
          <motion.div
            key="devices"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {/* ────────────── DEVICE LIST ────────────── */}
            <OrionCard variant="default" className="p-12 border-white/10">
              <div className="flex items-center gap-8 mb-12">
                <div className="p-5 bg-orange-500/10 text-orange-500 rounded-[1.5rem] border border-orange-500/20 shadow-[0_0_40px_rgba(249,115,22,0.1)]">
                  <LucideTerminal size={36} strokeWidth={1.5} />
                </div>
                <div className="space-y-1">
                  <h2 className="text-4xl font-display font-black text-white italic tracking-tighter uppercase">CMD_INFRASTRUCTURE</h2>
                  <div className="flex items-center gap-3">
                    <OrionStatusBadge
                      status={devices.length > 0 ? 'operational' : 'recovery'}
                      label={devices.length > 0 ? 'agent_ready' : 'waiting_for_agent'}
                    />
                    <div className="flex items-center gap-2 pl-3 border-l border-white/5">
                      <div className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
                      <span className={cn('text-[10px] font-mono uppercase tracking-widest', meta.color)}>{meta.label}</span>
                    </div>
                  </div>
                </div>
              </div>

              {devices.length === 0 ? (
                <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-[2rem]">
                  <p className="text-neutral-600 font-mono uppercase tracking-[0.3em]">No devices linked to bridge</p>
                  <OrionButton
                    variant="outline"
                    size="sm"
                    className="mt-6 italic"
                    onClick={() => setShowConfig(true)}
                  >
                    <LucideKey size={14} className="mr-2" />
                    CONFIGURE BRIDGE
                  </OrionButton>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {devices.map((cmd) => (
                    <div key={cmd.id} className="bg-white/[0.02] border border-white/5 hover:border-orange-500/30 p-6 rounded-[2rem] transition-all group relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-5 transition-opacity pointer-events-none">
                        <LucideCommand size={100} />
                      </div>

                      <div className="flex justify-between items-center mb-6">
                        <div className="p-3 bg-white/5 rounded-xl text-neutral-600 group-hover:text-orange-500 group-hover:bg-orange-500/10 transition-all">
                          <LucideCommand size={20} strokeWidth={1.5} />
                        </div>
                        <span className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest leading-none shrink-0">{cmd.server}</span>
                      </div>

                      <div className="space-y-1 mb-8">
                        <h3 className="text-xl font-display font-black text-white uppercase italic tracking-tighter truncate group-hover:text-orange-500 transition-colors">{cmd.name}</h3>
                        <p className="text-[10px] font-mono text-neutral-600 truncate uppercase tracking-widest">{cmd.cmd}</p>
                      </div>

                      <OrionButton
                        variant="outline"
                        onClick={() => handleRun(cmd.id)}
                        className="w-full flex items-center justify-center gap-3 bg-orange-500/10 border-orange-500/20 text-orange-500 py-4 rounded-xl font-display font-bold uppercase italic tracking-widest hover:bg-orange-500 hover:text-black transition-all"
                      >
                        <LucidePlay size={16} />
                        RUN_ON_REMOTE
                      </OrionButton>
                    </div>
                  ))}
                </div>
              )}
            </OrionCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
