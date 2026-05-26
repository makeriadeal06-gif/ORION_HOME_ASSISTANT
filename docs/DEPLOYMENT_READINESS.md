# ORION Deployment Readiness Checklist

This document outlines the validation steps required for a safe production release of the ORION Home Assistant.

## 1. Environment Configuration
- [ ] `.env` file contains all required `VITE_` prefixed variables for the frontend.
- [ ] `VITE_MQTT_URL` is set to a secure WSS broker for production.
- [ ] `GEMINI_API_KEY` is present and valid in the backend environment.
- [ ] `ELEVENLABS_API_KEY` is present and valid in the backend environment.
- [ ] Firebase configuration in `firebase-applet-config.json` is pointing to the production project.

## 2. Build & Asset Validation
- [ ] `npm run build` completes without errors or circular dependency warnings.
- [ ] Manual chunking in `vite.config.ts` is optimized for production (large libs isolated).
- [ ] Sourcemaps are disabled in production build to protect source code.
- [ ] All assets are correctly referenced in the `dist/` directory.

## 3. Runtime & Boot Safety
- [ ] `globalBootStarted` guard in `App.tsx` prevents duplicate execution in production.
- [ ] Critical Error Boundary is active for boot failures.
- [ ] Module registry lock is active after initialization.
- [ ] Health monitoring interval is tuned for production stability (30s).

## 4. Route & Navigation Safety
- [ ] 404 / `Unknown_Vector` route is active and provides a clear recovery path.
- [ ] `/dashboard` redirect to `/` is verified.
- [ ] Session restoration (`ORION_LAST_ROUTE`) is working correctly.

## 5. Security & Integrity
- [ ] CSP (Content Security Policy) is active and configured for production domains.
- [ ] Security headers (X-Frame-Options, HSTS, etc.) are verified.
- [ ] Production caching strategy (immutable assets, no-cache for index.html) is active.
- [ ] All Phase-14+ runtime core files pass the integrity check (`verify-integrity.js`).
- [ ] Biometric re-auth warnings are active in the settings layer.
- [ ] API base URL is relative (`/api`) to avoid CORS issues in standard deployments.

## 6. Cloud Execution & Recovery
- [ ] `ChunkLoadError` recovery path ("Force_Sync") is verified.
- [ ] Version meta tags are present in `index.html`.
- [ ] Base tag is correctly configured for SPA routing.
- [ ] Cleanup of development-only logs and debug statements verified.
