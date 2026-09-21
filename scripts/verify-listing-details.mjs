import { runListingDetails } from './apply-listing-details.mjs';

// Read-only verification of deployed schema, migration checksum and existing API grants.
await runListingDetails('verify');
