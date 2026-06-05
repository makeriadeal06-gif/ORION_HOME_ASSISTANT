# MQTT HEALTH REFINEMENT DEPENDENCY MATRIX

Data da baseline: 2026-06-05

## Matriz De Dependencias

| Modulo | Dependencias | Impacto se alterado | Nivel de risco |
|---|---|---|---|
| `client/core/runtime/MqttManager.ts` | `socketManager`, `socketRuntime`, `stateSync`, `ProductionRecoveryEngine`, `runtimeIdentity`, `AuthState` | Pode quebrar health classification, recovery completion, watchdog e transicoes de estado | Critico |
| `reconcileHealth()` | `isSocketHealthy()`, `isHeartbeatHealthy()`, `isTelemetryHealthy()`, `isMqttSessionHealthy()`, recovery flags | Pode impedir o fechamento correto da recuperacao ou marcar conectado indevidamente | Critico |
| MQTT Health Classification | `socketHealthy`, `heartbeatHealthy`, `subscriptionsHealthy`, `mqttSessionHealthy`, `telemetryHealthy`, `meshHealthy`, `bridgeHealthy` | Pode distorcer o estado real da camada e afetar reconexao/recovery | Alto |
| Recovery Completion Logic | `RECOVERY_COMPLETION` logging, `transitionState()`, `syncHealth(true)`, `ProductionRecoveryEngine.ping()` | Pode deixar a camada presa em degraded ou connected sem validade | Critico |
| MQTT State Transition Logic | `transitionState()`, `lastStatusChangeAt`, `reconnectCooldown`, `maxCooldown` | Pode gerar transicoes inconsistentes, loops ou escalacao precoce | Alto |
| MQTT Watchdog Logic | `lastTelemetryAt`, `lastMqttHeartbeatAt`, `lastPacketFlowAt`, `recoveryValidationWindowMs`, `staleWatchdogHits` | Pode detectar stale de forma incorreta ou nao detectar regressao real | Critico |
| MQTT Telemetry Health | `lastTelemetryAt`, `lastPacketFlowAt`, `lastMqttHeartbeatAt` | Pode falsear telemetria saudavel ou degradada | Alto |
| MQTT Session Health | `recoveryFlags.mqttSessionHealthy`, `state`, `socketRuntime` metrics | Pode quebrar a leitura da sessao e desalinhar a recuperacao | Alto |
| MQTT Recovery Flags | `socketHealthy`, `heartbeatHealthy`, `subscriptionsHealthy`, `mqttSessionHealthy`, `bridgeHealthy`, `telemetryHealthy`, `packetFlowHealthy`, `meshHealthy` | Pode invalidar toda a reconciliacao e o completion logic | Critico |

## Cadeia De Dependencia Protegida

`Socket Runtime -> MqttManager -> Recovery Flags -> reconcileHealth() -> Recovery Completion -> State Sync`

## Ponto De Maior Sensibilidade

- `recoveryValidationWindowMs`
- `reconnectCooldown`
- `staleWatchdogHits`
- `lastTelemetryAt`
- `lastMqttHeartbeatAt`
- `lastPacketFlowAt`
- `recoveryFlags`

## Dependencias Criticas

- `socketManager`
- `socketRuntime`
- `stateSync`
- `ProductionRecoveryEngine`
- `runtimeIdentity`
- `AuthState`

## Critérios De Estabilidade

- O estado final deve refletir a saude composta, nao um evento isolado.
- Recovery completo so pode ser concluido com os sinais core saudaveis.
- Watchdog deve detectar stale apenas dentro da janela valida.
- State transitions devem acompanhar a recuperacao real.
- Recovery flags devem permanecer sincronizadas com os sinais observados.
