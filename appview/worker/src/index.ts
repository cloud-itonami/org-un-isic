// AppView Worker for the ISIC Rev. 4 langserver. ADR-2605180900 Phase 7.
//
// Mounts `/xrpc/com.etzhayyim.apps.isic.*` at isic.etzhayyim.com and proxies to
// the in-cluster lg-open-isic langserver. The handler library lives in
// @etzhayyim/kotodama-host-sdk/langserver-xrpc-handler.

import { createLangserverXrpcHandler } from "@etzhayyim/kotodama-host-sdk";

export interface Env {
  /** Public-or-private base URL of the ISIC langserver. */
  LG_ISIC_ENDPOINT: string;
  /** Optional CF Service binding for the langserver. */
  LG_ISIC?: { fetch: typeof fetch };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.LG_ISIC_ENDPOINT && !env.LG_ISIC) {
      return new Response(
        JSON.stringify({ error: "Misconfigured: LG_ISIC_ENDPOINT unset" }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
    const app = createLangserverXrpcHandler({
      taxonomy: "isic",
      endpoint: env.LG_ISIC_ENDPOINT,
      fetcher: env.LG_ISIC,
      timeoutMs: 15_000,
    });
    return app.fetch(request);
  },
};
