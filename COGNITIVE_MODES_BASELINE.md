# COGNITIVE MODES BASELINE

Data da baseline: 2026-06-04

## Arquitetura Atual

A camada de Cognitive Modes atua como um adaptador entre a Consciência Operacional e o Executor de Ações.

Fluxo atual:

`Android Awareness -> Operational Consciousness -> Cognitive Mode Adapter -> Action Executor`

## Componentes

- `Android Awareness`
  - Produz o snapshot operacional base: bateria, rede, energia, áudio e demais sinais.

- `OperationalConsciousnessEngine`
  - Classifica situações por importância.
  - Produz decisões operacionais base.
  - Aplica `CognitiveModeAdapter` antes de despachar a ação.

- `CognitiveModeAdapter`
  - Transforma a decisão operacional base em decisão adaptada conforme o modo ativo.

- `useCognitiveModeStore`
  - Mantém o modo ativo.
  - Default atual: `BALANCED`.

- `ActionExecutorEngine`
  - Executa a ação final produzida pela camada cognitiva.

## Modos Existentes

- `BALANCED`
- `FOCUS`
- `PROFESSIONAL`
- `SILENT`
- `CASUAL`

## Responsabilidades

- `BALANCED`
  - Comportamento equilibrado.
  - Respeita a importância da situação sem agressividade excessiva.

- `FOCUS`
  - Mais agressivo na redução de ruído e consumo.
  - Tende a priorizar economia em sinais de bateria e rede.

- `PROFESSIONAL`
  - Prioriza estabilidade.
  - Evita intervenções automáticas não críticas.

- `SILENT`
  - Minimiza atividade.
  - Prefere silencioso e estável acima de intervenções leves.

- `CASUAL`
  - Mais permissivo.
  - Interfere apenas em situações realmente críticas ou em bateria alta relevante.

## Regras Existentes

- O modo ativo é lido de `useCognitiveModeStore`.
- A decisão base é gerada pela Consciência Operacional.
- O adaptador decide a ação final conforme o modo e a situação.
- O executor recebe apenas a decisão adaptada final.
- Existe cooldown por tipo de decisão na Consciência Operacional: `300000ms`.
- Apenas uma decisão é despachada por ciclo de avaliação.

## Fluxo Operacional

1. `Android Awareness` atualiza o snapshot operacional.
2. `OperationalConsciousnessEngine` avalia o snapshot e identifica situações.
3. O motor consulta `useCognitiveModeStore` para obter o modo ativo.
4. `CognitiveModeAdapter` adapta a decisão conforme o modo.
5. A decisão adaptada é convertida em payload `runtime`.
6. `ActionExecutorEngine` executa o payload final.

## Módulos Congelados

### Protected Stability Zone

| Módulo | Função | Dependências | Risco de alteração |
|---|---|---|---|
| `client/core/cognitive-runtime/operational/modes/CognitiveModeAdapter.ts` | Adapta decisões operacionais por modo | `OperationalConsciousnessEngine`, `OperationalDecisionType` | Quebra a semântica dos modos e a adaptação das decisões |
| `client/core/cognitive-runtime/operational/modes/useCognitiveModeStore.ts` | Armazena o modo cognitivo ativo | `zustand`, `logger` | Troca indevida do modo ativo e regressão de UX |
| `client/core/cognitive-runtime/operational/OperationalConsciousnessEngine.ts` | Avalia situações e despacha decisões adaptadas | `useAndroidAwarenessStore`, `useCognitiveModeStore`, `CognitiveModeAdapter`, `ActionExecutorEngine` | Quebra da cadeia de consciência e do dispatch operacional |
| `client/core/android-runtime/awareness/AndroidAwarenessEngine.ts` | Alimenta o snapshot da awareness | `window.AndroidOrionBridge`, `useAndroidAwarenessStore` | Alimentação incorreta do contexto cognitivo |

## Dependências Críticas

- `useAndroidAwarenessStore`
- `useCognitiveModeStore`
- `CognitiveModeAdapter`
- `OperationalConsciousnessEngine`
- `ActionExecutorEngine`

