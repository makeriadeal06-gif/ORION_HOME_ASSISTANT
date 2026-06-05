# OPERATIONAL MEMORY BASELINE

Data da baseline: 2026-06-05

## Objetivo

Congelar a camada de Memoria Operacional como ela existe neste ponto do ciclo, sem alterar logica, APIs, contratos ou comportamento.

Esta baseline registra a implementacao atual de:

- `OperationalMemoryEngine`
- tipos de memoria operacional
- integracao com `OperationalConsciousnessEngine`
- integracao indireta com `Android Awareness`
- integracao com `Cognitive Modes`

## Arquitetura Atual

A camada de memoria operacional funciona como um historico curto, de consulta local, alimentado pela camada de consciencia operacional.

Fluxo principal:

`Android Awareness -> OperationalConsciousnessEngine -> OperationalMemoryEngine -> Context Snapshot -> Cognitive Modes`

Pontos observados:

- a memoria nao substitui o snapshot operacional da awareness;
- a memoria armazena eventos de contexto, situacao e transicao de modo;
- a consulta do contexto e feita por janela temporal;
- a limpeza e automatica e continua;
- a consciencia operacional usa o snapshot de memoria para refinar decisoes.

## Componentes

- `OperationalMemoryEngine`
  - Singleton responsavel por registrar eventos operacionais.
  - Mantem historico em memoria volátil.
  - Expõe consultas filtradas e snapshot contextual agregado.

- `MemoryEvent`
  - Estrutura canonica de evento persistido em memoria.

- `MemoryQuery`
  - Estrutura de consulta por tipo, origem e instante inicial.

- `OperationalContextSnapshot`
  - Snapshot derivado usado pela consciencia operacional.
  - Representa tendencias e marcadores recentes de contexto.

- `OperationalConsciousnessEngine`
  - Fonte primaria de escrita da memoria operacional.
  - Registra atualizacoes de awareness, situacoes e sinais relevantes.
  - Consome o snapshot de memoria antes de adaptar a decisao.

- `useCognitiveModeStore`
  - Registra transicoes de modo como eventos de memoria.

- `CognitiveModeAdapter`
  - Nao escreve na memoria diretamente.
  - Depende indiretamente do estado historico que a consciencia utiliza para decidir.

## Janela Temporal Atual

- Janela de historico: `15 minutes`
- Constante interna atual: `HISTORY_WINDOW_MS = 15 * 60 * 1000`
- Limite de retencao efetiva: eventos mais antigos que a janela sao descartados na limpeza automatica.

## Estrutura Dos Eventos

Cada evento registrado pela memoria segue a estrutura:

- `id`
  - Identificador unico gerado em runtime.

- `type`
  - Categoria do evento.
  - Exemplos atuais: `awareness_update`, `situation`, `mode_change`.

- `source`
  - Origem logica do evento.
  - Exemplos atuais: `battery`, `network`, `power`, `cognitive_modes`.

- `payload`
  - Carga util do evento.
  - Pode conter snapshot bruto, situacao operacional ou metadados de transicao.

- `timestamp`
  - Momento de ingestao em epoch milliseconds.

## Sistema De Tendencias

A memoria operacional deriva tendencias por leitura sequencial dos eventos recentes:

- `batteryTrend`
- `temperatureTrend`

Caracteristicas do sistema atual:

- a consulta considera eventos da fonte informada;
- os eventos sao ordenados por timestamp crescente;
- apenas valores numericos do campo solicitado entram no calculo;
- o primeiro valor e comparado ao ultimo valor valido;
- a saida possivel e `rising`, `falling` ou `stable`.

Leitura aplicada hoje:

- `batteryTrend` usa eventos de `source = 'battery'` e campo `level`.
- `temperatureTrend` usa eventos de `source = 'battery'` e campo `temperature`.

## Estrategia De Limpeza Automatica

- a limpeza roda por `setInterval` interno;
- a periodicidade atual e de `60000ms`;
- a cada ciclo, a memoria remove eventos mais antigos que a janela atual;
- se houver remocao, um log de auditoria e emitido em `OPERATIONAL_MEMORY`.

Comportamento relevante:

- a limpeza e automatica e nao depende de chamada externa;
- `shutdown()` encerra o timer quando necessario;
- a estrategia preserva apenas memoria recente, sem persistencia de longa duracao.

## Fluxo De Consulta De Contexto

Fluxo atual de consulta:

1. `OperationalConsciousnessEngine` solicita `operationalMemoryEngine.getContextSnapshot()`.
2. A memoria calcula as tendencias atuais.
3. A memoria consulta o ultimo timestamp de `mode_change` em `cognitive_modes`.
4. A memoria conta eventos recentes do tipo `situation`.
5. O snapshot derivado retorna para a consciencia.
6. A consciencia usa o snapshot para refinar a decisao antes do adapter e do executor.

Consulta granular:

- `query(params)` aceita filtro por `type`, `source` e `since`.
- Se `since` nao for informado, a busca usa o limite da janela atual.
- O resultado e somente leitura no contrato de uso.

## Integracoes Existentes

- `OperationalConsciousnessEngine`
  - Escreve `awareness_update` a partir do snapshot de awareness.
  - Escreve `situation` quando detecta condicoes operacionais relevantes.
  - Consome o snapshot de memoria ao montar a decisao.

- `Android Awareness`
  - Nao escreve direto na memoria operacional.
  - Fornece o estado base que a consciencia observa e transforma em eventos.

- `Cognitive Modes`
  - Registram `mode_change` como evento operacional.
  - Influenciam indiretamente a leitura historica da consciencia.

## Modulos Congelados

### Protected Stability Zone

| Modulo | Funcao | Dependencias | Risco de alteracao |
|---|---|---|---|
| `client/core/cognitive-runtime/operational/memory/OperationalMemoryEngine.ts` | Registro, consulta, tendencias e limpeza automatica da memoria operacional | `logger`, `MemoryEvent`, `MemoryQuery`, `OperationalContextSnapshot` | Perda da janela temporal, quebra do snapshot contextual e regressao na limpeza automatica |
| `client/core/cognitive-runtime/operational/memory/types.ts` | Contratos dos eventos, consultas e snapshot operacional | `OperationalMemoryEngine`, `OperationalConsciousnessEngine`, `useCognitiveModeStore` | Quebra de shape dos eventos e incompatibilidade entre escritor e leitor |
| `client/core/cognitive-runtime/operational/OperationalConsciousnessEngine.ts` | Alimenta a memoria e consome o snapshot para refinamento decisorio | `useAndroidAwarenessStore`, `useCognitiveModeStore`, `CognitiveModeAdapter`, `OperationalMemoryEngine`, `ActionExecutorEngine` | Desalinhamento entre awareness, memoria e decisao operacional |
| `client/core/cognitive-runtime/operational/modes/useCognitiveModeStore.ts` | Registra transicoes de modo como memoria operacional | `zustand`, `OperationalMemoryEngine`, `logger` | Perda do historico de transicao de modo e regressao de contexto |
| `client/core/android-runtime/awareness/AndroidAwarenessEngine.ts` | Fonte nativa do snapshot que alimenta a consciencia | `window.AndroidOrionBridge`, `useAndroidAwarenessStore` | A memoria passa a receber contexto obsoleto ou incompleto |

## Dependencias Criticas

- `useAndroidAwarenessStore`
- `OperationalConsciousnessEngine`
- `OperationalMemoryEngine`
- `MemoryEvent`
- `MemoryQuery`
- `OperationalContextSnapshot`
- `useCognitiveModeStore`
- `CognitiveModeAdapter`
- `ActionExecutorEngine`

## Riscos Futuros

- Alteracoes na janela temporal mudam toda a semantica historica da camada.
- Alteracoes no esquema de `MemoryEvent` podem quebrar leitura de tendencias e filtros.
- Alteracoes no fluxo de escrita da consciencia podem introduzir duplicacao ou ausencia de eventos.
- Alteracoes no registro de `mode_change` podem degradar o refinamento contextual.
- Alteracoes na estrategia de cleanup podem manter memoria demais ou eliminar sinais recentes.
- Alteracoes no contrato do snapshot podem desalinhar a consciencia operacional.

## Estado Da Baseline

- Camada congelada para documentacao e referencia arquitetural.
- Nenhuma mudanca de logica ou API foi introduzida neste freeze.
- A implementacao atual e considerada a referencia oficial da fase 09.
