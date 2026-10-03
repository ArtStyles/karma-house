# CommonJS security backport

This local package contains the decoder from upstream
[decode-uri-component 0.5.0](https://github.com/SamVerschueren/decode-uri-component/releases/tag/v0.5.0),
which fixes [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr).
It retains the upstream MIT license.

The only compatibility changes are the CommonJS export and the legacy conversion
of `+` to a space. Expo Router 57 uses `query-string@7`, which requires a CommonJS
function; a direct override to upstream 0.5.0's ES module breaks that contract.
The package version identifies this as a KarmaHouse adaptation, not an official
upstream release. The npm override affects only `query-string`'s decoder.

`tests/router-query-security.test.ts` exercises the dependency resolved by Expo
Router, including malformed percent input, Unicode and normal query parameters.
Remove this package and override when Expo Router provides a compatible fixed
dependency. Do not edit `node_modules` to maintain the fix.
