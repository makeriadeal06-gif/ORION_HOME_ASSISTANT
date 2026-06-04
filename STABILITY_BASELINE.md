# STABILITY BASELINE

Data da baseline: 2026-06-04

## Objetivo

Congelar a baseline estável atual antes de qualquer nova evolução. Esta fase documenta, protege e consolida o estado validado sem alterar comportamento, APIs, contratos ou arquitetura.

## Módulos Congelados

- `RuntimeIdentity`
- Sistema de autenticação
- `TriggerCMD`
- Persistência de tarefas
- Persistência de automações
- `Socket Runtime`
- Sistema principal de voz
- `Google Home Integration`

## Funcionalidades Validadas

- Identidade de runtime com isolamento por owner/session/device.
- Fluxo de autenticação com transições entre preview, restoring, authenticating e authenticated.
- Sincronização, hidratação e execução do `TriggerCMD`.
- Persistência e restauração de tarefas com guarda de ownership.
- Persistência e restauração de automações com guarda de ownership.
- Transporte socket com reconexão, telemetria e recuperação de estado.
- Runtime principal de voz com fallback controlado e recuperação de provedor.
- Integração Google Home com snapshot passivo e fallback local quando a fonte real não responde.

## Mapa De Módulos Estáveis

| Módulo | Arquivos envolvidos | Responsabilidades | Dependências principais | Impacto de alteração |
|---|---|---|---|---|
| RuntimeIdentity | `client/core/runtime/RuntimeIdentity.ts`, `client/core/state/stores/useAuthStore.ts` | Identidade do runtime, validação de escopo, permissões de execução, proteção de sessão/owner/device | `useAuthStore`, `logger`, `window.localStorage` | Alto: qualquer ajuste pode quebrar isolamento multi-tenant, restore e permissões |
| Sistema de autenticação | `client/core/auth/runtime/AuthManager.ts`, `client/core/auth/session/SessionRestore.ts`, `client/core/auth/persistence/SessionPersistence.ts`, `client/core/auth/guards/AuthGuard.ts`, `client/core/auth/runtime/AuthTransitionCoordinator.ts`, `server/services/AuthService.ts` | Boot, restore, login/logout, sincronização de sessão e coordenação de transições | `FirebaseAdapter`, `useAuthStore`, `stateSync`, `triggerManager`, `SessionPersistence` | Alto: afeta entrada do usuário, preview/auth e hidratação de todo o runtime |
| TriggerCMD | `server/services/TriggerCMDService.ts`, `client/core/runtime/TriggerManager.ts`, `modules/triggercmd/views/TriggerCMDView.tsx`, `server/server.ts` | Sincronização de dispositivos, execução remota, cache por usuário, hidratação no client | `socket.io`, `runtimeIdentity`, `apiClient`, `fs`, `fetch`, `trigger:devices`, `trigger:execute` | Alto: muda execução remota, sincronização e persistência de config |
| Persistência de tarefas | `client/core/task-runtime/TaskRuntime.ts`, `client/core/task-runtime/types.ts`, `client/core/command-runtime/execution/CommandExecutionQueue.ts`, `client/core/runtime/ScopedBrowserStorage.ts` | Snapshot, restore, watchdog, fila de execução, ownership de tarefas | `runtimeIdentity`, `commandQueue`, `useAuthStore`, `localStorage` | Alto: pode invalidar tarefas persistidas, recovery e deduplicação |
| Persistência de automações | `client/core/automation-runtime/AutomationStore.ts`, `client/core/automation-runtime/types.ts`, `client/core/automation-runtime/AutomationAssetRegistry.ts`, `client/core/state/stores/useAutomationStore.ts` | Snapshot, drafts, restore, trigger de automações, integração com tarefas | `runtimeIdentity`, `taskRuntime`, `socketRuntime`, `useAutomationStore`, `localStorage` | Alto: pode afetar persistência, disparo e integridade das automações |
| Socket Runtime | `client/core/socket/SocketRuntime.ts`, `client/core/socket/SocketLifecycle.ts`, `client/core/socket/SocketRecovery.ts`, `client/core/socket/SocketTransport.ts`, `client/core/socket/SocketManager.ts` | Conexão persistente, telemetria, reconexão e contexto do runtime | `socket.io-client`, `ProductionRecoveryEngine`, `window`, `logger` | Alto: altera disponibilidade do canal principal de sincronização |
| Sistema principal de voz | `client/core/voice-runtime/VoiceRuntimeManager.ts`, `client/core/voice-runtime/pipeline/SpeechPipeline.ts`, `client/core/voice-runtime/state/VoiceStateEngine.ts`, `client/core/voice-runtime/state/useVoiceStore.ts` | Bootstrap de voz, fallback controlado, recuperação de provedor e autoridade de playback | `environmentRuntime`, `runtimeIdentity`, `socketRuntime`, `useRuntimeStore`, `useVoiceStore` | Alto: qualquer mudança pode degradar captura, TTS ou recuperação de provedor |
| Google Home Integration | `server/services/GoogleHomeService.ts`, `client/core/google-home/runtime/GoogleHomeRuntime.ts`, `client/core/google-home/registry/OrionDeviceRegistry.ts`, `client/core/device-runtime/realtime/RealtimeDeviceStateEngine.ts`, `client/core/device-runtime/monitoring/DeviceMonitoring.ts` | Snapshot de ecossistema, fallback local e sincronização passiva | `fetch`, `socketRuntime`, registry de dispositivos, engines de dispositivo | Médio-alto: pode afetar devices, snapshots e sincronização visual |

## Protected Stability Zone

### Arquivos protegidos

- `server/services/TriggerCMDService.ts`
- `client/core/runtime/TriggerManager.ts`
- `client/core/runtime/RuntimeIdentity.ts`
- `client/core/socket/SocketRuntime.ts`
- `client/core/runtime/ExecutionGuard.ts` - não existe como arquivo separado; a função equivalente está consolidada em `RuntimeIdentity.ts`.
- `client/core/runtime/PersistenceManager.ts` - não existe como arquivo separado; a responsabilidade equivalente está distribuída entre `TaskRuntime.ts` e `AutomationStore.ts`.

### Motivo da proteção

- `TriggerCMDService.ts`: concentra sync, cache, persistência e execução remota do TriggerCMD.
- `TriggerManager.ts`: faz a ponte entre socket, auth e execução do TriggerCMD no client.
- `RuntimeIdentity.ts`: é a fonte de verdade das permissões de execução e do escopo do runtime.
- `SocketRuntime.ts`: sustenta o canal persistente usado por hidratação, reconexão e eventos.
- `ExecutionGuard` lógico: já está embutido no `RuntimeIdentity`; qualquer mudança altera o modelo de permissão.
- `PersistenceManager` lógico: a persistência está acoplada aos runtimes de tarefas e automações; mexer nela afeta restauração e ownership.

## Problemas Conhecidos

- O MQTT permanece funcional, mas em estado lógico `degraded`. Não investigar nesta fase.
- Existem arquivos históricos e assets de build no tree de trabalho que não fazem parte do freeze.
- Os nomes `ExecutionGuard` e `PersistenceManager` não existem como arquivos isolados neste repositório.

## Riscos Futuros

- Alterações em `RuntimeIdentity` podem quebrar restore, ownership e isolamento multi-tenant.
- Mudanças em `TriggerCMDService` podem quebrar execução remota ou a compatibilidade com payloads do TriggerCMD.
- Ajustes em `SocketRuntime` podem afetar todo o fluxo de sincronização em tempo real.
- Evoluções em `TaskRuntime` e `AutomationStore` podem corromper snapshots persistidos ou duplicar execuções.
- Mudanças no sistema de voz podem romper fallback, bootstrap e recuperação de provedor.
- Mudanças em Google Home podem afetar o snapshot local e a sincronização passiva.

## Experimental / Fora Do Freeze

- MQTT refinement
- Orion Eyes
- Consciência Android
- Executor de ações
- Qualquer evolução nova não listada nas áreas congeladas
