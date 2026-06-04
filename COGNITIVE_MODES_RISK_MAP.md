# COGNITIVE MODES RISK MAP

Data da baseline: 2026-06-04

| Módulo | Risco de alteração | Dependências | Impacto no Operational Consciousness | Impacto no Executor |
|---|---|---|---|---|
| `CognitiveModeAdapter` | Reinterpretação indevida dos modos ou das prioridades | `OperationalSituation`, `OperationalDecisionType`, `OperationalImportance` | A decisão base deixa de ser corretamente adaptada por modo | O executor pode receber ações incompatíveis com a política do modo |
| `useCognitiveModeStore` | Estado ativo incorreto ou transições inesperadas | `zustand`, `logger` | O motor passa a operar com modo errado ou obsoleto | O executor passa a receber decisões divergentes do contexto esperado |
| `OperationalConsciousnessEngine` | Quebra da avaliação, cooldown ou integração com adapter/store | `useAndroidAwarenessStore`, `useCognitiveModeStore`, `CognitiveModeAdapter`, `ActionExecutorEngine` | A consciência deixa de gerar decisões coerentes com o modo ativo | O executor pode não receber ação ou receber payload errado |
| `AndroidAwarenessEngine` | Snapshot incompleto ou atrasado | `window.AndroidOrionBridge`, `useAndroidAwarenessStore` | A consciência passa a trabalhar com sinais inválidos | O executor age sobre decisões derivadas de contexto incorreto |

## Dependências Críticas

- A matriz depende da consciência operacional para classificar a situação.
- O adaptador depende da presença de um modo válido no store.
- O executor depende do payload `runtime` gerado pela consciência.
- O snapshot de awareness é a entrada primária de toda a cadeia.

## Impacto Esperado Se Alterado

- Alterar o adapter pode inverter a política de cada modo.
- Alterar o store pode trocar o modo ativo em runtime sem intenção.
- Alterar a consciência pode quebrar cooldown, prioridade e dispatch.
- Alterar a awareness pode corromper os eventos de entrada do sistema.

