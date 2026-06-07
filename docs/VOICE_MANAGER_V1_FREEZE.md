# Voice Manager V1 Freeze

Data da baseline: 2026-06-06

## Objetivo

Congelar a superficie operacional do `VoiceRuntimeManager` como a versao V1 estabilizada do gerenciador de voz do ORION.

Este freeze preserva:

- bootstrap de voz
- hidratacao de provider
- protecao de transicao de autenticacao
- politica de fallback browser temporario
- recuperacao de provider ElevenLabs
- validacao de playback
- recuperacao de perfil, naturalizacao e streaming
- integracao com `SpeechPipeline`

## Escopo Congelado

Arquivos e superficies protegidas:

- `client/core/voice-runtime/VoiceRuntimeManager.ts`
- `client/core/voice-runtime/types.ts`
- `client/core/voice-runtime/state/VoiceStateEngine.ts`
- `client/core/voice-runtime/state/useVoiceStore.ts`
- `client/core/voice-runtime/pipeline/SpeechPipeline.ts`
- `client/core/voice-runtime/adapters/tts/ElevenLabsTTSAdapter.ts`
- `client/core/voice-runtime/adapters/tts/BrowserTTSAdapter.ts`
- `client/core/voice-runtime/adapters/stt/BrowserSTTAdapter.ts`
- `server/services/ElevenLabsVoiceService.ts`

## Regras Do Freeze

NUNCA:

- reestruturar o bootstrap de voz
- criar um runtime de voz paralelo
- substituir a politica de fallback browser por persistencia permanente
- alterar o contrato de `VoiceProfile` sem revisao arquitetural
- quebrar hydration, recovery ou lock de provider
- alterar o fluxo de validacao de playback sem relock
- remover a protecao de transicao de auth
- reescrever o pipeline de fala sem necessidade funcional comprovada

## Comportamento Esperado

1. O `VoiceRuntimeManager` inicializa em modo calmo e valida o provider ativo.
2. Em degradacao de ambiente, o provider browser pode assumir apenas como lease temporario.
3. Quando a validacao permitir, o provider preferido e restaurado.
4. `speak()` e `startListening()` permanecem dependentes do bootstrap e da autoridade de runtime.
5. O playback continua seguindo a autoridade de provider e o estado de recuperacao.

## Criterios De Estabilidade

- Nenhuma mudanca estrutural no manager principal.
- Nenhuma nova queue, runtime ou camada paralela de voz.
- Nenhuma regressao em auth transition, hydration ou fallback lease.
- A integracao ElevenLabs continua sendo a rota padrao quando configurada.

## Observacao

Este freeze registra a V1 como baseline operacional para manutencao e hotfixes pontuais.
