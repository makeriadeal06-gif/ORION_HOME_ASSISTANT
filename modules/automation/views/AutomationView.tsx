import React from 'react';
import {
  LucideActivity,
  LucideAlarmClock,
  LucideAppWindow,
  LucideArrowDown,
  LucideArrowUp,
  LucideBot,
  LucideCopy,
  LucideGlobe,
  LucideMic,
  LucidePause,
  LucidePlay,
  LucidePlus,
  LucideRefreshCw,
  LucideSettings2,
  LucideShieldCheck,
  LucideSparkles,
  LucideTrash2,
  LucideX,
  LucideZap,
} from 'lucide-react';
import { OrionButton, OrionCard } from '@client/components/OrionUI';
import {
  automationAssetRegistry,
  ExecutableRegistryEntry,
  isExecutablePathValid,
  TriggerRegistryEntry,
} from '@core/automation-runtime/AutomationAssetRegistry';
import { automationStoreService } from '@core/automation-runtime/AutomationStore';
import {
  AutomationAction,
  AutomationCondition,
  AutomationDay,
  AutomationDraft,
  AutomationRecord,
  AutomationTrigger,
} from '@core/automation-runtime/types';
import { triggerManager, TriggerDevice } from '@core/runtime/TriggerManager';
import { useAutomationStore } from '@core/state/stores/useAutomationStore';
import { useAuthStore } from '@core/state/stores/useAuthStore';

const DAY_OPTIONS: Array<{ key: AutomationDay; label: string }> = [
  { key: 'mon', label: 'Seg' },
  { key: 'tue', label: 'Ter' },
  { key: 'wed', label: 'Qua' },
  { key: 'thu', label: 'Qui' },
  { key: 'fri', label: 'Sex' },
  { key: 'sat', label: 'Sab' },
  { key: 'sun', label: 'Dom' },
];

type TriggerPresetId =
  | 'manual'
  | 'voice'
  | 'fixed_time'
  | 'interval'
  | 'relative_delay'
  | 'startup'
  | 'internet_down'
  | 'app_opened';

const TRIGGER_PRESETS: Array<{
  id: TriggerPresetId;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: string | number; className?: string }>;
}> = [
  { id: 'voice', title: 'Eu falar uma frase', subtitle: 'Ativa por frase natural', icon: LucideMic },
  { id: 'fixed_time', title: 'For tal horario', subtitle: 'Horario fixo com repeticao', icon: LucideAlarmClock },
  { id: 'interval', title: 'Passarem X minutos', subtitle: 'Intervalo recorrente', icon: LucideRefreshCw },
  { id: 'relative_delay', title: 'Daqui a pouco tempo', subtitle: 'Execucao unica relativa', icon: LucideZap },
  { id: 'app_opened', title: 'Abrir um app', subtitle: 'Evento de app aberto no runtime', icon: LucideAppWindow },
  { id: 'internet_down', title: 'Internet cair', subtitle: 'Usa o evento de socket/rede atual', icon: LucideGlobe },
  { id: 'startup', title: 'ORION iniciar', subtitle: 'Dispara no startup', icon: LucideBot },
  { id: 'manual', title: 'Manualmente', subtitle: 'Roda so quando voce mandar', icon: LucidePlay },
];

const TEMPLATE_PRESETS = [
  {
    id: 'headset_focus',
    title: 'Noite com Spotify',
    apply: (ownerId: string): AutomationDraft['data'] => ({
      ownerId,
      name: 'Modo foco de noite',
      description: 'Abre Spotify e fala uma mensagem depois do horario comercial.',
      type: 'TIME_BASED',
      enabled: true,
      trigger: { type: 'TIME_BASED', scheduleMode: 'fixed_time', time: '18:00', intervalMinutes: null, delayMs: 0, oneShotAt: null, activeDays: ['mon', 'tue', 'wed', 'thu', 'fri'], recurrence: 'weekdays' },
      conditions: [{ id: createId('condition'), type: 'time_window', label: 'Depois das 18h', startTime: '18:00', endTime: '23:30' }],
      actions: [
        { id: createId('action'), kind: 'LOCAL_COMMAND', label: 'Abrir Spotify', command: 'open_app', appTarget: 'spotify', delayMs: 0 },
        { id: createId('action'), kind: 'VOICE_ACTION', label: 'Falar', speechText: 'Modo foco ativado.', delayMs: 1200 },
      ],
      schedule: { retries: 1, cooldownMs: 0, priority: 1, requireConfirmation: false, repeatEnabled: true, activeWindowStart: '18:00', activeWindowEnd: '23:30', weeklyExecutionLimit: null },
    }),
  },
  {
    id: 'recovery_guard',
    title: 'Recuperacao de runtime',
    apply: (ownerId: string): AutomationDraft['data'] => ({
      ownerId,
      name: 'Recuperar conexao',
      description: 'Revalida o estado e ressincroniza quando a conexao cair.',
      type: 'SYSTEM_TRIGGERED',
      enabled: true,
      trigger: { type: 'SYSTEM_TRIGGERED', event: 'socket_disconnected' },
      conditions: [],
      actions: [
        { id: createId('action'), kind: 'SYSTEM_ACTION', label: 'Reconectar runtime', action: 'runtime_socket_reconnect', delayMs: 0 },
        { id: createId('action'), kind: 'SYSTEM_ACTION', label: 'Revalidar hydration', action: 'runtime_hydration_revalidate', delayMs: 1200 },
      ],
      schedule: { retries: 2, cooldownMs: 30000, priority: 2, requireConfirmation: false, repeatEnabled: true, activeWindowStart: null, activeWindowEnd: null, weeklyExecutionLimit: null },
    }),
  },
  {
    id: 'voice_quick',
    title: 'Atalho por voz',
    apply: (ownerId: string): AutomationDraft['data'] => ({
      ownerId,
      name: 'Abrir Discord por voz',
      description: 'Aciona um app local por frase curta.',
      type: 'VOICE_TRIGGERED',
      enabled: true,
      trigger: { type: 'VOICE_TRIGGERED', phrase: 'abrir discord', aliases: ['discord agora'], sensitivity: 'medium' },
      conditions: [],
      actions: [{ id: createId('action'), kind: 'LOCAL_COMMAND', label: 'Abrir Discord', command: 'open_app', appTarget: 'discord', delayMs: 0 }],
      schedule: { retries: 1, cooldownMs: 5000, priority: 1, requireConfirmation: false, repeatEnabled: true, activeWindowStart: null, activeWindowEnd: null, weeklyExecutionLimit: null },
    }),
  },
];

export function AutomationView() {
  const automations = useAutomationStore((state) => state.automations);
  const loading = useAutomationStore((state) => state.loading);
  const hydrated = useAutomationStore((state) => state.hydrated);
  const draft = useAutomationStore((state) => state.draft);
  const editorOpen = useAutomationStore((state) => state.editorOpen);
  const user = useAuthStore((state) => state.user);

  const metrics = React.useMemo(() => ({
    active: automations.filter((automation) => automation.enabled).length,
    scheduled: automations.filter((automation) => automation.state === 'scheduled' || automation.state === 'waiting').length,
    running: automations.filter((automation) => automation.state === 'running').length,
    failed: automations.filter((automation) => automation.state === 'failed').length,
  }), [automations]);

  const [compactMode, setCompactMode] = React.useState(false);

  const handleOpenCreate = React.useCallback(() => {
    if (!user?.uid) {
      return;
    }
    automationStoreService.createDraft('create');
  }, [user?.uid]);

  React.useEffect(() => {
    if (!editorOpen || !draft?.dirty) {
      return undefined;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [draft?.dirty, editorOpen]);

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.5em] text-neutral-600">Routine_Control_Center</p>
          <h1 className="text-5xl font-display font-black italic tracking-tighter text-white uppercase">Automation Lab</h1>
          <p className="max-w-3xl text-sm text-neutral-400">
            Crie rotinas persistentes com editor visual, scheduler real e execucao presa ao mesmo TaskRuntime e a mesma queue atual.
          </p>
        </div>

        <OrionButton variant="primary" size="lg" className="h-14 px-10 italic" onClick={handleOpenCreate} disabled={!user?.uid}>
          <LucidePlus size={18} className="mr-2" />
          NOVA_ROTINA
        </OrionButton>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <StatTile label="Ativas" value={metrics.active} sub={hydrated ? 'hidratado' : 'boot'} />
        <StatTile label="Agendadas" value={metrics.scheduled} sub={metrics.scheduled ? 'armadas' : 'ocioso'} />
        <StatTile label="Executando" value={metrics.running} sub={metrics.running ? 'ao vivo' : 'quieto'} />
        <StatTile label="Falhas" value={metrics.failed} sub={metrics.failed ? 'revisar' : 'estavel'} />
      </div>

      <OrionCard variant="glass" className="border-primary/20 bg-primary/[0.03] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-primary">Runtime_Status</p>
            <p className="text-sm text-neutral-300">
              {loading ? 'Restaurando snapshots, drafts, recovery e correlacoes de task.' : 'O editor continua preso ao runtime unico, a queue real e ao fluxo de recovery atual.'}
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.3em] text-primary">
            <LucideShieldCheck size={16} className={hydrated ? 'text-primary' : 'text-neutral-500'} />
            <span>{hydrated ? 'integridade_verificada' : 'hidratando'}</span>
          </div>
        </div>
      </OrionCard>

      {automations.length === 0 ? (
        <OrionCard variant="default" className="p-8 text-center">
          <p className="text-sm text-neutral-400">Nenhuma automacao persistida foi encontrada para este usuario.</p>
        </OrionCard>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="col-span-1 flex items-center gap-3">
            <label className="text-sm font-mono text-neutral-400">Compact Mode</label>
            <button type="button" className={`rounded-full p-2 border ${compactMode ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/[0.02]'}`} onClick={() => setCompactMode(v => !v)}>{compactMode ? 'ON' : 'OFF'}</button>
          </div>
          {automations.map((automation) => (
            compactMode ? <AutomationCardCompact key={automation.id} automation={automation} /> : <AutomationCard key={automation.id} automation={automation} />
          ))}
        </div>
      )}

      {editorOpen && draft ? <AutomationEditor draft={draft} /> : null}
    </div>
  );
}

const AutomationCard = React.memo(function AutomationCard({ automation }: { automation: AutomationRecord }) {
  const isRunning = automation.state === 'running';
  const isPaused = automation.state === 'paused';
  const nextExecution = automation.nextExecutionAt ? formatTimestamp(automation.nextExecutionAt) : 'Sob demanda';

  return (
    <OrionCard variant="default" className="overflow-hidden border-white/10 p-0">
      <div className="border-b border-white/5 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${isRunning ? 'bg-primary shadow-[0_0_14px_rgba(6,182,212,0.5)]' : automation.enabled ? 'bg-emerald-400/80' : 'bg-neutral-700'}`} />
              <h3 className="text-xl font-display font-black tracking-wide text-white">{automation.name}</h3>
            </div>
            <p className="text-sm text-neutral-400">{automation.description || 'Sem descricao.'}</p>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500">{automation.id}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge label={humanizeType(automation.type)} tone="neutral" />
            <Badge label={automation.state} tone={resolveStateTone(automation.state)} />
            <Badge label={automation.enabled ? 'ativa' : 'desativada'} tone={automation.enabled ? 'success' : 'neutral'} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        <InfoBlock label="Quando" value={describeTrigger(automation.trigger)} />
        <InfoBlock label="Proxima execucao" value={nextExecution} />
        <InfoBlock label="Acoes" value={`${automation.actions.length} passo(s)`} />
        <InfoBlock label="Condicoes" value={automation.conditions.length ? `${automation.conditions.length} regra(s)` : 'Nenhuma'} />
        <InfoBlock label="Cooldown" value={formatDurationMs(automation.schedule.cooldownMs)} />
        <InfoBlock label="Janela valida" value={describeWindow(automation.schedule.activeWindowStart, automation.schedule.activeWindowEnd)} />
      </div>

      <Section title="Metricas">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoBlock label="Total" value={String(automation.continuity.metrics.totalExecutions)} />
          <InfoBlock label="Sucessos" value={String(automation.continuity.metrics.successfulExecutions)} />
          <InfoBlock label="Falhas" value={String(automation.continuity.metrics.failedExecutions)} />
          <InfoBlock label="Avg exec" value={automation.continuity.metrics.averageExecutionTimeMs ? `${automation.continuity.metrics.averageExecutionTimeMs}ms` : 'n/a'} />
          <InfoBlock label="Retries" value={String(automation.continuity.metrics.retryCount)} />
          <InfoBlock label="Skips" value={String(automation.continuity.metrics.skippedExecutions)} />
          <InfoBlock label="Cooldown blocks" value={String(automation.continuity.metrics.cooldownBlocks)} />
          <InfoBlock label="Orphan recoveries" value={String(automation.continuity.metrics.orphanRecoveries)} />
        </div>
      </Section>

      <Section title="SE">
        {automation.conditions.length === 0 ? <InlineMuted>Sempre permitido.</InlineMuted> : automation.conditions.map((condition) => <RowPill key={condition.id} title={condition.label} subtitle={describeCondition(condition)} />)}
      </Section>

      <Section title="ENTAO">
        {automation.actions.map((action, index) => (
          <RowPill key={action.id} title={`${index + 1}. ${action.label}`} subtitle={describeAction(action)} accent={resolveActionAccent(action)} />
        ))}
      </Section>

      <div className="border-t border-white/5 p-6">
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoBlock label="Ultima execucao" value={formatOptionalTimestamp(automation.lastExecutionAt)} />
          <InfoBlock label="Ultimo sucesso" value={formatOptionalTimestamp(automation.lastCompletedAt)} />
          <InfoBlock label="Ultima falha" value={formatOptionalTimestamp(automation.lastFailedAt)} />
          <InfoBlock label="Erro recente" value={automation.lastError || 'nenhum'} />
        </div>

        <div className="flex flex-wrap gap-3">
          <OrionButton variant="outline" size="sm" onClick={() => automationStoreService.runAutomation(automation.id, 'manual')} disabled={!automation.enabled}>
            <LucidePlay size={14} /> RODAR
          </OrionButton>
          <OrionButton variant="secondary" size="sm" onClick={() => automationStoreService.createDraft('edit', automation.id)}>
            <LucideSettings2 size={14} /> EDITAR
          </OrionButton>
          <OrionButton variant="secondary" size="sm" onClick={() => automationStoreService.duplicateAutomation(automation.id)}>
            <LucideCopy size={14} /> DUPLICAR
          </OrionButton>
          <OrionButton variant="secondary" size="sm" onClick={() => automationStoreService.toggleAutomation(automation.id, !automation.enabled)}>
            <LucideRefreshCw size={14} /> {automation.enabled ? 'DESLIGAR' : 'LIGAR'}
          </OrionButton>
          <OrionButton variant="ghost" size="sm" onClick={() => automationStoreService.pauseAutomationTasks(automation.id)} disabled={isPaused || automation.activeTaskIds.length === 0}>
            <LucidePause size={14} /> PAUSAR
          </OrionButton>
          <OrionButton variant="ghost" size="sm" onClick={() => automationStoreService.resumeAutomationTasks(automation.id)} disabled={!isPaused}>
            <LucideActivity size={14} /> RETOMAR
          </OrionButton>
          <OrionButton
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm('Excluir esta automacao?')) {
                automationStoreService.deleteAutomation(automation.id);
              }
            }}
          >
            <LucideTrash2 size={14} /> EXCLUIR
          </OrionButton>
        </div>
      </div>
    </OrionCard>
  );
});

const AutomationCardCompact = React.memo(function AutomationCardCompact({ automation }: { automation: AutomationRecord }) {
  const isRunning = automation.state === 'running';
  return (
    <div className="rounded-xl border border-white/5 p-3 bg-white/[0.02] flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`h-3 w-3 rounded-full ${isRunning ? 'bg-primary shadow-[0_0_10px_rgba(6,182,212,0.4)]' : automation.enabled ? 'bg-emerald-400/80' : 'bg-neutral-700'}`} />
        <div className="min-w-0">
          <div className="text-sm font-display font-bold text-white truncate">{automation.name}</div>
          <div className="text-[11px] text-neutral-400 truncate">{describeTrigger(automation.trigger)} • {automation.actions.length} steps</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge label={automation.state} tone={resolveStateTone(automation.state)} />
        <OrionButton size="sm" variant="ghost" onClick={() => automationStoreService.runAutomation(automation.id, 'manual')} disabled={!automation.enabled}>Run</OrionButton>
      </div>
    </div>
  );
});

function AutomationEditor({ draft }: { draft: AutomationDraft }) {
  const automations = useAutomationStore((state) => state.automations);
  const [devices, setDevices] = React.useState<TriggerDevice[]>(() => triggerManager.getDevices());
  const [localDraft, setLocalDraft] = React.useState<AutomationDraft>(draft);
  const [executables, setExecutables] = React.useState<ExecutableRegistryEntry[]>(() => automationAssetRegistry.listExecutables());
  const persistTimerRef = React.useRef<number | null>(null);
  const deferredDraft = React.useDeferredValue(localDraft);

  React.useEffect(() => {
    setLocalDraft(draft);
  }, [draft.id, draft.updatedAt]);

  React.useEffect(() => {
    const unsubscribe = triggerManager.subscribe((entries) => setDevices(entries));
    triggerManager.loadConfig().then((config) => {
      if (config?.hasToken && triggerManager.getDevices().length === 0) {
        triggerManager.syncDevices().catch(() => null);
      }
    }).catch(() => null);
    return unsubscribe;
  }, []);

  React.useEffect(() => () => {
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
    }
  }, []);

  const triggerEntries = React.useMemo(() => automationAssetRegistry.listTriggerEntries(devices), [devices]);

  const commitDraft = React.useCallback((updater: (current: AutomationDraft) => AutomationDraft) => {
    setLocalDraft((current) => {
      const next = updater(current);
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
      }
      persistTimerRef.current = window.setTimeout(() => {
        React.startTransition(() => automationStoreService.updateDraft(next));
      }, 120);
      return next;
    });
  }, []);

  const refreshExecutables = React.useCallback(() => {
    setExecutables(automationAssetRegistry.listExecutables());
  }, []);

  const triggerPreset = React.useMemo(() => resolveTriggerPreset(localDraft.data.trigger), [localDraft.data.trigger]);
  const validation = React.useMemo(() => validateDraft(localDraft), [localDraft]);
  const preview = React.useMemo(() => buildHumanPreview(deferredDraft.data, triggerEntries, automations), [deferredDraft.data, triggerEntries, automations]);
  const operationalPreview = React.useMemo(() => buildOperationalPreview(deferredDraft.data, triggerEntries, automations), [deferredDraft.data, triggerEntries, automations]);
  const relatedAutomations = React.useMemo(() => automations.filter((automation) => automation.id !== localDraft.automationId), [automations, localDraft.automationId]);

  const closeEditor = React.useCallback(() => {
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (JSON.stringify(localDraft.data) !== JSON.stringify(draft.data) || localDraft.dirty) {
      automationStoreService.updateDraft(localDraft);
    }
    if (!automationStoreService.closeDraft()) {
      if (window.confirm('Descartar alteracoes nao salvas?')) {
        automationStoreService.closeDraft(true);
      }
    }
  }, [draft.data, localDraft]);

  const saveEditor = React.useCallback(() => {
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    automationStoreService.saveDraft(localDraft);
  }, [localDraft]);

  const applyTemplate = React.useCallback((templateId: string) => {
    const template = TEMPLATE_PRESETS.find((entry) => entry.id === templateId);
    if (!template) {
      return;
    }
    commitDraft((current) => ({ ...current, data: template.apply(current.data.ownerId) }));
  }, [commitDraft]);

  const saveTriggerMetadata = React.useCallback((entry: TriggerRegistryEntry, updates: { aliases?: string[]; category?: string; app?: string }) => {
    automationAssetRegistry.saveTriggerMetadata(entry.id, updates);
    setDevices((current) => [...current]);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-7xl">
        <OrionCard variant="premium" className="overflow-hidden border border-primary/20 bg-[#060910]">
          <div className="flex flex-col gap-4 border-b border-white/5 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-mono uppercase tracking-[0.45em] text-primary">Automation_Studio</p>
              <h2 className="text-3xl font-display font-black italic tracking-tight text-white">Quando, se, entao, execucao.</h2>
              <p className="text-sm text-neutral-400">Refatore a rotina com trigger legivel, regras claras, acoes reais e scheduler funcional.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <OrionButton variant="ghost" size="sm" onClick={closeEditor}>
                <LucideX size={14} /> FECHAR
              </OrionButton>
              <OrionButton variant="primary" size="sm" onClick={saveEditor} disabled={!validation.valid}>
                <LucideSparkles size={14} /> SALVAR_AUTOMACAO
              </OrionButton>
            </div>
          </div>

          <div className="grid gap-6 p-6 xl:grid-cols-[1.25fr,0.75fr]">
            <div className="space-y-6">
              <EditorPanel title="Wizard Visual">
                <div className="grid gap-3 md:grid-cols-3">
                  {TEMPLATE_PRESETS.map((template) => (
                    <button key={template.id} type="button" className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-left transition hover:border-primary/30 hover:bg-primary/[0.06]" onClick={() => applyTemplate(template.id)}>
                      <div className="mb-3 flex items-center gap-3 text-primary"><LucideSparkles size={16} /><span className="text-[10px] font-mono uppercase tracking-[0.3em]">template</span></div>
                      <p className="text-sm font-semibold text-white">{template.title}</p>
                    </button>
                  ))}
                </div>
              </EditorPanel>

              <EditorPanel title="Identidade">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Titulo da rotina">
                    <input className={inputClass} value={localDraft.data.name} onChange={(event) => commitDraft((current) => ({ ...current, data: { ...current.data, name: event.target.value } }))} placeholder="Ex.: Spotify depois do trabalho" />
                  </Field>
                  <Field label="Status">
                    <select className={inputClass} value={String(localDraft.data.enabled)} onChange={(event) => commitDraft((current) => ({ ...current, data: { ...current.data, enabled: event.target.value === 'true' } }))}>
                      <option value="true">Ativa</option>
                      <option value="false">Desativada</option>
                    </select>
                  </Field>
                </div>
                <Field label="Descricao">
                  <textarea className={`${inputClass} min-h-24`} value={localDraft.data.description} onChange={(event) => commitDraft((current) => ({ ...current, data: { ...current.data, description: event.target.value } }))} placeholder="Explique em linguagem natural o que essa rotina faz." />
                </Field>
              </EditorPanel>

              <EditorPanel title="QUANDO...">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {TRIGGER_PRESETS.map((preset) => {
                    const Icon = preset.icon;
                    const active = triggerPreset === preset.id;
                    return (
                      <button key={preset.id} type="button" className={`rounded-2xl border p-4 text-left transition ${active ? 'border-primary/30 bg-primary/[0.08]' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`} onClick={() => commitDraft((current) => ({ ...current, data: applyTriggerPreset(current.data, preset.id) }))}>
                        <div className="mb-4 flex items-center gap-3 text-primary"><Icon size={18} /><span className="text-[10px] font-mono uppercase tracking-[0.3em]">quando</span></div>
                        <p className="text-sm font-semibold text-white">{preset.title}</p>
                        <p className="mt-1 text-xs text-neutral-400">{preset.subtitle}</p>
                      </button>
                    );
                  })}
                </div>

                <TriggerBuilder draft={localDraft} devices={devices} updateDraft={commitDraft} />
              </EditorPanel>

              <EditorPanel title="SE...">
                <div className="mb-4 flex flex-wrap gap-2">
                  <MiniActionButton label="Dia da semana" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, conditions: [...current.data.conditions, createCondition('day')] } }))} />
                  <MiniActionButton label="Time window" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, conditions: [...current.data.conditions, createCondition('time_window')] } }))} />
                  <MiniActionButton label="Lifecycle" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, conditions: [...current.data.conditions, createCondition('lifecycle')] } }))} />
                  <MiniActionButton label="Socket" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, conditions: [...current.data.conditions, createCondition('socket_connected')] } }))} />
                  <MiniActionButton label="Usuario" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, conditions: [...current.data.conditions, createCondition('user_active')] } }))} />
                  <MiniActionButton label="Focus mode" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, conditions: [...current.data.conditions, createCondition('focus_mode_active')] } }))} />
                </div>

                <div className="space-y-3">
                  {localDraft.data.conditions.length === 0 ? (
                    <InlineMuted>Nenhuma condicao extra. A automacao roda assim que o trigger for valido.</InlineMuted>
                  ) : (
                    localDraft.data.conditions.map((condition, index) => (
                      <ConditionEditor
                        key={condition.id}
                        condition={condition}
                        onChange={(nextCondition) => commitDraft((current) => ({ ...current, data: { ...current.data, conditions: current.data.conditions.map((entry, entryIndex) => (entryIndex === index ? nextCondition : entry)) } }))}
                        onRemove={() => commitDraft((current) => ({ ...current, data: { ...current.data, conditions: current.data.conditions.filter((_, entryIndex) => entryIndex !== index) } }))}
                      />
                    ))
                  )}
                </div>
              </EditorPanel>

              <EditorPanel title="ENTAO...">
                <div className="mb-4 flex flex-wrap gap-2">
                  <MiniActionButton label="Abrir app" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, actions: [...current.data.actions, createAction('LOCAL_COMMAND', 'open_app')] } }))} />
                  <MiniActionButton label="Abrir URL" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, actions: [...current.data.actions, createAction('LOCAL_COMMAND', 'open_url')] } }))} />
                  <MiniActionButton label="Falar algo" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, actions: [...current.data.actions, createAction('VOICE_ACTION')] } }))} />
                  <MiniActionButton label="Esperar" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, actions: [...current.data.actions, createAction('WAIT_ACTION')] } }))} />
                  <MiniActionButton label="Executar automacao" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, actions: [...current.data.actions, createAction('TASK_ACTION')] } }))} />
                  <MiniActionButton label="TriggerCMD" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, actions: [...current.data.actions, createAction('TRIGGERCMD_ACTION')] } }))} />
                  <MiniActionButton label="Executavel local" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, actions: [...current.data.actions, createAction('EXECUTABLE_PATH_ACTION')] } }))} />
                  <MiniActionButton label="Acao de sistema" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, actions: [...current.data.actions, createAction('SYSTEM_ACTION')] } }))} />
                  <MiniActionButton label="Comando local" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, actions: [...current.data.actions, createAction('LOCAL_COMMAND', 'execute_local_command')] } }))} />
                  <MiniActionButton label="Dispositivo Wi-Fi" onClick={() => commitDraft((current) => ({ ...current, data: { ...current.data, actions: [...current.data.actions, createAction('FUTURE_DEVICE_ACTION')] } }))} />
                </div>

                <div className="space-y-3">
                  {localDraft.data.actions.length === 0 ? (
                    <InlineMuted>Adicione pelo menos uma acao real antes de salvar.</InlineMuted>
                  ) : (
                    localDraft.data.actions.map((action, index) => (
                      <ActionEditor
                        key={action.id}
                        action={action}
                        automations={relatedAutomations}
                        triggerEntries={triggerEntries}
                        executables={executables}
                        onExecutableSaved={refreshExecutables}
                        onChange={(nextAction) => commitDraft((current) => ({ ...current, data: { ...current.data, actions: current.data.actions.map((entry, entryIndex) => (entryIndex === index ? nextAction : entry)) } }))}
                        onRemove={() => commitDraft((current) => ({ ...current, data: { ...current.data, actions: current.data.actions.filter((_, entryIndex) => entryIndex !== index) } }))}
                        onMoveUp={() => reorderEntry(localDraft.data.actions, index, -1, (next) => commitDraft((current) => ({ ...current, data: { ...current.data, actions: next } })))}
                        onMoveDown={() => reorderEntry(localDraft.data.actions, index, 1, (next) => commitDraft((current) => ({ ...current, data: { ...current.data, actions: next } })))}
                      />
                    ))
                  )}
                </div>
              </EditorPanel>
            </div>

            <div className="space-y-6">
              <EditorPanel title="EXECUCAO">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Cooldown">
                    <input className={inputClass} type="number" min={0} value={localDraft.data.schedule.cooldownMs} onChange={(event) => commitDraft((current) => ({ ...current, data: { ...current.data, schedule: { ...current.data.schedule, cooldownMs: Number(event.target.value) || 0 } } }))} />
                  </Field>
                  <Field label="Retries">
                    <input className={inputClass} type="number" min={0} value={localDraft.data.schedule.retries} onChange={(event) => commitDraft((current) => ({ ...current, data: { ...current.data, schedule: { ...current.data.schedule, retries: Number(event.target.value) || 0 } } }))} />
                  </Field>
                  <Field label="Prioridade">
                    <input className={inputClass} type="number" min={1} value={localDraft.data.schedule.priority} onChange={(event) => commitDraft((current) => ({ ...current, data: { ...current.data, schedule: { ...current.data.schedule, priority: Number(event.target.value) || 1 } } }))} />
                  </Field>
                  <Field label="Limite semanal">
                    <input className={inputClass} type="number" min={0} value={localDraft.data.schedule.weeklyExecutionLimit || 0} onChange={(event) => commitDraft((current) => ({ ...current, data: { ...current.data, schedule: { ...current.data.schedule, weeklyExecutionLimit: Number(event.target.value) > 0 ? Number(event.target.value) : null } } }))} />
                  </Field>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="Janela valida - inicio">
                    <input className={inputClass} type="time" value={localDraft.data.schedule.activeWindowStart || ''} onChange={(event) => commitDraft((current) => ({ ...current, data: { ...current.data, schedule: { ...current.data.schedule, activeWindowStart: event.target.value || null } } }))} />
                  </Field>
                  <Field label="Janela valida - fim">
                    <input className={inputClass} type="time" value={localDraft.data.schedule.activeWindowEnd || ''} onChange={(event) => commitDraft((current) => ({ ...current, data: { ...current.data, schedule: { ...current.data.schedule, activeWindowEnd: event.target.value || null } } }))} />
                  </Field>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="Pedir confirmacao">
                    <select className={inputClass} value={String(localDraft.data.schedule.requireConfirmation)} onChange={(event) => commitDraft((current) => ({ ...current, data: { ...current.data, schedule: { ...current.data.schedule, requireConfirmation: event.target.value === 'true' } } }))}>
                      <option value="false">Nao</option>
                      <option value="true">Sim</option>
                    </select>
                  </Field>
                  <Field label="Repeticao ligada">
                    <select className={inputClass} value={String(localDraft.data.schedule.repeatEnabled)} onChange={(event) => commitDraft((current) => ({ ...current, data: { ...current.data, schedule: { ...current.data.schedule, repeatEnabled: event.target.value === 'true' } } }))}>
                      <option value="false">Nao</option>
                      <option value="true">Sim</option>
                    </select>
                  </Field>
                </div>
              </EditorPanel>

              <EditorPanel title="Preview Humano">
                <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-5 text-sm leading-7 text-neutral-200">
                  {preview}
                </div>
                <div className="mt-4 grid gap-3 text-sm text-neutral-300">
                  <div><span className="text-neutral-500">Trigger:</span> {describeTrigger(localDraft.data.trigger)}</div>
                  <div><span className="text-neutral-500">Janela:</span> {describeWindow(localDraft.data.schedule.activeWindowStart, localDraft.data.schedule.activeWindowEnd)}</div>
                  <div><span className="text-neutral-500">Cooldown:</span> {formatDurationMs(localDraft.data.schedule.cooldownMs)}</div>
                  <div><span className="text-neutral-500">Dirty:</span> {localDraft.dirty ? 'sim' : 'nao'}</div>
                </div>
              </EditorPanel>

              <EditorPanel title="Preview Operacional">
                <p className="text-sm text-neutral-300">Essa automacao ira:</p>
                <div className="space-y-2">
                  {operationalPreview.map((item) => (
                    <div key={item} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white">{item}</div>
                  ))}
                </div>
              </EditorPanel>

              <EditorPanel title="Flow Preview">
                <AutomationFlowPreview draft={localDraft} automations={automations} triggerEntries={triggerEntries} />
              </EditorPanel>

              <EditorPanel title="Validacao">
                {validation.errors.length === 0 ? <InlineMuted>Draft valido para salvar.</InlineMuted> : validation.errors.map((error) => <p key={error} className="text-sm text-amber-300">{error}</p>)}
              </EditorPanel>

              <EditorPanel title="TriggerCMD Real">
                {triggerEntries.length === 0 ? (
                  <InlineMuted>Nenhum trigger real do bridge foi sincronizado ainda. Configure o TriggerCMD e rode sync para popular selecao real.</InlineMuted>
                ) : (
                  <div className="space-y-3">
                    {triggerEntries.slice(0, 6).map((entry) => (
                      <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                        <p className="text-sm font-semibold text-white">{entry.name}</p>
                        <div className="mt-2 grid gap-2 text-[11px] text-neutral-400">
                          <div><span className="text-neutral-500">Trigger Provider:</span> {entry.provider}</div>
                          <div><span className="text-neutral-500">Trigger Source:</span> {entry.source}</div>
                          <div><span className="text-neutral-500">Trigger Action:</span> {entry.cmd}</div>
                          <div><span className="text-neutral-500">Trigger Device:</span> {entry.app || entry.name}</div>
                          <div><span className="text-neutral-500">Category:</span> {entry.category || 'automation'}</div>
                          <div><span className="text-neutral-500">Aliases:</span> {entry.aliases.join(', ') || 'nenhum'}</div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <input className={inputClass} defaultValue={entry.aliases.join(', ')} placeholder="aliases" onBlur={(event) => saveTriggerMetadata(entry, { aliases: event.target.value.split(',') })} />
                          <input className={inputClass} defaultValue={entry.category} placeholder="categoria" onBlur={(event) => saveTriggerMetadata(entry, { category: event.target.value })} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </EditorPanel>
            </div>
          </div>
        </OrionCard>
      </div>
    </div>
  );
}

function TriggerBuilder({
  draft,
  devices,
  updateDraft,
}: {
  draft: AutomationDraft;
  devices: TriggerDevice[];
  updateDraft: (updater: (current: AutomationDraft) => AutomationDraft) => void;
}) {
  const trigger = draft.data.trigger;

  if (trigger.type === 'VOICE_TRIGGERED') {
    return (
      <div className="mt-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Frase principal">
            <input className={inputClass} value={trigger.phrase} onChange={(event) => updateDraft((current) => ({ ...current, data: { ...current.data, trigger: { ...trigger, phrase: event.target.value } } }))} placeholder="Ex.: ativar foco" />
          </Field>
          <Field label="Sensibilidade">
            <select className={inputClass} value={trigger.sensitivity} onChange={(event) => updateDraft((current) => ({ ...current, data: { ...current.data, trigger: { ...trigger, sensitivity: event.target.value as typeof trigger.sensitivity } } }))}>
              <option value="low">Baixa</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </Field>
        </div>
        <Field label="Frases alternativas">
          <input className={inputClass} value={trigger.aliases.join(', ')} onChange={(event) => updateDraft((current) => ({ ...current, data: { ...current.data, trigger: { ...trigger, aliases: event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean) } } }))} placeholder="Ex.: iniciar foco, foco agora" />
        </Field>
      </div>
    );
  }

  if (trigger.type === 'TIME_BASED') {
    const intervalUnit = trigger.intervalMinutes && trigger.intervalMinutes % 60 === 0 ? 'hours' : 'minutes';
    const intervalValue = trigger.intervalMinutes ? (intervalUnit === 'hours' ? trigger.intervalMinutes / 60 : trigger.intervalMinutes) : 30;

    return (
      <div className="mt-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Modo">
            <select className={inputClass} value={trigger.scheduleMode} onChange={(event) => updateDraft((current) => ({ ...current, data: { ...current.data, trigger: { ...trigger, scheduleMode: event.target.value as typeof trigger.scheduleMode } } }))}>
              <option value="fixed_time">Horario do dia</option>
              <option value="interval">Intervalo</option>
              <option value="one_shot">Execucao unica</option>
            </select>
          </Field>
          <Field label="Repeticao">
            <select className={inputClass} value={trigger.recurrence} onChange={(event) => updateDraft((current) => ({ ...current, data: { ...current.data, trigger: { ...trigger, recurrence: event.target.value as typeof trigger.recurrence } } }))}>
              <option value="daily">Todo dia</option>
              <option value="weekdays">Dias uteis</option>
              <option value="weekend">Fim de semana</option>
              <option value="custom">Semana customizada</option>
              <option value="once">Uma vez</option>
            </select>
          </Field>
          <Field label="Cooldown visual">
            <div className="flex h-[50px] items-center rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-neutral-300">{formatDurationMs(draft.data.schedule.cooldownMs)}</div>
          </Field>
          <Field label="Limite semanal">
            <div className="flex h-[50px] items-center rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-neutral-300">{draft.data.schedule.weeklyExecutionLimit || 'Sem limite'}</div>
          </Field>
        </div>

        {trigger.scheduleMode === 'fixed_time' ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Horario principal">
              <input className={inputClass} type="time" value={trigger.time} onChange={(event) => updateDraft((current) => ({ ...current, data: { ...current.data, trigger: { ...trigger, time: event.target.value } } }))} />
            </Field>
            <Field label="Delay adicional (ms)">
              <input className={inputClass} type="number" min={0} value={trigger.delayMs || 0} onChange={(event) => updateDraft((current) => ({ ...current, data: { ...current.data, trigger: { ...trigger, delayMs: Number(event.target.value) || 0 } } }))} />
            </Field>
            <Field label="Resumo">
              <div className="flex h-[50px] items-center rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-neutral-300">{describeTrigger(trigger)}</div>
            </Field>
          </div>
        ) : null}

        {trigger.scheduleMode === 'interval' ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Repetir a cada">
              <input className={inputClass} type="number" min={1} value={intervalValue} onChange={(event) => {
                const value = Number(event.target.value) || 1;
                updateDraft((current) => ({ ...current, data: { ...current.data, trigger: { ...trigger, intervalMinutes: intervalUnit === 'hours' ? value * 60 : value } } }));
              }} />
            </Field>
            <Field label="Unidade">
              <select className={inputClass} value={intervalUnit} onChange={(event) => {
                const unit = event.target.value as 'minutes' | 'hours';
                updateDraft((current) => ({ ...current, data: { ...current.data, trigger: { ...trigger, intervalMinutes: unit === 'hours' ? intervalValue * 60 : intervalValue } } }));
              }}>
                <option value="minutes">Minutos</option>
                <option value="hours">Horas</option>
              </select>
            </Field>
            <Field label="Comeco">
              <div className="flex h-[50px] items-center rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-neutral-300">Roda continuamente pela queue real.</div>
            </Field>
          </div>
        ) : null}

        {trigger.scheduleMode === 'one_shot' ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Rodar em">
                <input
                  className={inputClass}
                  type="datetime-local"
                  value={trigger.oneShotAt ? toDateTimeLocalValue(trigger.oneShotAt) : ''}
                  onChange={(event) => updateDraft((current) => ({ ...current, data: { ...current.data, trigger: { ...trigger, oneShotAt: event.target.value ? new Date(event.target.value).getTime() : null } } }))}
                />
              </Field>
              <Field label="Atalhos relativos">
                <div className="flex flex-wrap gap-2">
                  {[5, 15, 30, 120].map((minutes) => (
                    <button key={minutes} type="button" className="rounded-full border border-primary/20 bg-primary/10 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.25em] text-primary" onClick={() => updateDraft((current) => ({ ...current, data: { ...current.data, trigger: { ...trigger, oneShotAt: Date.now() + minutes * 60 * 1000 } } }))}>
                      {minutes >= 60 ? `daqui ${minutes / 60}h` : `daqui ${minutes}min`}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <InlineMuted>Use execucao unica para "daqui 5 minutos", "daqui 2 horas" ou um horario exato.</InlineMuted>
          </div>
        ) : null}

        {trigger.recurrence === 'custom' ? (
          <div>
            <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.35em] text-neutral-500">Dias da semana</p>
            <div className="flex flex-wrap gap-2">
              {DAY_OPTIONS.map((day) => (
                <button key={day.key} type="button" className={`rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.25em] ${trigger.activeDays.includes(day.key) ? 'border-primary/30 bg-primary/10 text-primary' : 'border-white/10 bg-white/5 text-neutral-400'}`} onClick={() => updateDraft((current) => ({ ...current, data: { ...current.data, trigger: { ...trigger, activeDays: trigger.activeDays.includes(day.key) ? trigger.activeDays.filter((entry) => entry !== day.key) : [...trigger.activeDays, day.key] } } }))}>
                  {day.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-neutral-300">
          <span className="text-neutral-500">Resumo do scheduler:</span> {describeTrigger(trigger)}
        </div>
      </div>
    );
  }

  if (trigger.type === 'SYSTEM_TRIGGERED') {
    return (
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Evento real do runtime">
          <select className={inputClass} value={trigger.event} onChange={(event) => updateDraft((current) => ({ ...current, data: { ...current.data, trigger: { ...trigger, event: event.target.value as typeof trigger.event } } }))}>
            <option value="startup">ORION iniciar</option>
            <option value="socket_disconnected">Internet cair</option>
            <option value="app_opened">Abrir um app</option>
            <option value="recovery">Recovery</option>
            <option value="reconnect">Reconectar</option>
          </select>
        </Field>
        <Field label="Resumo">
          <div className="flex h-[50px] items-center rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-neutral-300">{describeTrigger(trigger)}</div>
        </Field>
      </div>
    );
  }

  if (trigger.type === 'FUTURE_DEVICE_TRIGGER') {
    return (
      <div className="mt-5 space-y-4">
        <InlineMuted>Este caminho permanece reservado para triggers de dispositivo futuros sem criar runtime paralelo.</InlineMuted>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Device alvo">
            <select className={inputClass} value={trigger.targetId} onChange={(event) => updateDraft((current) => ({ ...current, data: { ...current.data, trigger: { ...trigger, targetId: event.target.value } } }))}>
              <option value="">Selecionar</option>
              {devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
            </select>
          </Field>
          <Field label="Estado esperado">
            <input className={inputClass} value={trigger.expectedState} onChange={(event) => updateDraft((current) => ({ ...current, data: { ...current.data, trigger: { ...trigger, expectedState: event.target.value } } }))} placeholder="online" />
          </Field>
        </div>
      </div>
    );
  }

  return <InlineMuted>Trigger manual. Esta automacao executa apenas quando voce disparar manualmente.</InlineMuted>;
}

function ConditionEditor({ condition, onChange, onRemove }: { condition: AutomationCondition; onChange: (condition: AutomationCondition) => void; onRemove: () => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white">{condition.label}</p>
        <button type="button" className="text-neutral-500 transition hover:text-red-300" onClick={onRemove}><LucideTrash2 size={14} /></button>
      </div>

      {condition.type === 'time_window' ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Inicio"><input className={inputClass} type="time" value={condition.startTime} onChange={(event) => onChange({ ...condition, startTime: event.target.value })} /></Field>
          <Field label="Fim"><input className={inputClass} type="time" value={condition.endTime} onChange={(event) => onChange({ ...condition, endTime: event.target.value })} /></Field>
        </div>
      ) : null}

      {condition.type === 'day' ? (
        <div className="flex flex-wrap gap-2">
          {DAY_OPTIONS.map((day) => (
            <button key={day.key} type="button" className={`rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.25em] ${condition.days.includes(day.key) ? 'border-primary/30 bg-primary/10 text-primary' : 'border-white/10 bg-white/5 text-neutral-400'}`} onClick={() => onChange({ ...condition, days: condition.days.includes(day.key) ? condition.days.filter((entry) => entry !== day.key) : [...condition.days, day.key] })}>{day.label}</button>
          ))}
        </div>
      ) : null}

      {condition.type === 'lifecycle' ? <Field label="Lifecycle"><select className={inputClass} value={condition.lifecycle} onChange={(event) => onChange({ ...condition, lifecycle: event.target.value as typeof condition.lifecycle })}><option value="active">Ativo</option><option value="background">Background</option><option value="recovering">Recovering</option></select></Field> : null}
      {(condition.type === 'socket_connected' || condition.type === 'user_active' || condition.type === 'focus_mode_active') ? <Field label="Esperado"><select className={inputClass} value={String(condition.expected)} onChange={(event) => onChange({ ...condition, expected: event.target.value === 'true' })}><option value="true">Verdadeiro</option><option value="false">Falso</option></select></Field> : null}
    </div>
  );
}

function ActionEditor({
  action,
  automations,
  triggerEntries,
  executables,
  onExecutableSaved,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  action: AutomationAction;
  automations: AutomationRecord[];
  triggerEntries: TriggerRegistryEntry[];
  executables: ExecutableRegistryEntry[];
  onExecutableSaved: () => void;
  onChange: (action: AutomationAction) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const selectedTriggerDevice = action.kind === 'TRIGGERCMD_ACTION' ? triggerEntries.find((device) => device.id === action.deviceId) || null : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white">{humanizeActionKind(action.kind)}</p>
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">{action.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="text-neutral-500 transition hover:text-primary" onClick={onMoveUp}><LucideArrowUp size={14} /></button>
          <button type="button" className="text-neutral-500 transition hover:text-primary" onClick={onMoveDown}><LucideArrowDown size={14} /></button>
          <button type="button" className="text-neutral-500 transition hover:text-red-300" onClick={onRemove}><LucideTrash2 size={14} /></button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Rotulo"><input className={inputClass} value={action.label} onChange={(event) => onChange({ ...action, label: event.target.value } as AutomationAction)} /></Field>
        {action.kind !== 'WAIT_ACTION' ? <Field label="Delay da etapa (ms)"><input className={inputClass} type="number" min={0} value={action.delayMs || 0} onChange={(event) => onChange({ ...action, delayMs: Number(event.target.value) || 0 } as AutomationAction)} /></Field> : <Field label="Duracao"><input className={inputClass} type="number" min={0} value={action.durationMs} onChange={(event) => onChange({ ...action, durationMs: Number(event.target.value) || 0 })} /></Field>}
      </div>

      {action.kind === 'LOCAL_COMMAND' ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Acao local">
            <select className={inputClass} value={action.command} onChange={(event) => onChange({ ...action, command: event.target.value as typeof action.command })}>
              <option value="open_app">Abrir app</option>
              <option value="open_url">Abrir URL</option>
              <option value="execute_local_command">Comando local</option>
              <option value="performance_mode">Modo performance</option>
              <option value="focus_mode">Modo foco</option>
            </select>
          </Field>
          <Field label="Destino">
            <input className={inputClass} value={action.appTarget || action.url || action.commandText || ''} onChange={(event) => onChange({ ...action, appTarget: action.command === 'open_app' ? event.target.value : undefined, url: action.command === 'open_url' ? event.target.value : undefined, commandText: action.command === 'execute_local_command' ? event.target.value : undefined })} placeholder="spotify / https://... / comando" />
          </Field>
        </div>
      ) : null}

      {action.kind === 'VOICE_ACTION' ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Texto falado"><input className={inputClass} value={action.speechText} onChange={(event) => onChange({ ...action, speechText: event.target.value })} /></Field>
          <Field label="Pedir confirmacao"><select className={inputClass} value={String(Boolean(action.requireConfirmation))} onChange={(event) => onChange({ ...action, requireConfirmation: event.target.value === 'true' })}><option value="false">Nao</option><option value="true">Sim</option></select></Field>
        </div>
      ) : null}

      {action.kind === 'WAIT_ACTION' ? (
        <div className="mt-4">
          <Field label="Esperar (ms)"><input className={inputClass} type="number" min={0} value={action.durationMs} onChange={(event) => onChange({ ...action, durationMs: Number(event.target.value) || 0 })} /></Field>
        </div>
      ) : null}

      {action.kind === 'SYSTEM_ACTION' ? (
        <div className="mt-4">
          <Field label="Acao de sistema"><select className={inputClass} value={action.action} onChange={(event) => onChange({ ...action, action: event.target.value as typeof action.action })}><option value="runtime_socket_reconnect">Reconectar runtime</option><option value="runtime_hydration_revalidate">Revalidar hydration</option><option value="runtime_restart_listening">Reiniciar escuta</option><option value="runtime_interrupt_playback">Interromper voz</option></select></Field>
        </div>
      ) : null}

      {action.kind === 'TASK_ACTION' ? (
        <div className="mt-4">
          <Field label="Automacao alvo"><select className={inputClass} value={action.targetAutomationId} onChange={(event) => onChange({ ...action, targetAutomationId: event.target.value })}><option value="">Selecionar automacao</option>{automations.map((automation) => <option key={automation.id} value={automation.id}>{automation.name}</option>)}</select></Field>
        </div>
      ) : null}

      {action.kind === 'TRIGGERCMD_ACTION' ? (
        <div className="mt-4 space-y-4">
          <Field label="Trigger real do bridge">
            <select className={inputClass} value={action.deviceId} onChange={(event) => {
              const device = triggerEntries.find((entry) => entry.id === event.target.value);
              onChange({ ...action, deviceId: event.target.value, action: device?.name || action.action, label: device?.name || action.label });
            }}>
              <option value="">Selecionar trigger real</option>
              {triggerEntries.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
            </select>
          </Field>
          {selectedTriggerDevice ? (
            <div className="grid gap-3 md:grid-cols-2">
              <InfoBlock label="Trigger Provider" value={selectedTriggerDevice.provider} />
              <InfoBlock label="Trigger Source" value={selectedTriggerDevice.source} />
              <InfoBlock label="Trigger Action" value={selectedTriggerDevice.cmd} />
              <InfoBlock label="Trigger Device" value={selectedTriggerDevice.app || selectedTriggerDevice.name} />
            </div>
          ) : (
            <InlineMuted>Escolha um trigger real ja vinculado ao token atual.</InlineMuted>
          )}
        </div>
      ) : null}

      {action.kind === 'EXECUTABLE_PATH_ACTION' ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Executavel salvo">
              <select className={inputClass} value={action.registryId || ''} onChange={(event) => {
                const executable = executables.find((entry) => entry.id === event.target.value);
                onChange({
                  ...action,
                  registryId: executable?.id,
                  executablePath: executable?.path || action.executablePath,
                  category: executable?.category || action.category,
                  icon: executable?.icon,
                  provider: executable?.provider || action.provider,
                  label: executable?.label || action.label,
                });
              }}>
                <option value="">Selecionar executavel salvo</option>
                {executables.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              </select>
            </Field>
            <Field label="Categoria">
              <input className={inputClass} value={action.category} onChange={(event) => onChange({ ...action, category: event.target.value })} placeholder="chat, musica, produtividade" />
            </Field>
          </div>
          <Field label="Path executavel">
            <input className={inputClass} value={action.executablePath} onChange={(event) => onChange({ ...action, executablePath: event.target.value })} placeholder="C:\\Program Files\\Discord\\Discord.exe" />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Provider">
              <select className={inputClass} value={action.provider} onChange={(event) => onChange({ ...action, provider: event.target.value as 'system_bridge' | 'triggercmd' })}>
                <option value="system_bridge">System bridge</option>
                <option value="triggercmd">TriggerCMD</option>
              </select>
            </Field>
            <Field label="Icone/rotulo curto">
              <input className={inputClass} value={action.icon || ''} onChange={(event) => onChange({ ...action, icon: event.target.value })} placeholder="discord" />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <OrionButton
              variant="secondary"
              size="sm"
              onClick={() => {
                if (!isExecutablePathValid(action.executablePath)) {
                  return;
                }
                automationAssetRegistry.saveExecutable({
                  id: action.registryId,
                  path: action.executablePath,
                  label: action.label,
                  category: action.category,
                  icon: action.icon,
                  provider: action.provider,
                });
                onExecutableSaved();
              }}
              disabled={!isExecutablePathValid(action.executablePath)}
            >
              <LucideSparkles size={14} /> SALVAR_EXECUTAVEL
            </OrionButton>
            <span className="text-xs text-neutral-500">{isExecutablePathValid(action.executablePath) ? 'Path valido para bridge local.' : 'Use um path Windows valido (.exe, .bat, .cmd, .ps1, .lnk, .url).'}</span>
          </div>
        </div>
      ) : null}

      {action.kind === 'FUTURE_DEVICE_ACTION' ? (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="Placeholder Wi-Fi"><select className={inputClass} value={action.action} onChange={(event) => onChange({ ...action, action: event.target.value as typeof action.action })}><option value="wifi_device_command">Wi-Fi command</option><option value="smart_light_toggle">Smart light toggle</option><option value="smart_scene_activate">Smart scene activate</option></select></Field>
          <Field label="Target ID"><input className={inputClass} value={action.targetId || ''} onChange={(event) => onChange({ ...action, targetId: event.target.value })} placeholder="future-device-01" /></Field>
          <Field label="Valor"><input className={inputClass} value={action.value || ''} onChange={(event) => onChange({ ...action, value: event.target.value })} placeholder="on / cena" /></Field>
        </div>
      ) : null}
    </div>
  );
}

function EditorPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <p className="mb-4 text-[10px] font-mono uppercase tracking-[0.45em] text-primary">{title}</p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/5 px-6 py-5">
      <p className="mb-3 text-[10px] font-mono uppercase tracking-[0.35em] text-neutral-500">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function MiniActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.25em] text-primary transition hover:bg-primary/15" onClick={onClick}>
      {label}
    </button>
  );
}

function RowPill({ title, subtitle, accent }: { title: string; subtitle: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">{subtitle}</p>
      </div>
      {accent ? <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-primary">{accent}</span> : null}
    </div>
  );
}

function AutomationFlowPreview({ draft, automations, triggerEntries }: { draft: AutomationDraft; automations: AutomationRecord[]; triggerEntries: TriggerRegistryEntry[] }) {
  const actionSummary = draft.data.actions.length
    ? draft.data.actions.map((action) => describeAction(action, triggerEntries, automations)).join(' -> ')
    : 'Nenhuma acao';

  return (
    <div className="space-y-4">
      <FlowNode title="QUANDO" body={describeTrigger(draft.data.trigger)} />
      <FlowConnector />
      <FlowNode title="SE" body={draft.data.conditions.length ? draft.data.conditions.map(describeCondition).join(' + ') : 'Sem condicoes extras'} />
      <FlowConnector />
      <FlowNode title="ENTAO" body={actionSummary} />
      <FlowConnector />
      <FlowNode title="EXECUCAO" body={`cooldown ${formatDurationMs(draft.data.schedule.cooldownMs)} | retries ${draft.data.schedule.retries} | limite semanal ${draft.data.schedule.weeklyExecutionLimit || 'sem limite'}`} />
    </div>
  );
}

function FlowNode({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/[0.05] p-4">
      <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.35em] text-primary">{title}</p>
      <p className="text-sm text-white">{body}</p>
    </div>
  );
}

function FlowConnector() {
  return <div className="mx-auto h-6 w-px bg-gradient-to-b from-primary/60 to-transparent" />;
}

function InlineMuted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-neutral-500">{children}</p>;
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <OrionCard variant="default" className="group p-8">
      <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.4em] text-neutral-600">{label}</p>
      <div className="flex items-end gap-3">
        <h4 className="text-4xl font-display font-black italic tracking-tighter text-white transition-colors group-hover:text-primary">{value}</h4>
        <span className="mb-1.5 text-[9px] font-mono uppercase tracking-widest text-primary">{sub}</span>
      </div>
    </OrionCard>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <p className="mb-1 text-[10px] font-mono uppercase tracking-[0.35em] text-neutral-600">{label}</p>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: 'neutral' | 'success' | 'warning' | 'critical' | 'active' }) {
  const toneClass = {
    neutral: 'border-white/10 bg-white/5 text-neutral-400',
    success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
    critical: 'border-red-500/20 bg-red-500/10 text-red-300',
    active: 'border-primary/20 bg-primary/10 text-primary',
  };
  return <span className={`rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.25em] ${toneClass[tone]}`}>{label}</span>;
}

function resolveTriggerPreset(trigger: AutomationTrigger): TriggerPresetId {
  if (trigger.type === 'VOICE_TRIGGERED') return 'voice';
  if (trigger.type === 'MANUAL') return 'manual';
  if (trigger.type === 'SYSTEM_TRIGGERED') {
    if (trigger.event === 'startup') return 'startup';
    if (trigger.event === 'socket_disconnected') return 'internet_down';
    return 'app_opened';
  }
  if (trigger.type === 'TIME_BASED') {
    if (trigger.scheduleMode === 'interval') return 'interval';
    if (trigger.scheduleMode === 'one_shot') return 'relative_delay';
    return 'fixed_time';
  }
  return 'manual';
}

function applyTriggerPreset(data: AutomationDraft['data'], preset: TriggerPresetId): AutomationDraft['data'] {
  if (preset === 'voice') {
    return { ...data, type: 'VOICE_TRIGGERED', trigger: { type: 'VOICE_TRIGGERED', phrase: '', aliases: [], sensitivity: 'medium' } };
  }
  if (preset === 'fixed_time') {
    return { ...data, type: 'TIME_BASED', trigger: { type: 'TIME_BASED', scheduleMode: 'fixed_time', time: '07:30', intervalMinutes: null, delayMs: 0, oneShotAt: null, activeDays: ['mon', 'tue', 'wed', 'thu', 'fri'], recurrence: 'weekdays' } };
  }
  if (preset === 'interval') {
    return { ...data, type: 'TIME_BASED', trigger: { type: 'TIME_BASED', scheduleMode: 'interval', time: '07:30', intervalMinutes: 30, delayMs: 0, oneShotAt: null, activeDays: ['mon', 'tue', 'wed', 'thu', 'fri'], recurrence: 'daily' } };
  }
  if (preset === 'relative_delay') {
    return { ...data, type: 'TIME_BASED', trigger: { type: 'TIME_BASED', scheduleMode: 'one_shot', time: '07:30', intervalMinutes: null, delayMs: 0, oneShotAt: Date.now() + 5 * 60 * 1000, activeDays: ['mon'], recurrence: 'once' } };
  }
  if (preset === 'startup') {
    return { ...data, type: 'SYSTEM_TRIGGERED', trigger: { type: 'SYSTEM_TRIGGERED', event: 'startup' } };
  }
  if (preset === 'internet_down') {
    return { ...data, type: 'SYSTEM_TRIGGERED', trigger: { type: 'SYSTEM_TRIGGERED', event: 'socket_disconnected' } };
  }
  if (preset === 'app_opened') {
    return { ...data, type: 'SYSTEM_TRIGGERED', trigger: { type: 'SYSTEM_TRIGGERED', event: 'app_opened' } };
  }
  return { ...data, type: 'MANUAL', trigger: { type: 'MANUAL' } };
}

function validateDraft(draft: AutomationDraft): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!draft.data.name.trim()) {
    errors.push('Defina um titulo para a automacao.');
  }
  if (draft.data.actions.length === 0) {
    errors.push('Adicione pelo menos uma acao real.');
  }
  if (draft.data.trigger.type === 'VOICE_TRIGGERED' && !draft.data.trigger.phrase.trim()) {
    errors.push('Preencha a frase principal do trigger de voz.');
  }
  if (draft.data.trigger.type === 'TIME_BASED' && draft.data.trigger.scheduleMode === 'one_shot' && !draft.data.trigger.oneShotAt) {
    errors.push('Defina quando a execucao unica deve acontecer.');
  }
  for (const action of draft.data.actions) {
    if (action.kind === 'VOICE_ACTION' && !action.speechText.trim()) errors.push(`A acao "${action.label}" precisa de texto falado.`);
    if (action.kind === 'TASK_ACTION' && !action.targetAutomationId.trim()) errors.push(`A acao "${action.label}" precisa de automacao alvo.`);
    if (action.kind === 'TRIGGERCMD_ACTION' && (!action.deviceId.trim() || !action.action.trim())) errors.push(`A acao "${action.label}" precisa de um trigger real do TriggerCMD.`);
    if (action.kind === 'EXECUTABLE_PATH_ACTION' && !isExecutablePathValid(action.executablePath)) errors.push(`A acao "${action.label}" precisa de um path executavel valido.`);
    if (action.kind === 'LOCAL_COMMAND' && action.command === 'open_url' && !(action.url || '').trim()) errors.push(`A acao "${action.label}" precisa de uma URL.`);
  }
  return { valid: errors.length === 0, errors };
}

function buildHumanPreview(data: AutomationDraft['data'], devices: TriggerDevice[], automations: AutomationRecord[]): string {
  const triggerText = describeTrigger(data.trigger);
  const conditionText = data.conditions.length ? data.conditions.map(describeCondition).slice(0, 2).join(' e ') : '';
  const windowText = describeWindow(data.schedule.activeWindowStart, data.schedule.activeWindowEnd);
  const actionsText = data.actions.slice(0, 3).map((action) => describeAction(action, devices, automations)).join(', ');
  const parts = [`Quando ${lowercaseFirst(triggerText)}`];
  if (conditionText) parts.push(`e ${lowercaseFirst(conditionText)}`);
  if (windowText !== 'Sempre') parts.push(`dentro da janela ${lowercaseFirst(windowText)}`);
  parts.push(`entao ${lowercaseFirst(actionsText || 'executar a rotina')}.`);
  return parts.join(', ');
}

function buildOperationalPreview(data: AutomationDraft['data'], devices: TriggerDevice[], automations: AutomationRecord[]): string[] {
  const lines = data.actions.map((action) => describeAction(action, devices, automations));
  lines.push(`trigger: ${describeTrigger(data.trigger)}`);
  if (data.trigger.type === 'TIME_BASED' && data.trigger.recurrence === 'custom') {
    lines.push(`dias: ${humanizeRecurrence(data.trigger.recurrence, data.trigger.activeDays)}`);
  }
  if (data.conditions.length) {
    lines.push(`condicoes: ${data.conditions.map(describeCondition).join(', ')}`);
  }
  lines.push(`cooldown: ${formatDurationMs(data.schedule.cooldownMs)}`);
  lines.push(`retries: ${data.schedule.retries}`);
  lines.push(`limite semanal: ${data.schedule.weeklyExecutionLimit || 'sem limite'}`);
  return lines;
}

function describeTrigger(trigger: AutomationTrigger): string {
  if (trigger.type === 'TIME_BASED') {
    if (trigger.scheduleMode === 'interval') {
      return `passarem ${formatInterval(trigger.intervalMinutes || 30)}`;
    }
    if (trigger.scheduleMode === 'one_shot') {
      return trigger.oneShotAt ? `for ${formatTimestamp(trigger.oneShotAt)}` : 'for uma execucao unica';
    }
    return `for ${trigger.time} (${humanizeRecurrence(trigger.recurrence, trigger.activeDays)})`;
  }
  if (trigger.type === 'VOICE_TRIGGERED') {
    return `eu falar "${trigger.phrase || 'frase personalizada'}"`;
  }
  if (trigger.type === 'SYSTEM_TRIGGERED') {
    if (trigger.event === 'startup') return 'ORION iniciar';
    if (trigger.event === 'socket_disconnected') return 'a internet cair';
    if (trigger.event === 'app_opened') return 'abrir um app';
    if (trigger.event === 'recovery') return 'o recovery iniciar';
    return 'o runtime reconectar';
  }
  if (trigger.type === 'FUTURE_DEVICE_TRIGGER') {
    return `o dispositivo ${trigger.targetId || 'alvo'} mudar para ${trigger.expectedState || 'online'}`;
  }
  return 'rodar manualmente';
}

function describeCondition(condition: AutomationCondition): string {
  if (condition.type === 'time_window') return `for entre ${condition.startTime} e ${condition.endTime}`;
  if (condition.type === 'day') return `for ${condition.days.map((day) => DAY_OPTIONS.find((entry) => entry.key === day)?.label || day).join(', ')}`;
  if (condition.type === 'lifecycle') return `o lifecycle estiver em ${condition.lifecycle}`;
  if (condition.type === 'socket_connected') return `socket conectado = ${condition.expected ? 'sim' : 'nao'}`;
  if (condition.type === 'user_active') return `usuario ativo = ${condition.expected ? 'sim' : 'nao'}`;
  return `focus mode = ${condition.expected ? 'sim' : 'nao'}`;
}

function describeAction(action: AutomationAction, devices: TriggerDevice[] = [], automations: AutomationRecord[] = []): string {
  if (action.kind === 'LOCAL_COMMAND') {
    if (action.command === 'open_app') return `abrir ${action.appTarget || 'app'}`;
    if (action.command === 'open_url') return `abrir ${action.url || 'URL'}`;
    if (action.command === 'execute_local_command') return `executar comando local`;
    if (action.command === 'performance_mode') return 'ativar modo performance';
    return 'ativar modo foco';
  }
  if (action.kind === 'VOICE_ACTION') return `falar "${action.speechText || 'mensagem'}"`;
  if (action.kind === 'WAIT_ACTION') return `esperar ${formatDurationMs(action.durationMs)}`;
  if (action.kind === 'SYSTEM_ACTION') return humanizeSystemAction(action.action);
  if (action.kind === 'TASK_ACTION') return `executar ${automations.find((automation) => automation.id === action.targetAutomationId)?.name || 'outra automacao'}`;
  if (action.kind === 'TRIGGERCMD_ACTION') return `disparar ${devices.find((device) => device.id === action.deviceId)?.name || action.action || 'trigger real do bridge'}`;
  if (action.kind === 'EXECUTABLE_PATH_ACTION') return `executar ${action.label || action.executablePath}`;
  return `${action.action} ${action.targetId || ''}`.trim();
}

function resolveActionAccent(action: AutomationAction): string | undefined {
  if (action.kind === 'WAIT_ACTION') return formatDurationMs(action.durationMs);
  if ('delayMs' in action && action.delayMs) return formatDurationMs(action.delayMs);
  return undefined;
}

function humanizeType(type: AutomationRecord['type']): string {
  if (type === 'TIME_BASED') return 'agendada';
  if (type === 'VOICE_TRIGGERED') return 'voz';
  if (type === 'SYSTEM_TRIGGERED') return 'evento';
  if (type === 'FUTURE_DEVICE_TRIGGER') return 'dispositivo';
  return 'manual';
}

function humanizeActionKind(kind: AutomationAction['kind']): string {
  if (kind === 'LOCAL_COMMAND') return 'Acao local';
  if (kind === 'VOICE_ACTION') return 'Fala';
  if (kind === 'WAIT_ACTION') return 'Espera';
  if (kind === 'SYSTEM_ACTION') return 'Sistema';
  if (kind === 'TASK_ACTION') return 'Automacao';
  if (kind === 'TRIGGERCMD_ACTION') return 'TriggerCMD';
  if (kind === 'EXECUTABLE_PATH_ACTION') return 'Executavel';
  return 'Wi-Fi futuro';
}

function humanizeSystemAction(action: string): string {
  if (action === 'runtime_socket_reconnect') return 'reconectar runtime';
  if (action === 'runtime_hydration_revalidate') return 'revalidar hydration';
  if (action === 'runtime_restart_listening') return 'reiniciar escuta';
  if (action === 'runtime_interrupt_playback') return 'interromper fala';
  return String(action);
}

function humanizeRecurrence(recurrence: 'daily' | 'weekdays' | 'weekend' | 'custom' | 'once', activeDays: AutomationDay[]): string {
  if (recurrence === 'daily') return 'todo dia';
  if (recurrence === 'weekdays') return 'dias uteis';
  if (recurrence === 'weekend') return 'fim de semana';
  if (recurrence === 'once') return 'uma vez';
  return activeDays.map((day) => DAY_OPTIONS.find((entry) => entry.key === day)?.label || day).join(', ');
}

function resolveStateTone(state: AutomationRecord['state']): 'neutral' | 'success' | 'warning' | 'critical' | 'active' {
  if (state === 'running') return 'active';
  if (state === 'completed') return 'success';
  if (state === 'failed' || state === 'cancelled') return 'critical';
  if (state === 'scheduled' || state === 'waiting') return 'warning';
  return 'neutral';
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function formatOptionalTimestamp(timestamp: number | null): string {
  return timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'nunca';
}

function formatDurationMs(durationMs: number): string {
  if (!durationMs) return 'Sem cooldown';
  if (durationMs % 3600000 === 0) return `${durationMs / 3600000}h`;
  if (durationMs % 60000 === 0) return `${durationMs / 60000}min`;
  if (durationMs % 1000 === 0) return `${durationMs / 1000}s`;
  return `${durationMs}ms`;
}

function formatInterval(intervalMinutes: number): string {
  if (intervalMinutes % 60 === 0) return `${intervalMinutes / 60} hora(s)`;
  return `${intervalMinutes} minuto(s)`;
}

function describeWindow(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return 'Sempre';
  return `${start} ate ${end}`;
}

function createAction(kind: AutomationAction['kind'], command?: 'open_app' | 'open_url' | 'execute_local_command') : AutomationAction {
  const id = createId('action');
  if (kind === 'LOCAL_COMMAND' && command === 'open_url') return { id, kind, label: 'Abrir URL', command: 'open_url', url: '', delayMs: 0 };
  if (kind === 'LOCAL_COMMAND' && command === 'execute_local_command') return { id, kind, label: 'Comando local', command: 'execute_local_command', commandText: '', delayMs: 0 };
  if (kind === 'LOCAL_COMMAND') return { id, kind, label: 'Abrir app', command: 'open_app', appTarget: 'spotify', delayMs: 0 };
  if (kind === 'VOICE_ACTION') return { id, kind, label: 'Falar algo', speechText: 'Rotina executada.', delayMs: 0 };
  if (kind === 'WAIT_ACTION') return { id, kind, label: 'Esperar', durationMs: 5000 };
  if (kind === 'SYSTEM_ACTION') return { id, kind, label: 'Reconectar runtime', action: 'runtime_socket_reconnect', delayMs: 0 };
  if (kind === 'TASK_ACTION') return { id, kind, label: 'Executar automacao', targetAutomationId: '', delayMs: 0 };
  if (kind === 'TRIGGERCMD_ACTION') return { id, kind, label: 'Trigger real do bridge', deviceId: '', action: '', delayMs: 0 };
  if (kind === 'EXECUTABLE_PATH_ACTION') return { id, kind, label: 'Executar aplicativo local', executablePath: '', category: 'desktop', icon: '', registryId: '', provider: 'system_bridge', delayMs: 0 };
  return { id, kind, label: 'Placeholder Wi-Fi', action: 'wifi_device_command', targetId: '', value: '', delayMs: 0 };
}

function createCondition(type: AutomationCondition['type']): AutomationCondition {
  const id = createId('condition');
  if (type === 'time_window') return { id, type, label: 'Janela de tempo', startTime: '18:00', endTime: '23:30' };
  if (type === 'day') return { id, type, label: 'Dias validos', days: ['mon', 'tue', 'wed', 'thu', 'fri'] };
  if (type === 'lifecycle') return { id, type, label: 'Lifecycle', lifecycle: 'active' };
  if (type === 'socket_connected') return { id, type, label: 'Socket conectado', expected: true };
  if (type === 'user_active') return { id, type, label: 'Usuario ativo', expected: true };
  return { id, type, label: 'Focus mode ativo', expected: true };
}

function reorderEntry<T>(items: T[], index: number, direction: -1 | 1, commit: (next: T[]) => void) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return;
  }
  const next = items.slice();
  const [entry] = next.splice(index, 1);
  next.splice(targetIndex, 0, entry);
  commit(next);
}

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function lowercaseFirst(value: string): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function toDateTimeLocalValue(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

const inputClass = 'w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-primary/40';
