# OPERATIONAL DEPENDENCY MATRIX

Data da baseline: 2026-06-04

| Módulo | Dependências | Impacto se alterado | Nível de risco |
|---|---|---|---|
| Android Awareness | `window.AndroidOrionBridge`, `orion:android-event`, `useAndroidAwarenessStore`, `logger` | Pode perder telemetria nativa e desalinhar o estado Android da UI | Alto |
| Executor de Ações | `ActionExecutorEngine`, `AndroidActionHandler`, `RuntimeActionHandler`, `AutomationActionHandler` | Pode executar a ação errada ou falhar em categorias suportadas | Alto |
| MQTT | `socketManager`, `socketRuntime`, `stateSync`, `ProductionRecoveryEngine`, `runtimeIdentity` | Pode quebrar o loop de saúde, publish e reconciliação | Alto |
| TriggerCMD | `socket.io`, `apiClient`, `runtimeIdentity`, `fetch`, `fs`, `path` | Pode quebrar sync, persistência e execução remota | Alto |
| RuntimeIdentity | `useAuthStore`, `window.localStorage`, `logger` | Pode quebrar ownership, preview mode e permissões | Crítico |
| Voice Runtime | `speechPipeline`, `voiceStateEngine`, `environmentRuntime`, `runtimeIdentity`, `socketRuntime`, `useVoiceStore`, `useRuntimeStore` | Pode quebrar bootstrap, fallback e recuperação do provedor | Alto |
| Task Runtime | `runtimeIdentity`, `commandQueue`, `ScopedBrowserStorage`, `useAuthStore`, `localStorage` | Pode quebrar restore, persistência e integridade de tarefas | Alto |
| Automation Runtime | `runtimeIdentity`, `taskRuntime`, `socketRuntime`, `useAutomationStore`, `localStorage` | Pode quebrar drafts, dispatch e persistência de automações | Alto |
| Google Home | `fetch`, `socketRuntime`, `deviceRegistry`, `realtimeDeviceStateEngine`, `DeviceMonitoring`, `useDeviceStore` | Pode quebrar snapshot, sincronização e registro de dispositivos | Médio-Alto |

