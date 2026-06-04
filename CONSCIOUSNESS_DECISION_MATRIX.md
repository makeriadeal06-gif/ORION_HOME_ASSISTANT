# CONSCIOUSNESS DECISION MATRIX

Data da baseline: 2026-06-04

| EVENTO | IMPORTÂNCIA | DECISÃO | EXECUTOR |
|---|---|---|---|
| Bateria crítica baixa (`battery.level < 15%` e não carregando) | HIGH | `ENTER_POWER_SAVE_MODE` | `ActionExecutorEngine` -> `RuntimeActionHandler` |
| Temperatura elevada (`battery.temperature > 45`) | CRITICAL | `REDUCE_BACKGROUND_ACTIVITY` | `ActionExecutorEngine` -> `RuntimeActionHandler` |
| Rede limitada/metrada (`network.isMetered && network.isConnected`) | MEDIUM | `PRESERVE_NETWORK_USAGE` | `ActionExecutorEngine` -> `RuntimeActionHandler` |
| Dispositivo ocioso (`!power.isInteractive`, não carregando, bateria < 80%) | LOW | `REDUCE_BACKGROUND_ACTIVITY` | `ActionExecutorEngine` -> `RuntimeActionHandler` |

## Observações

- Todas as decisões operacionais atuais são roteadas para a categoria `runtime`.
- `ENTER_POWER_SAVE_MODE` mapeia para `set_power_saving`.
- `REDUCE_BACKGROUND_ACTIVITY` e `PRESERVE_NETWORK_USAGE` mapeiam para `set_calm_mode`.
- `PRESERVE_NETWORK_USAGE` inclui a flag `networkPreserve=true` no payload.

