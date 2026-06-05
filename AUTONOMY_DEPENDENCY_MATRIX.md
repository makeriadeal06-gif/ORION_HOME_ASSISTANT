# AUTONOMY DEPENDENCY MATRIX

Data da baseline: 2026-06-05

## Matriz De Dependencias

| Modulo | Dependencias | Impacto se alterado | Nivel de risco |
|---|---|---|---|
| `client/core/cognitive-runtime/autonomy/AutonomyEngine.ts` | `DecisionEngine`, `useCognitiveModeStore`, `AutonomyPolicyRegistry`, `ActionExecutorEngine`, `logger` | Pode mudar a politica de execucao, confirmacao ou sugestao | Critico |
| `client/core/cognitive-runtime/autonomy/AutonomyPolicyRegistry.ts` | `CognitiveModeType`, `AutonomyLevel` | Pode quebrar o mapeamento entre modo cognitivo e nivel de autonomia | Alto |
| `client/core/cognitive-runtime/autonomy/types.ts` | `DecisionCandidate`, `ActionPayload` | Pode invalidar o contrato de avaliacao e o resultado da autonomia | Alto |
| `client/core/cognitive-runtime/decision/DecisionEngine.ts` | `autonomyEngine`, `PriorityLevel`, `DecisionCandidate`, `DecisionResult`, `logger` | Pode alterar a selecao do candidato dominante e o handoff para autonomia | Critico |
| `client/core/cognitive-runtime/operational/OperationalConsciousnessEngine.ts` | `useAndroidAwarenessStore`, `useCognitiveModeStore`, `CognitiveModeAdapter`, `operationalMemoryEngine`, `decisionEngine`, `OperationalSituation` | Pode alterar a origem, a classificacao e a entrega dos candidatos | Critico |
| `client/core/cognitive-runtime/operational/modes/useCognitiveModeStore.ts` | `zustand`, `operationalMemoryEngine`, `logger` | Pode quebrar o modo ativo e o registro historico de transicoes | Alto |
| `client/core/android-runtime/actions/AndroidActionBridge.ts` | `AndroidAdapter`, `MockAndroidAdapter`, `ActionDefinition`, `ExecutionResult`, `logger` | Pode quebrar a execucao concreta das acoes Android | Critico |
| `client/core/action-executor/ActionExecutorEngine.ts` | `AndroidActionHandler`, `RuntimeActionHandler`, `AutomationActionHandler`, `logger` | Pode quebrar o dispatch final de acoes para o handler correto | Critico |

## Fluxo De Dependencia Protegido

`Awareness -> Operational Consciousness -> Decision Engine -> Autonomy Engine -> Action Executor -> Android Action Bridge`

## Dependencias Criticas

- `DecisionEngine`
- `AutonomyEngine`
- `AutonomyPolicyRegistry`
- `useCognitiveModeStore`
- `OperationalConsciousnessEngine`
- `AndroidActionBridge`
- `ActionExecutorEngine`
- `CognitiveModeType`
- `AutonomyLevel`

## Riscos Por Mudanca

- Se o `DecisionEngine` mudar a selecao, o candidato entregue para autonomia pode deixar de ser o mais adequado.
- Se a politica por modo mudar, a semantica de controle do usuario se altera.
- Se `OperationalConsciousnessEngine` deixar de produzir candidatos coerentes, a autonomia passa a operar sobre sinais ruins.
- Se `useCognitiveModeStore` mudar o modo ativo ou seu histórico, a aplicacao da politica fica inconsistente.
- Se `AndroidActionBridge` mudar a surface de dispatch, o ultimo passo da cadeia pode falhar.
- Se `ActionExecutorEngine` mudar o roteamento, a acao correta pode ir para o handler errado.

## Critérios De Estabilidade

- O mapeamento de modos continua com a mesma semantica.
- A selecao de candidatos continua deterministica para o mesmo contexto.
- A autonomia continua sendo apenas camada de politica e execucao.
- O executor continua sendo o ultimo ponto antes da bridge Android.
- Nenhum contrato de `DecisionCandidate`, `AutonomyEvaluation` ou `ExecutionResult` e alterado.
