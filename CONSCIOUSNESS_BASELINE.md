# CONSCIOUSNESS BASELINE

Data da baseline: 2026-06-04

## Arquitetura Atual

A primeira versão da Consciência Operacional é composta por uma cadeia simples:

- `AndroidAwarenessEngine` captura sinais operacionais da plataforma Android.
- `useAndroidAwarenessStore` armazena o snapshot operacional corrente.
- `OperationalConsciousnessEngine` interpreta o snapshot e classifica situações.
- `ActionExecutorEngine` executa a decisão produzida.

O fluxo é unidirecional:

`Awareness -> Consciousness -> Executor`

## Responsabilidades

- `AndroidAwarenessEngine`
  - Coletar e projetar bateria, rede, bluetooth, energia, áudio, localização e permissões.
  - Reconciliar eventos nativos com o estado do store.

- `useAndroidAwarenessStore`
  - Manter o estado corrente da awareness layer.
  - Expor atualizações incrementais e o timestamp do último refresh.

- `OperationalConsciousnessEngine`
  - Avaliar o snapshot de awareness.
  - Classificar situações por importância.
  - Produzir decisões operacionais com cooldown.
  - Encaminhar a decisão ao executor.

- `ActionExecutorEngine`
  - Roteamento de ação por categoria.
  - Execução das ações `runtime` produzidas pela camada de consciência.

## Regras Existentes

### Bateria Crítica

- Gatilho: `battery.level > 0 && battery.level < 0.15 && battery.status !== 'charging'`
- Importância: `HIGH`
- Decisão produzida: `ENTER_POWER_SAVE_MODE`

### Temperatura Elevada

- Gatilho: `battery.temperature > 45`
- Importância: `CRITICAL`
- Decisão produzida: `REDUCE_BACKGROUND_ACTIVITY`

### Rede Limitada

- Gatilho: `network.isMetered && network.isConnected`
- Importância: `MEDIUM`
- Decisão produzida: `PRESERVE_NETWORK_USAGE`

### Dispositivo Ocioso

- Gatilho: `!power.isInteractive && battery.status !== 'charging' && battery.level < 0.8`
- Importância: `LOW`
- Decisão produzida: `REDUCE_BACKGROUND_ACTIVITY`

## Cooldowns

- Cooldown por tipo de decisão: `300000ms` 0 `5 minutes`
- O cooldown é aplicado por `OperationalDecisionType`.
- Se a decisão estiver em cooldown, ela é descartada e não é despachada.

## Prioridades

- A fila de situações é ordenada por importância antes do dispatch.
- Ordem efetiva: `CRITICAL -> HIGH -> MEDIUM -> LOW`
- Apenas a decisão mais importante válida é despachada por ciclo de avaliação.

## Módulos Protegidos

### Protected Stability Zone

| Módulo | Função | Dependências | Risco de alteração |
|---|---|---|---|
| `client/core/cognitive-runtime/operational/OperationalConsciousnessEngine.ts` | Classifica situações e produz decisões operacionais | `useAndroidAwarenessStore`, `ActionExecutorEngine`, `logger` | Quebra a cadeia `Awareness -> Consciousness -> Executor` |
| `client/core/android-runtime/awareness/types.ts` | Contratos da awareness layer | Consistência entre engine, store e consumidores | Quebra de shape de estado e eventos |
| `client/core/android-runtime/awareness/useAndroidAwarenessStore.ts` | Store operacional da awareness | `zustand`, estado Android | Perda de projeção de sinais e inconsistência do snapshot |
| `client/core/android-runtime/awareness/AndroidAwarenessEngine.ts` | Coleta e hidratação da awareness layer | `window.AndroidOrionBridge`, `useAndroidAwarenessStore` | Perda de ingestão nativa e de sincronização do estado |
| `client/core/action-executor/ActionExecutorEngine.ts` | Executa ações produzidas pela consciência | `AndroidActionHandler`, `RuntimeActionHandler`, `AutomationActionHandler` | Execução incorreta ou queda da cadeia de ação |

## Dependências Críticas

- `window.AndroidOrionBridge` para coleta nativa.
- `useAndroidAwarenessStore` para estado operacional.
- `OperationalConsciousnessEngine` para classificação e decisão.
- `ActionExecutorEngine` para despacho da decisão.
- `runtime` category do executor para aplicar decisões operacionais.

