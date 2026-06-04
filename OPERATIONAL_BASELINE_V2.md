# OPERATIONAL BASELINE V2

Data da baseline: 2026-06-04

## Objetivo

Registrar o estado operacional do Orion imediatamente antes da implementação da Consciência Operacional. Esta baseline congela a arquitetura observada no código atual e não introduz mudanças de comportamento.

## Arquitetura Atual

O Orion está organizado em camadas operacionais que cooperam por meio de stores, runtimes e serviços:

- `Auth` como gatilho de identidade e sessão.
- `RuntimeIdentity` como autoridade de escopo, ownership e permissões.
- `Socket Runtime` como canal persistente de sincronização.
- `TriggerCMD` como bridge de comandos remotos e cache por usuário.
- `Task Runtime` como persistência e orquestração de tarefas.
- `Automation Runtime` como persistência, regras e dispatch de automações.
- `Voice Runtime` como runtime principal de voz e recuperação de provedor.
- `Android Runtime` como camada de execução e consciência local no dispositivo.
- `Android Awareness` como sensor/estado operacional da plataforma Android.
- `Action Executor` como roteador de ações entre domínios.
- `Google Home` como integração de ecossistema e snapshot passivo.
- `MQTT` como transporte operacional funcional, porém sujeito a monitoramento fino e reconciliação.

## Módulos Estáveis

- `RuntimeIdentity`
- Sistema de autenticação
- `TriggerCMD`
- Persistência de tarefas
- Persistência de automações
- `Socket Runtime`
- Sistema principal de voz
- `Android Runtime`
- `Android Awareness`
- `Action Executor`
- `Google Home Integration`
- `MQTT`

## Dependências Críticas

- `useAuthStore` e estado de auth para iniciar ou bloquear runtimes.
- `socket.io` e `socket.io-client` para sincronização e eventos em tempo real.
- `window.localStorage` para snapshots persistidos em `TaskRuntime`, `AutomationStore` e `AndroidRuntimeManager`.
- `fetch` e endpoints HTTP para `TriggerCMD`, `Voice` e Google Home.
- `runtimeIdentity` como guarda de ownership, preview mode e persistência autorizada.
- `ProductionRecoveryEngine` como ponto de telemetria e recuperação para socket/MQTT.
- `useVoiceStore`, `useAutomationStore`, `useAndroidAwarenessStore` e stores correlatas para projeção do estado em UI.

## Runtime Principal

O runtime principal é composto por:

- `client/core/runtime/RuntimeIdentity.ts`
- `client/core/runtime/TriggerManager.ts`
- `client/core/socket/SocketRuntime.ts`
- `client/core/runtime/MqttManager.ts`
- `client/core/task-runtime/TaskRuntime.ts`
- `client/core/automation-runtime/AutomationStore.ts`
- `client/core/voice-runtime/VoiceRuntimeManager.ts`
- `client/core/android-runtime/AndroidRuntimeManager.ts`
- `client/core/android-runtime/awareness/AndroidAwarenessEngine.ts`
- `client/core/action-executor/ActionExecutorEngine.ts`
- `client/core/google-home/runtime/GoogleHomeRuntime.ts`
- `server/services/TriggerCMDService.ts`
- `server/services/GoogleHomeService.ts`

## Integrações Existentes

- `TriggerCMD` via `trigger:devices`, `trigger:execute`, `/triggercmd/config` e `/triggercmd/sync`.
- `Google Home` via `google:device_sync` e `/api/google-home/ecosystem`.
- `Voice Runtime` via `speechPipeline`, `VoiceStateEngine`, `useVoiceStore` e `environmentRuntime`.
- `Android Runtime` via `window.AndroidOrionBridge`, `orion:android-event` e `orion:runtime-context`.
- `MQTT` via `mqtt:status`, `mqtt:telemetry`, `mqtt:message` e `mqtt:publish`.
- `Task Runtime` e `Automation Runtime` via `orion:runtime-context`, `commandQueue` e snapshots locais.
- `Action Executor` via roteamento por categoria `android`, `runtime` e `automation`.

## Fluxos Protegidos

- Auth boot, restore e transições entre preview, restoring, authenticating e authenticated.
- Isolamento por owner/session/device em `RuntimeIdentity`.
- Sync e execução do `TriggerCMD` com cache e persistência de config.
- Snapshot, restore e watchdog de tarefas.
- Snapshot, drafts e restore de automações.
- Bootstrap, fallback e recuperação do sistema de voz.
- Conexão, health loop e reconciliação do `Socket Runtime`.
- Estado operacional e recovery loop do `MQTT`.
- Estado e recuperação do Android runtime.
- Coleta e projeção de awareness Android.
- Roteamento de ações entre Android, runtime e automação.
- Snapshot passivo e atualização de Google Home.

## Módulos Congelados

### Protected Stability Zone

| Módulo | Função | Dependências | Riscos de alteração |
|---|---|---|---|
| `server/services/TriggerCMDService.ts` | Sync, cache, persistência e execução remota de TriggerCMD | `socket.io`, `fs`, `fetch`, `runtimeIdentity` | Quebra de sync, mismatch de payload, perda de cache por usuário |
| `client/core/runtime/TriggerManager.ts` | Ponte client-side para auth, sync e execução TriggerCMD | `socketManager`, `apiClient`, `runtimeIdentity` | Quebra de hidratação e execução via socket/API |
| `client/core/runtime/RuntimeIdentity.ts` | Autoridade de ownership, preview mode e guardas de execução | `useAuthStore`, `localStorage`, `logger` | Quebra de segurança de escopo, restore e permissões |
| `client/core/socket/SocketRuntime.ts` | Transporte socket persistente e telemetria | `socket.io-client`, `ProductionRecoveryEngine` | Interrupção do canal de eventos e reconciliação |
| `client/core/runtime/MqttManager.ts` | Saúde, reconciliação e publish MQTT | `socketManager`, `socketRuntime`, `stateSync`, `runtimeIdentity` | Degradação do transporte, loops de reconnect, estado inválido |
| `client/core/android-runtime/AndroidRuntimeManager.ts` | Orquestração principal do runtime Android | `runtimeIdentity`, `socketRuntime`, `triggerManager`, `useVoiceStore` | Quebra de lifecycle, recovery e bridge nativa |
| `client/core/android-runtime/awareness/AndroidAwarenessEngine.ts` | Captação e projeção de awareness Android | `window.AndroidOrionBridge`, `useAndroidAwarenessStore` | Perda do estado operacional Android e sinalização nativa |
| `client/core/action-executor/ActionExecutorEngine.ts` | Roteamento de ações por categoria | `AndroidActionHandler`, `RuntimeActionHandler`, `AutomationActionHandler` | Execução incorreta, queda de compatibilidade entre domínios |
| `client/core/voice-runtime/VoiceRuntimeManager.ts` | Bootstrap e recovery do Voice Runtime | `environmentRuntime`, `runtimeIdentity`, `socketRuntime`, `useVoiceStore` | Quebra de fallback, playback e recuperação de provedor |
| `client/core/task-runtime/TaskRuntime.ts` | Persistência, restore e execução de tarefas | `runtimeIdentity`, `commandQueue`, `ScopedBrowserStorage`, `useAuthStore` | Corrupção de snapshots, duplicação ou perda de tarefas |
| `client/core/automation-runtime/AutomationStore.ts` | Persistência, drafts e dispatch de automações | `runtimeIdentity`, `taskRuntime`, `socketRuntime`, `useAutomationStore` | Corrupção de automações e eventos, perda de ownership |

## Problemas Conhecidos

- O MQTT segue funcional, mas requer leitura cuidadosa do estado lógico e da reconciliação.
- Existem mudanças locais já presentes no worktree que não fazem parte desta baseline.
- O repositório contém áreas novas de Android Awareness e Action Executor que foram incluídas nesta baseline operacional.

## Riscos Futuros

- Qualquer alteração em `RuntimeIdentity` afeta o modelo de autorização completo.
- Alterações em `SocketRuntime` ou `MqttManager` podem quebrar o caminho de sincronização e health recovery.
- Mudanças em `TaskRuntime` ou `AutomationStore` podem invalidar snapshots e ownership.
- Mudanças em `VoiceRuntimeManager` podem afetar recovery de provedor e UX de voz.
- Mudanças em `AndroidRuntimeManager` ou `AndroidAwarenessEngine` podem degradar a integração nativa.
- Mudanças em `ActionExecutorEngine` podem desalinhar categorias de ação e handlers.
- Mudanças em `TriggerCMDService` podem quebrar o canal remoto validado.
- Mudanças em Google Home podem afetar snapshot e descoberta passiva.

