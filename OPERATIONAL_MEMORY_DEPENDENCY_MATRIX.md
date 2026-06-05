# OPERATIONAL MEMORY DEPENDENCY MATRIX

Data da baseline: 2026-06-05

## Matriz De Dependencias

| Modulo | Dependencias | Impacto se alterado | Nivel de risco |
|---|---|---|---|
| `OperationalMemoryEngine` | `logger`, `MemoryEvent`, `MemoryQuery`, `OperationalContextSnapshot` | Pode quebrar a janela temporal, o snapshot de contexto, a limpeza automatica e a leitura historica | Critico |
| `Memory types` | `OperationalMemoryEngine`, `OperationalConsciousnessEngine`, `useCognitiveModeStore` | Pode invalidar contratos de escrita e leitura entre memoria, consciencia e modos | Alto |
| `OperationalConsciousnessEngine` | `useAndroidAwarenessStore`, `useCognitiveModeStore`, `CognitiveModeAdapter`, `OperationalMemoryEngine`, `ActionExecutorEngine` | Pode desacoplar awareness, memoria e decisao, gerando saidas incorretas ou vazias | Critico |
| `Android Awareness` | `window.AndroidOrionBridge`, `orion:android-event`, `useAndroidAwarenessStore` | Pode entregar contexto incompleto para a consciencia e, por consequencia, para a memoria | Alto |
| `Cognitive Modes` | `useCognitiveModeStore`, `CognitiveModeAdapter`, `OperationalMemoryEngine` | Pode quebrar a transicao de modos e a leitura historica usada para refinamento | Alto |
| `Action Executor` | `ActionExecutorEngine`, handlers `Android`, `Runtime`, `Automation` | Pode executar a decisao errada se a consciencia ou a memoria alterarem o payload final | Alto |

## Dependencias Diretas E Indiretas

### Diretas

- `client/core/cognitive-runtime/operational/memory/OperationalMemoryEngine.ts`
- `client/core/cognitive-runtime/operational/memory/types.ts`
- `client/core/cognitive-runtime/operational/OperationalConsciousnessEngine.ts`
- `client/core/cognitive-runtime/operational/modes/useCognitiveModeStore.ts`
- `client/core/android-runtime/awareness/AndroidAwarenessEngine.ts`
- `client/core/android-runtime/awareness/useAndroidAwarenessStore.ts`

### Indiretas

- `client/core/cognitive-runtime/operational/modes/CognitiveModeAdapter.ts`
- `client/core/action-executor/ActionExecutorEngine.ts`
- `client/core/android-runtime/types.ts`

## Cadeia De Dependencia Protegida

`Android Awareness -> OperationalConsciousnessEngine -> OperationalMemoryEngine -> OperationalContextSnapshot -> CognitiveModeAdapter -> ActionExecutorEngine`

Observacoes:

- a memoria opera dentro do fluxo da consciencia, nao como substituta da awareness;
- os modos influenciam a decisao final, mas a memoria preserva o historico que refina essa decisao;
- o executor permanece downstream e nao deve ser alterado neste freeze.

## Pontos De Quebra Mais Sensiveis

- `HISTORY_WINDOW_MS`
  - Governa retencao, tendencia e limpeza.

- `MemoryEvent.payload`
  - E o ponto mais sensivel para compatibilidade estrutural.

- `query(params)`
  - E a porta de entrada para leitura de contexto e filtros.

- `calculateTrend()`
  - Define a leitura historica usada pela consciencia.

- `startCleanupTask()`
  - Mantem a memoria curta e evita crescimento indefinido.

- `record('mode_change', 'cognitive_modes', ...)`
  - Mantem rastreabilidade de mudanca de modo no contexto operacional.

- `record('awareness_update', ...)`
  - Liga o snapshot da awareness ao historico de memoria.

## Riscos Por Alteracao

- Se o `OperationalMemoryEngine` mudar a semantica de filtro, a consciencia passa a interpretar contexto errado.
- Se o contrato de tipos mudar, toda a cadeia de leitura e escrita perde compatibilidade.
- Se a consciencia parar de registrar eventos, a memoria deixa de refletir o estado operacional.
- Se os modos deixarem de registrar `mode_change`, o snapshot historico perde referencia de adaptacao.
- Se o cleanup alterar a janela sem coordenacao, os calculos de tendencia ficam instaveis.
- Se a awareness alterar o shape do snapshot sem sincronizacao, a memoria recebe sinais inconsistentes.

## Estado De Protecao

- Esta matriz congela as dependencias observadas na fase 09.
- Mudancas futuras devem tratar estes modulos como area de estabilidade critica.
- Nao ha alteracao de comportamento registrada neste documento.
