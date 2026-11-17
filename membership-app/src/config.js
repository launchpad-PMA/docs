import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadConfig(env = process.env, overrides = {}) {
  const publication = overrides.publication ?? env.AGREEMENT_PUBLICATION ?? "draft";
  if (publication !== "draft" && publication !== "published") {
    throw new Error("AGREEMENT_PUBLICATION must be draft or published.");
  }
  return {
    appRoot,
    adminToken: overrides.adminToken ?? env.ADMIN_TOKEN ?? "",
    publication,
    dataDir: path.resolve(appRoot, overrides.dataDir ?? env.DATA_DIR ?? "data"),
    publicBaseUrl: (overrides.publicBaseUrl ?? env.PUBLIC_BASE_URL ?? "").replace(/\/$/, ""),
    patreonUrlTemple:
      overrides.patreonUrlTemple ??
      env.PATREON_URL_TEMPLE ??
      "https://www.patreon.com/c/templeofroots/membership",
    patreonUrlAdbongo: overrides.patreonUrlAdbongo ?? env.PATREON_URL_ADBUNGO ?? "",
    hipcampUrl: overrides.hipcampUrl ?? env.HIPCAMP_URL ?? "",
    rpcUrl: overrides.rpcUrl ?? env.NFT_RPC_URL ?? "",
    port: Number(overrides.port ?? env.PORT ?? 8787),
    host: overrides.host ?? env.HOST ?? "127.0.0.1",
    rateLimit: overrides.rateLimit ?? true,
    recoverAddress: overrides.recoverAddress ?? null,
    rpcFetch: overrides.rpcFetch ?? null,
  };
}

export function isPublishable(fileStatus, config) {
  return fileStatus === "approved" && config.publication === "published";
}
