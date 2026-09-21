# Android Push Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Track the bounded tasks below and preserve existing workspace changes.

**Goal:** Deliver Android device registration, durable Expo delivery, safe notification navigation, settings and a verified APK.
**Architecture:** Existing Supabase notification events feed a private outbox processed by pg_cron/pg_net. An isolated client controller manages SecureStore installation state and expo-notifications; UI uses existing KarmaHouse components.
**Tech Stack:** Expo57, React Native0.86, TypeScript, Supabase PostgreSQL17, pg_cron1.6.4, pg_net0.20.4.
**Spec:** `docs/superpowers/specs/2026-09-20-android-push-design.md`.

## Constraints and decisions

- Preserve dirty branch `codex/karmahouse-foundation`; no commit/reset/push. Existing in-app feature is the required baseline, so no empty worktree that loses it.
- Native identity `com.karmahouse.karmahouse`; Expo UUID `e054aea9-38b4-4211-826b-521b3cc0be9f`; version0.1.4/code5.
- Frozen SQL003/004, additive005 only; no historical sends, no real-user fixture notices.
- Private keys stay outside repository and APK; use Expo token only in private DB transport. Do not display/log tokens.
- Work continues under user's explicit "avanza"; local design/plan are reviewable implementation records, not new approval checkpoints.

## Review focus

1. Old account request must not reactivate a device after logout: revision/tombstone/controller tests.
2. Failed disable must not display success or allow a confirmed logout leaving the device active: signout/controller tests.
3. A receipt for an old token must not deactivate its replacement: SQL receipt tests.
4. A queued notification blocked or disabled after creation must not be sent: dispatch eligibility tests.
5. A cold-start payload must not navigate before session is known or accept an arbitrary route: controller/domain tests.

## Task 1 — Private device registry and durable delivery

Owner: backend agent. Files: `supabase/migrations/20260920000500_android_push.sql`, `supabase/tests/android_push.sql`, `scripts/apply-android-push.mjs`, `scripts/verify-android-push.mjs`, `docs/android-push-data-verification.md`.

- [x] Add failing SQL behavior cases for registry revision/secret/session ownership, anonymous disable, token conflict, resolve access, no backfill and outbox eligibility. Run against prior schema in rollback to establish missing behavior.
- [x] Implement exact RPC contracts from spec, private devices/tombstones/outbox, enqueue trigger and worker. Separate pure response handling from fixed-URL pg_net transport for deterministic SQL tests.
- [x] Add ticket/receipt tests: transient retries with cap, malformed response, DeviceNotRegistered generation match, lost-response recovery, competing worker calls and blocked/disabled work.
- [x] Validate migration and tests in rollback, preserving old SQL hashes. Root/reviewer inspect before any apply.
- [x] Apply additive migration, install available extensions, register one `karmahouse-push-delivery` job every30s, verify restricted privileges and job health. Inventory/cleanup synthetic records, document evidence without tokens.

## Task 2 — Session-safe native client

Owner: client agent. Files: new `src/push/{types,domain,repository,controller,installationStore,signOutHooks}.ts`, `src/push/PushProvider{.native,.web}.tsx`, native adapter files as needed; `src/auth/AuthProvider.tsx`, `src/app/_layout.tsx`; tests `tests/push-*.test.ts`.

- [x] Red tests for pure parsing, revision persistence, session controller races, registration failure/disable and navigation hydration.
- [x] Implement adapter-independent controller and strict repository decoders using captured JWT/actor/signal; use exact public RPC contract from spec.
- [x] Implement SecureStore installation state, serialized revisions and retry-safe desired state; native adapter channel/permission/token/receipt listener, no automatic permission prompt; web provider truthful unavailable.
- [x] Wire provider after AuthProvider and signout cleanup before auth.signOut. Export `usePushNotifications` state `{supported,ready,enabled,busy,permission,error}` and methods `enable()`, `disable()`, `refresh()`, `openSettings()`; root consumes in settings card.
- [x] Gate taps on authenticated recipient + resolver, dedup responses and clear last response. Suppress foreground OS notices while mismatched/unauthenticated; refresh internal summary on current-account notice.
- [x] Run focused tests + typecheck and report contract/code files for independent review.

## Task 3 — Settings, dependency and Android artifact

Owner: root, release reviewer checks artifact. Files: `src/screens/NotificationSettingsScreen.tsx`, new `src/components/notifications/PushDeviceCard.tsx`, `package.json`/lock, `app.json`, notification alpha PNG/SVG, Android generated files; verifier script improvements.

- [x] Install Expo57-compatible expo-notifications with official Expo installer, add plugin/channel/icon; bump0.1.4(5) and generate native config without overwriting old APK.
- [x] Add accessible device card with explicit activation, permission-denied recovery, truthful web/iOS state and confirmed disable. Update category copy to include phone notices.
- [x] Verify repository exports and full tests/typecheck; visually inspect320/390/desktop and anonymous/account states with synthetic fixture, then cleanup.
- [x] Review full new push implementation independently and resolve material findings before remote apply/build.
- [x] Export all platforms and scan for secrets; build local release APK using existing JDK17/SDK36, then verify identity, code5, signing fingerprint, zipalign16K and content.
- [x] Document operational limits, key expiry, remote job health, test totals and artifact SHA256; deliver APK and clear physical-device test steps.

## Progress ledger

- 2026-09-20: Design recorded; Expo57 docs read. Read-only preflight confirms pg_cron/pg_net available but not installed, no existing jobs, cached Android toolchain, no adb device. No implementation begun before this record.

- 2026-09-20 cierre: 207 pruebas y TypeScript aprobados; export Android/iOS/web; UI320/390/1280 con fixture eliminado; SQL005 aplicada, 8 checks concurrentes y salida real pg_net verificados; transporte activo y 2 ticks correctos. APK0.1.4(5) verificado, SHA fc313259b443860258eb38acb95ba7f7017e60a170643240718d6f5a5c8bd63a. Recepción física pendiente, instrucciones incluidas en docs/android-push-verification.md.
