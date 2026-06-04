# OPERATIONAL RISK MAP

Data da baseline: 2026-06-04

| Módulo | O que quebra se alterar | Impacto esperado | Criticidade |
|---|---|---|---|
| `TriggerCMDService` | Sync de dispositivos, persistência de config, execução remota | Usuários perdem comandos validados ou passam a ver cache inconsistente | Alto |
| `TriggerManager` | Hidratação client-side, auth bridge e execução via socket | UI deixa de refletir o estado do TriggerCMD ou não consegue disparar comandos | Alto |
| `RuntimeIdentity` | Ownership, preview mode, guardas de execução, restore scope | Falha sistêmica de segurança e de isolamento entre sessões/usuários | Crítico |
| `SocketRuntime` | Transporte principal, health metrics, reconexão | Perda da camada de eventos em tempo real e degradação global de sync | Alto |
| `MqttManager` | Estado MQTT, publish, watchdog e reconciliação | Loop de saúde pode ficar inválido ou degradar a ponte MQTT | Alto |
| `AndroidRuntimeManager` | Lifecycle Android, recovery, bridge, persistência | Estado Android fica desatualizado, com recuperação incompleta ou inexistente | Alto |
| `AndroidAwarenessEngine` | Captura de sinais Android e projeção no store | Perda de contexto operacional nativo e de indicadores de awareness | Alto |
| `ActionExecutorEngine` | Roteamento de ações por categoria | Execuções passam a cair em handler errado ou a falhar silenciosamente | Alto |
| `VoiceRuntimeManager` | Bootstrap, fallback, provider recovery, playback authority | Voz pode ficar presa em fallback ou deixar de responder corretamente | Alto |
| `TaskRuntime` | Snapshot, restore, watchdog, execução agendada | Tarefas podem duplicar, sumir ou perder consistência de estado | Alto |
| `AutomationStore` | Drafts, snapshot, dispatch e ownership | Automações podem deixar de persistir ou disparar fora de escopo | Alto |
| `GoogleHomeService` / `GoogleHomeRuntime` | Snapshot passivo, sync e registry | Dispositivos podem sumir da UI ou ficar com snapshot obsoleto | Médio-Alto |

