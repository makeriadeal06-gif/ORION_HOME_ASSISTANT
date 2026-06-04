# Dependência E Risco

| Módulo | Dependências | Impacto se alterado | Nível de risco |
|---|---|---|---|
| `RuntimeIdentity` | `useAuthStore`, `logger`, `window.localStorage` | Pode alterar permissões, restore e isolamento de sessão/owner/device | Alto |
| Sistema de autenticação | `FirebaseAdapter`, `useAuthStore`, `stateSync`, `SessionPersistence`, `AuthTransitionCoordinator`, `triggerManager` | Pode quebrar login/logout, restore e sincronização de sessão | Alto |
| `TriggerCMDService` | `socket.io`, `fs`, `path`, `fetch`, `Server`, variáveis `TRIGGERCMD_*` | Pode afetar sync, cache, persistência e execução remota | Alto |
| `TriggerManager` | `socketManager`, `apiClient`, `runtimeIdentity`, socket events `trigger:devices`/`trigger:execute` | Pode quebrar hidratação do client e a execução do TriggerCMD | Alto |
| Persistência de tarefas | `runtimeIdentity`, `commandQueue`, `ScopedBrowserStorage`, `useAuthStore`, `localStorage` | Pode invalidar snapshot, restore, watchdog e deduplicação | Alto |
| Persistência de automações | `runtimeIdentity`, `taskRuntime`, `socketRuntime`, `useAutomationStore`, `localStorage` | Pode quebrar drafts, restore e disparo de automações | Alto |
| `SocketRuntime` | `socket.io-client`, `ProductionRecoveryEngine`, `window`, `logger` | Pode derrubar o transporte principal de eventos em tempo real | Alto |
| Sistema principal de voz | `speechPipeline`, `voiceStateEngine`, `environmentRuntime`, `runtimeIdentity`, `socketRuntime`, `useRuntimeStore`, `useVoiceStore` | Pode afetar bootstrap, playback, fallback e recuperação de provedor | Alto |
| Google Home Integration | `fetch`, `socketRuntime`, `deviceRegistry`, `realtimeDeviceStateEngine`, `DeviceMonitoring` | Pode afetar snapshot, cache e sincronização de dispositivos | Médio-alto |

