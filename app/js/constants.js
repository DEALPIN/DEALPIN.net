/* Shared lists. The server (supabase/schema.sql) enforces the same values: change both together. */
const DELIVERY=['I deliver by rider','Buyer collects','Courier or bus parcel'];
const PAYMENTS=['Mobile money','Bank transfer','Card or online payment','Cash on delivery','Other'];
const LEGACY_PAYMENTS=['MTN MoMo','Airtel Money'];   // accepted on old deals, no longer offered
const MAX_PHOTOS=3;
const MAX_PRICE=1e11;
const STATUSES=['created','agreed','shipped','received','disputed','cancelled','resolved'];
