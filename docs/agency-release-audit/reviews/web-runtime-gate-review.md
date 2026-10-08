# Task16 hosted web packaging review

Base `3fab84a85633f9b841c505335d8bd8c2f7a0c7d8`; head `280d75bd3ed849f0a8ed69e6137fa5d907c6284d`. Scope: the supplied brief, implementation report, and complete `review-web-runtime-3fab..280d75b.diff`. Review only; no source, index, HEAD, deployment, or hosted state was changed.

### Spec Compliance

- ✅ **Spec compliant for the local packaging repair.** `web/api/agency.ts:1-35` removes both runtime `.ts` imports, places the existing strict public DTO decoder inside its sole function consumer, and uses the same five-character escaping logic as the listing function. The handler and `GET` bodies are untouched in the diff, preserving their current privacy projection, seal, signed-logo origin/path checks, response headers, 404/503 handling, and listing behavior. The deletion of `web/lib/public-agency-profile.ts` removes the now-unneeded runtime module. The diff contains only these two web paths and `tests/agency-public-profile.test.ts`; it contains no native, SQL, manifest, operator, business, version, dependency, or deployment changes.
- ✅ **Meaningful emitted-package regression.** `tests/agency-public-profile.test.ts:11-61` emits `web/api` and `web/lib` sources to JavaScript without rewriting import specifiers, checks that the temporary package contains no `.ts` files, `src`, or `node_modules`, and executes both agency and listing imports under ordinary Node ESM. Its agency assertions cover escaped output, true/false verification seal, null/malformed DTO responses, missing config, and privacy. Its listing import and malformed-ID assertion exercise the second entrypoint without a TS loader. The reported RED failures name each former `.ts` import, then the report records 39/39 scoped tests, typecheck, and web build passing (`web-runtime-gate-report.md:35-107`). These are reported command results, not independently rerun results, as the reviewer instructions require.
- ⚠️ **Hosted runtime remains unverified.** The test emits with local TypeScript rather than Vercel's production adapter (`tests/agency-public-profile.test.ts:16-28`; `web-runtime-gate-report.md:148-152`). A WEB-only redeploy and real `/agency/<unknown UUID>` check must establish that the Vercel function loads and returns 404. Root owns that gate; this local review does not imply hosted success or promotion.

### Strengths

- The fix addresses the exact observed `ERR_MODULE_NOT_FOUND` import path, including the transitive `./p.ts` escape import, while retaining a self-contained agency entrypoint (`web/api/agency.ts:1-35`).
- The decoder retains its closed field allowlist, strict identifier/phone/area/logo checks, and opt-in office field (`web/api/agency.ts:7-25`). This matters because a packaging repair must not widen the public DTO.
- The test is intentionally stronger than the earlier source-copy test: it evaluates emitted JavaScript with no TS runtime loader and checks that a private field fails closed (`tests/agency-public-profile.test.ts:11-61`). The report candidly limits that evidence to local emission (`web-runtime-gate-report.md:148-152`).

### Issues

#### Critical (Must Fix)

- None found in the supplied diff.

#### Important (Should Fix)

- None found in the supplied diff.

#### Minor (Nice to Have)

- `web/api/agency.ts:27-31` duplicates the small HTML escape map/function from `web/api/p.ts`. This is a visible maintenance cost: a future change to one public renderer could leave the other with different escaping. The current duplication is a reasonable bounded tradeoff for two independent emitted function entrypoints and does not presently change behavior; keep both renderers' escape coverage in the public-page tests. No code change is required for this gate.

### Assessment

**Task quality: Approved for the local task; hosted acceptance remains pending.** The patch is narrow, the emitted-JS test exercises the failure mode rather than the former TS-source path, and the diff shows no privacy, runtime-dependency, or security regression. The production function package and Vercel runtime still require root's WEB-only deployment check before promotion.

**Checks run:** Reviewed the brief, full implementation report, and supplied diff once. No tests or Git commands were rerun; no outside source files were read.
