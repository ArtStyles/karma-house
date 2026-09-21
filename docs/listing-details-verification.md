# Listing details and filters — 2026-09-20

Implemented optional condition, floor (0–99) and negotiability across local drafts, saved listings, remote payloads and the existing property-save RPC. Existing listings remain unspecified; no values were inferred.

## Compatibility contract

- `Listing.condition`: `new | good | needs-renovation`, optional. `Listing.floor`: integer, optional. `Listing.priceNegotiable`: boolean, optional.
- Drafts use `condition: ''` and `floor: ''` to clear values. `priceNegotiable: null` explicitly clears it and survives draft JSON persistence. Omission preserves existing values when an older caller edits a listing.
- New RPC fields are `condition`, `floor`, `priceNegotiable`; SQL columns are `condition`, `floor`, `price_negotiable`. SQL `null` means unspecified. Direct authenticated table updates remain denied; ownership, moderation and optimistic concurrency rules are unchanged.
- Province, price/area ranges, minimum bathrooms, condition, amenities (all selected items must match), and negotiability combine with existing filters. Unknown condition/negotiability never match their positive filters. Sorting adds descending price and area. `activeFilterCount` excludes sorting and counts a range once; `filterRangeError` reports malformed or reversed ranges.
- The selector includes 15 provinces and Isla de la Juventud, using the [official Cuba Travel list](https://www.cuba.travel/sobre-cuba/sociedad-de-cuba). Existing free-text values remain valid for compatibility.

## Local evidence

- Nine initial regression tests failed against the prior implementation, then passed. The later explicit-null negotiability regression also failed before its fix and passed afterwards.
- Final targeted run: **58 tests passed**, zero failed: `listing-details`, `listings`, `listing-draft`, `remote-marketplace`, `map-data`.
- Final `npm run typecheck`: passed.
- Apply and verification scripts passed Node syntax checks.

## Database evidence

Migration `20260920000200_listing_details.sql` was applied using the bundled Node runtime, with an exclusive migration window coordinated by the parent task.

SHA-256: `6d2ced080bbe34e5ab2682ab0ed3ef7bd1ec34e0b89372216356f3d7e8944a0b`.

1. `--preflight` on the previous schema failed as expected: `DETAILS ASSERTION FAILED: RPC persists condition rather than silently dropping new fields`. The transaction was rolled back.
2. `--test` installed the migration inside a transaction, passed the SQL suite and rolled back.
3. `--apply` passed the same preservation checks and SQL suite, then committed the migration and checksum ledger.
4. `verify-listing-details.mjs` confirmed the deployed checksum, nullable types/defaults and unchanged restricted grants.
5. A public REST request using only the publishable key returned HTTP 200 and one permitted catalog row with all three new columns.

Before applying the schema change, the runner created a synthetic legacy announcement and legacy edit with the old RPC. It replayed both requests after the migration to simulate lost acknowledgements across an upgrade: same property ID and version 2, no duplicate or extra update. That actor was removed before commit.

The SQL suite additionally covers explicit zero/false, invalid values/types, create/update retry, cross-owner and administrator edit denial, direct-write denial, anonymous access after approval, re-moderation on edit, version conflicts, old-client omission preservation, explicit null clearing and old-client creation. All SQL fixtures were rolled back.

Preserved inventory: **1 property, 2 profiles, 0 favorites, 2 auth users, 2 administrators, 3 photos; 0 reserved fixture users**. The property, detail, receipt and receipt-detail digests matched before and after:

| Digest | Value |
| --- | --- |
| Property | `5dc9d0bfff84f32ab1e4b0fe84fc85b6` |
| Details | `2db87494bf5fb1e8d8a9f94ce00c51a3` |
| Receipt | `6358badfaf62808ed9b5491cdb50ea49` |
| Receipt details | `ab453798cdb3032602803ad3e6966d36` |

Local execution logs: `docs/listing-details-sql-test.log`, `docs/listing-details-sql-apply.log`, `docs/listing-details-sql-verify.log`, `docs/listing-details-rest-verify.log`. Logs contain no credentials.

## Verification boundary

This evidence covers domain behavior, persistence, SQL/RPC permissions, deployed schema and a read-only public REST query. UI rendering, the separately managed fixture for browser testing and physical-device validation belong to the parent task.
