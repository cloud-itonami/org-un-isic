/**
 * Query: MST prefix traversal via @etzhayyim/sdk.read().
 *
// CHARTER-VIOLATION §substrate (centralized DB forbidden — migrate to AT MST + IPFS + Base L2)
 * Replaces the RW query path (kysely.selectFrom('vertex_open_isic_class')…)
 * with a direct PDS read over MST. ISIC hierarchy maps to key prefixes
 * directly because rkey == 4-digit code:
 *
 *   prefix "01"  → all division-01 classes  (e.g. crop production)
 *   prefix "011" → all group-011 classes    (e.g. non-perennial crops)
 *   rkey   "0111"→ exact class              (Growing of cereals etc.)
 *
 * Section-level scans (`--section=A`) require a single getTaxonomy
 * lookup or a hard-coded division → section mapping; for now this CLI
 * supports prefix scans + exact rkey.
 *
 * Usage:
 *   pnpm tsx src/query.ts --prefix=01           # all division-01 classes
 *   pnpm tsx src/query.ts --code=0111           # one specific class
 *   pnpm tsx src/query.ts --prefix=25 --limit=20
 */

import { Etzhayyim } from "@etzhayyim/sdk";
import type { IsicClass } from "./types.js";

const COLLECTION = "com.etzhayyim.apps.openIsic.class";

const e = new Etzhayyim({
  did: process.env.ETZ_READER_DID ?? "did:web:etzhayyim.com",
  pdsUrl: process.env.ETZ_PDS_URL ?? "https://pds.etzhayyim.com",
  ipfsGateway: process.env.ETZ_IPFS_GATEWAY ?? "https://ipfs.etzhayyim.com",
  l2RpcUrl: process.env.ETZ_L2_RPC_URL ?? "https://mainnet.base.org",
});

interface Args {
  prefix?: string;
  code?: string;
  limit?: number;
  fetchBlobs?: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (const a of argv) {
    const m = a.match(/^--(\w+)(?:=(.*))?$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "limit") out.limit = Number(v);
    else if (k === "fetchBlobs") out.fetchBlobs = v !== "false";
    else (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.code) {
    const { records } = await e.read<IsicClass>({
      collection: COLLECTION,
      rkey: args.code,
      fetchBlobs: args.fetchBlobs ?? false,
    });
    console.log(JSON.stringify(records[0] ?? null, null, 2));
    return;
  }

  const prefix = args.prefix ?? "";
  const { records, cursor } = await e.read<IsicClass>({
    collection: COLLECTION,
    prefix,
    limit: args.limit ?? 50,
    fetchBlobs: args.fetchBlobs ?? false,
  });
  console.log(`[query] prefix=${JSON.stringify(prefix)} → ${records.length} records`);
  for (const r of records) {
    console.log(`  ${r.value.code}  ${r.value.nameEn}`);
  }
  if (cursor) console.log(`[query] next cursor: ${cursor}`);
}

const isMainModule =
  import.meta.url.startsWith("file:") &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMainModule) {
  main().catch((err) => {
    console.error("[query] fatal:", err);
    process.exit(2);
  });
}
