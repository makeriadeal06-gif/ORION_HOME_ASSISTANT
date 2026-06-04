# CONSCIOUSNESS RISK MAP

Data da baseline: 2026-06-04

| Módulo | O que quebra se alterar | Impacto esperado | Criticidade |
|---|---|---|---|
| `OperationalConsciousnessEngine` | Classificação de situações, regras, cooldown, dispatch de decisão | Decisões erradas, ausência de ação ou loops de execução | Crítico |
| `AndroidAwarenessEngine` | Ingestão de sinais nativos e hidratação do store | A consciência passa a decidir sobre dados incompletos ou obsoletos | Alto |
| `useAndroidAwarenessStore` | Snapshot operacional da awareness | Quebra da projeção de bateria, rede, energia e áudio | Alto |
| `ActionExecutorEngine` | Roteamento de ações e execução de payloads `runtime` | A decisão pode ser aplicada no handler errado ou não ser aplicada | Crítico |
| `RuntimeActionHandler` | Aplicação das ações operacionais produzidas pela consciência | Ações de power/calm mode podem deixar de ser reconhecidas | Alto |

## Dependências Críticas

- `OperationalConsciousnessEngine` depende diretamente de `useAndroidAwarenessStore`.
- `OperationalConsciousnessEngine` depende de `ActionExecutorEngine` para efetivar as decisões.
- `ActionExecutorEngine` depende dos handlers de categoria para manter o contrato de execução.
- `AndroidAwarenessEngine` depende de `window.AndroidOrionBridge` e do contrato de eventos `orion:android-event`.

## Riscos Para Awareness

- Alteração no schema de awareness pode quebrar avaliação de bateria, temperatura, rede e energia.
- Alteração no fluxo de hidratação pode introduzir leituras parciais ou atrasadas.
- Alteração na store pode dessincronizar o snapshot observado pela consciência.

## Riscos Para Executor

- Alteração no executor pode executar payloads inválidos.
- Alteração no `RuntimeActionHandler` pode deixar de aplicar os modos operacionais produzidos pela consciência.
- Alteração no roteamento de categoria pode desviar decisões para handlers errados.

