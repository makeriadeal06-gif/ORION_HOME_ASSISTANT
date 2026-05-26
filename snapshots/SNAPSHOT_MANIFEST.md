# ORION — SNAPSHOT MANIFEST

> [!IMPORTANT]
> **ARCHITECTURAL FREEZE LEVEL: CRITICAL**
> 
> As of Phase 18.2, all core runtime layers, task orchestrators, and execution queues are under an absolute lock. No structural alterations or modifications to behavioral state paths are allowed.

---

## 🌌 Project State & Phases
* **Current Active Phase**: `PHASE_18_STABLE`
* **Baseline Stabilization Phase**: `PHASE_14`
* **Current Status**: Code Locked & Cryptographically Indexed
* **Last Updated**: 2026-05-23T20:12:00-03:00

---

## 🧱 Stabilized Core Modules (Frozen)

The following modules represent the core engine of ORION. They must **never** be re-instantiated, bypassed, or modified:

| Module Name | File Location | Key Responsibility |
|---|---|---|
| **TaskRuntime** | [`TaskRuntime.ts`](file:///c:/Users/pedro/Downloads/orion-home-assistant%20(1)/client/core/task-runtime/TaskRuntime.ts) | Real-time task scheduling, background automation execution, and task serialization. |
| **VoiceRuntimeManager** | [`VoiceRuntimeManager.ts`](file:///c:/Users/pedro/Downloads/orion-home-assistant%20(1)/client/core/voice-runtime/VoiceRuntimeManager.ts) | Local text-to-speech pipelines, provider arbitration (ElevenLabs), and audio stream buffer recovery. |
| **CommandExecutionQueue** | [`types.ts`](file:///c:/Users/pedro/Downloads/orion-home-assistant%20(1)/client/core/command-runtime/types.ts) | Serialized execution pipeline preventing parallel command collision and racing. |
| **PresenceRuntime** | [`PresenceRuntime.ts`](file:///c:/Users/pedro/Downloads/orion-home-assistant%20(1)/client/core/presence/PresenceRuntime.ts) | Distributed node registration, active user detection, and fallback lease management. |
| **EnvironmentRuntime** | [`EnvironmentRuntime.ts`](file:///c:/Users/pedro/Downloads/orion-home-assistant%20(1)/client/core/environment-runtime/EnvironmentRuntime.ts) | Ambient state sync (offline/degraded modes), lockouts, and multi-node arbitration. |
| **AndroidRuntimeManager** | [`AndroidRuntimeManager.ts`](file:///c:/Users/pedro/Downloads/orion-home-assistant%20(1)/client/core/android-runtime/AndroidRuntimeManager.ts) | Deep native API bridge with target Android devices for cognitive coordination. |
| **AutomationStore** | [`AutomationStore.ts`](file:///c:/Users/pedro/Downloads/orion-home-assistant%20(1)/client/core/automation-runtime/AutomationStore.ts) | Local/cloud state persistence for offline-first routine triggers and metadata. |
| **RuntimeIdentity** | [`RuntimeIdentity.ts`](file:///c:/Users/pedro/Downloads/orion-home-assistant%20(1)/client/core/runtime/RuntimeIdentity.ts) | Session ownership, cryptographic device signing, and hydration validation. |

---

## 🖥️ Expected Runtime State

For a healthy and validated instance of ORION, the following parameters are expected at startup:

1. **Orchestrator Readiness**: `RuntimeInitializationOrchestrator` must resolve within `4500ms`.
2. **Hydration Verification**: Hydration barrier `hydrationBarrierActive` must transition to `false` only after `AUTH_READY` confirmation.
3. **Calm Mode Throttling**: CPU pressure and network socket reconnection attempts must be throttled dynamically (reconnection interval >= `15000ms` under recovery).
4. **Single Queue Enforcement**: At any point, only a single instance of `CommandExecutionQueue` can be active to prevent parallel race loops.

---

## ⚠️ Sensitive Code Areas

The following blocks are highly sensitive. Modifying even one line will trigger cascading recovery crashes:

> [!WARNING]
> * **`RuntimeIdentity.ts` L166-211** — `hydrationOwnerValidation()` and session identity guards.
> * **`AutomationStore.ts` L400-450** — Auth transition hydration locks preventing race conditions in offline state synchronization.
> * **`VoiceRuntimeManager.ts` L630-685** — Complex provider validation rules mapping socket health, environment restoration, and lease states.

---

## 🔄 Recent Code Alterations (Prep Stage)

- **Lock Manifesting**: Created `/snapshots` folder containing `PHASE_STATE.json` and `VERSION_STATE.json`.
- **Integrity Validation**: Implemented `/snapshots/verify-integrity.js` cryptographically hashing all 18 target frozen files.
- **Rollback Preparation**: Stabilized and ready to bundle without affecting dynamic chunk compilation.

---

## 📉 Known Risks & Open Regressions

1. **Preload TSX Fetch Bug**: Vite assets builder warning during static-versus-dynamic importing. The loader attempts to dynamically resolve TSX source components.
2. **Consensus Race Conditions**: If three or more distributed nodes bootstrap simultaneously, split-brain primary election has a ~1.8% occurrence rate before arbitration lease locks.
3. **MQTT Queue Saturation**: Heavy automation execution maps up to `60` commands per minute, creating temporary queue backpressure.
