export type { IsicClass } from "./types.js";
export { hierarchyOf, sectionForDivision } from "./types.js";

// Programmatic entry points (in addition to the CLI bins). Apps that
// embed open-isic read access can import from here:
//   import { queryByPrefix, getByCode } from "@etzhayyim/open-isic-kotoba";

import { Etzhayyim } from "@etzhayyim/sdk";
import type { IsicClass } from "./types.js";

const COLLECTION = "com.etzhayyim.apps.openIsic.class";

function defaultClient() {
  return new Etzhayyim({
    did: "did:web:etzhayyim.com",
    pdsUrl: "https://pds.etzhayyim.com",
    ipfsGateway: "https://ipfs.etzhayyim.com",
    l2RpcUrl: "https://mainnet.base.org",
  });
}

export async function queryByPrefix(
  prefix: string,
  opts: { limit?: number; client?: Etzhayyim } = {},
): Promise<IsicClass[]> {
  const e = opts.client ?? defaultClient();
  const { records } = await e.read<IsicClass>({
    collection: COLLECTION,
    prefix,
    limit: opts.limit ?? 50,
    fetchBlobs: false,
  });
  return records.map((r) => r.value);
}

export async function getByCode(
  code: string,
  opts: { client?: Etzhayyim } = {},
): Promise<IsicClass | null> {
  const e = opts.client ?? defaultClient();
  const { records } = await e.read<IsicClass>({
    collection: COLLECTION,
    rkey: code,
    fetchBlobs: false,
  });
  return records[0]?.value ?? null;
}
