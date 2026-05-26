# ORION PATCH RULES

## Objetivo

Estas regras existem para impedir regressões arquiteturais e preservar os sistemas estabilizados do ORION.

---

# ARQUITETURA CONGELADA

O ORION utiliza:

* runtime único
* queue única
* hydration/recovery persistente
* ownership/auth scoping
* snapshots incrementais
* freezes arquiteturais
* persistence por ownerId/session/device
* automation runtime persistente
* PresenceRuntime
* EnvironmentRuntime
* TaskRuntime
* AndroidRuntimeManager
* TriggerCMD integration
* VoiceRuntimeManager
* SpeechPipeline
* CommandExecutionQueue

---

# REGRAS OBRIGATÓRIAS

NUNCA:

* criar runtime paralelo
* criar queue nova
* criar scheduler externo
* substituir hydration
* substituir recovery
* alterar ownership/auth scope
* quebrar serialization
* remover stale protection
* reestruturar SpeechPipeline
* reestruturar TaskRuntime
* reestruturar AndroidRuntimeManager
* reestruturar CommandExecutionQueue
* remover snapshots
* alterar freezes sem relock
* promover browser fallback como provider persistente
* quebrar automation persistence

---

# SISTEMAS ESTABILIZADOS

Estes sistemas já estão estabilizados:

* ownership/auth runtime
* automation persistence
* preview mode
* environment runtime
* presence runtime
* TriggerCMD ownership
* scoped memory
* hydration barriers
* runtime identity
* provider authority
* fallback lease system
* integrity snapshots
* auth transition coordinator

---

# REGRAS DE PATCH

Sempre:

1. atuar apenas nos arquivos necessários
2. evitar reler o projeto inteiro
3. preservar arquitetura atual
4. executar build após alterações
5. executar verify-integrity após alterações
6. atualizar snapshots apenas quando necessário
7. preferir patch incremental
8. evitar refatoração global

---

# FORMATO DE RESPOSTA

Retornar apenas:

* causa raiz
* arquivos alterados
* validação
* build status
* integrity status

Evitar relatórios longos desnecessários.

---

# FASE ATUAL

Projeto em fase avançada:

* Fase 18 praticamente concluída
* foco atual:

  * estabilização final da voz ElevenLabs
  * TypeScript stabilization
  * preparação para Fase 19 e Fase 20

---

# OBSERVAÇÃO

O ORION já possui:

* freezes
* snapshots
* integrity system
* ownership scoping
* runtime authority

Os patches devem respeitar esses sistemas.
