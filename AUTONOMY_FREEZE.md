# AUTONOMY FREEZE

Data da baseline: 2026-06-05

## Objetivo

Congelar a implementacao da camada de autonomia controlada, registrada nesta fase como PHASE 14.

Este freeze documenta a camada final que conecta:

`Awareness -> Operational Consciousness -> Decision Engine -> Autonomy Engine -> Action Executor -> Android Action Bridge`

## Fluxo Final

1. `Awareness`
   - Origem dos sinais operacionais do dispositivo e do ambiente.

2. `Operational Consciousness`
   - Interpreta o estado operacional.
   - Classifica situacoes e produz candidatos decisorios.

3. `Decision Engine`
   - Pontua candidatos.
   - Seleciona a melhor decisao disponivel.

4. `Autonomy Engine`
   - Aplica a politica cognitiva ao candidato selecionado.
   - Define se a acao sera executada, apenas confirmada ou somente sugerida.

5. `Action Executor`
   - Roteia a acao final para o handler correto.

6. `Android Action Bridge`
   - Dispara a execucao concreta no lado Android.

## Modos Cognitivos

- `PROFESSIONAL`
  - Prioriza estabilidade e controle.
  - Mapeamento atual de autonomia: `CONFIRM`.

- `BALANCED`
  - Equilibrado entre controle e fluidez.
  - Mapeamento atual de autonomia: `CONFIRM`.

- `FOCUS`
  - Favorece execucao direta quando ha sinal valido.
  - Mapeamento atual de autonomia: `AUTONOMOUS`.

- `SILENT`
  - Minimiza interrupcoes e privilegia execucao direta silenciosa.
  - Mapeamento atual de autonomia: `AUTONOMOUS`.

- `CASUAL`
  - Reduz agressividade e prioriza recomendacao.
  - Mapeamento atual de autonomia: `SUGGEST`.

## Politicas

- `AUTONOMOUS`
  - A decisao e executada imediatamente.
  - A camada de autonomia encaminha a acao ao executor.

- `CONFIRM`
  - A decisao exige confirmacao do usuario.
  - A fase atual registra a necessidade sem alterar o contrato de UI.

- `SUGGEST`
  - A decisao e apenas sugerida.
  - Nao ha execucao automatica neste nivel.

## Comportamento Anterior

Antes deste freeze, a camada de autonomia controlada ja operava como a ponte final entre decisao e execucao, mas ainda necessitava de congelamento formal da sua superficie de estabilidade.

O comportamento observado era:

- a consciencia operacional produzia candidatos;
- o engine de decisao selecionava um candidato dominante;
- a autonomia aplicava a politica do modo ativo;
- o executor recebia a acao final ou um estado de nao execucao;
- o bridge Android concretizava a execucao quando aplicavel.

## Causa Raiz Encontrada

A causa raiz desta fase nao foi uma falha funcional, mas a necessidade de preservar a estabilidade da cadeia completa de autonomia depois da finalizacao da camada.

Os pontos de maior risco sao:

- alteracao do contrato entre decisao e autonomia;
- alteracao da politica por modo;
- alteracao da ponte Android usada pelo executor;
- alteracao da responsabilidade do executor sobre dispatch final.

## Solucao Aplicada

A implementacao foi congelada com:

- documentacao da cadeia final;
- registro das politicas por modo;
- marcações discretas de freeze nos pontos centrais;
- definicao da matriz de dependencia da fase;
- protecao explicita dos arquivos que compoem a autonomia controlada.

## Critérios De Estabilidade

A camada e considerada estavel quando:

- o fluxo final permanece `Awareness -> Operational Consciousness -> Decision Engine -> Autonomy Engine -> Action Executor -> Android Action Bridge`;
- os modos cognitivos continuam produzindo os mesmos niveis de autonomia;
- `AUTONOMOUS`, `CONFIRM` e `SUGGEST` mantem a mesma semantica;
- o executor continua sendo o ponto final de dispatch;
- a ponte Android continua sendo o adaptador de execucao sem alteracao de contrato.

## Arquivos Protegidos

- `client/core/cognitive-runtime/autonomy/`
- `client/core/cognitive-runtime/decision/DecisionEngine.ts`
- `client/core/cognitive-runtime/operational/OperationalConsciousnessEngine.ts`
- `client/core/cognitive-runtime/operational/modes/useCognitiveModeStore.ts`
- `client/core/android-runtime/actions/AndroidActionBridge.ts`
- `client/core/action-executor/ActionExecutorEngine.ts`

## Riscos

- Alterar `DecisionEngine.ts` pode mudar selecao, prioridade e routing do candidato.
- Alterar `AutonomyEngine.ts` pode mudar a semantica de `AUTONOMOUS`, `CONFIRM` e `SUGGEST`.
- Alterar `useCognitiveModeStore.ts` pode quebrar a correspondencia entre modo e autonomia.
- Alterar `OperationalConsciousnessEngine.ts` pode invalidar a origem dos candidatos.
- Alterar `AndroidActionBridge.ts` pode quebrar a execucao concreta no dispositivo.
- Alterar `ActionExecutorEngine.ts` pode quebrar o dispatch final.
- Alterar qualquer ponto dessa cadeia sem revisão pode reabrir comportamento nao desejado em runtime.

## Estado Da Baseline

- Freeze registrado para PHASE 14.
- Logica preservada.
- Contratos preservados.
- APIs preservadas.
- Baseline pronta para referencia futura.
