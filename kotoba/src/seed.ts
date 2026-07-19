/**
 * Seeder: 428 data/classes/{4digit}.json → AT Records via @etzhayyim/sdk.
 *
 * Replaces the RW seed path (was `vertex_open_isic_class` migration) with
 * a straight-line PDS write loop. Idempotent: rkey derives from `code`
 * so re-running is a no-op past the first run. The class JSONs already
 * live in `60-apps/etzhayyim-project-open-isic/data/classes/`; this seeder
 * reads them, derives the missing `section` field via division→section
 * mapping, and writes to PDS.
 *
 * Usage:
 *   pnpm tsx src/seed.ts                # all 428 classes
 *   pnpm tsx src/seed.ts --only=2520    # one specific class
 *   pnpm tsx src/seed.ts --since=2520   # resume from a code
 */

import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Etzhayyim } from "@etzhayyim/sdk";
import { hierarchyOf, type IsicClass } from "./types.js";

const COLLECTION = "com.etzhayyim.apps.openIsic.class";
const ISIC_PUBLISHED_AT_DEFAULT = "2008-01-01T00:00:00Z";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLASSES_DIR = join(__dirname, "..", "..", "data", "classes");

const e = new Etzhayyim({
  did: process.env.ETZ_SEEDER_DID ?? "did:web:etzhayyim.com",
  pdsUrl: process.env.ETZ_PDS_URL ?? "https://pds.etzhayyim.com",
  ipfsApiUrl: process.env.ETZ_IPFS_API_URL,
  l2RpcUrl: process.env.ETZ_L2_RPC_URL ?? "https://mainnet.base.org",
  anchorContract:
    (process.env.ETZ_ANCHOR_CONTRACT as `0x${string}` | undefined) ??
    undefined,
});

interface SourceClass {
  code: string;
  nameEn: string;
  group?: string;
  description?: string;
  includes?: string[];
  excludes?: string[];
  implementedAt?: string;
}

interface Args {
  classesDir?: string;
  only?: string;
  since?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (const a of argv) {
    const m = a.match(/^--(\w+)(?:=(.*))?$/);
    if (!m) continue;
    const [, k, v] = m;
    (out as Record<string, string | undefined>)[k] = v;
  }
  return out;
}

export function toIsicClass(src: SourceClass): IsicClass {
  const { section, division, group } = hierarchyOf(src.code);
  return {
    code: src.code,
    nameEn: src.nameEn,
    section,
    division,
    group,
    description: src.description,
    includes: src.includes,
    excludes: src.excludes,
    publishedAt: src.implementedAt ?? ISIC_PUBLISHED_AT_DEFAULT,
  };
}

async function loadClasses(dir: string): Promise<SourceClass[]> {
  const entries = await readdir(dir);
  const out: SourceClass[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const raw = await readFile(join(dir, entry), "utf8");
    out.push(JSON.parse(raw) as SourceClass);
  }
  out.sort((a, b) => a.code.localeCompare(b.code));
  return out;
}

async function seedOne(src: SourceClass): Promise<void> {
  const record = toIsicClass(src);
  await e.write({
    collection: COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey: record.code,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const classesDir = args.classesDir ?? DEFAULT_CLASSES_DIR;
  const classes = await loadClasses(classesDir);
  console.log(`[seed] loaded ${classes.length} ISIC classes from ${classesDir}`);

  const filtered = classes.filter((c) => {
    if (args.only) return c.code === args.only;
    if (args.since) return c.code >= args.since;
    return true;
  });
  if (filtered.length === 0) {
    console.error("[seed] no classes match filter");
    process.exit(1);
  }
  console.log(`[seed] writing ${filtered.length} records (filter: ${JSON.stringify(args)})`);

  let okCount = 0;
  let errCount = 0;
  for (const src of filtered) {
    try {
      await seedOne(src);
      okCount += 1;
      if (okCount % 50 === 0) console.log(`[seed] ${okCount}/${filtered.length} …`);
    } catch (err) {
      errCount += 1;
      console.error(`[seed] FAILED code=${src.code}: ${(err as Error).message}`);
    }
  }
  console.log(`[seed] DONE  ok=${okCount}  err=${errCount}`);
}

const isMainModule =
  import.meta.url.startsWith("file:") &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMainModule) {
  main().catch((err) => {
    console.error("[seed] fatal:", err);
    process.exit(2);
  });
}
