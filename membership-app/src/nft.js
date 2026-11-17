const BALANCE_OF = "0x70a08231";

export function balanceOfData(holder) {
  const cleaned = holder.toLowerCase().replace(/^0x/, "");
  if (!/^[a-f0-9]{40}$/.test(cleaned)) throw new Error("Wallet address is not a 20-byte hex address.");
  return BALANCE_OF + cleaned.padStart(64, "0");
}

export function assertRpcUrl(rpcUrl) {
  if (!rpcUrl) return;
  let url;
  try {
    url = new URL(rpcUrl);
  } catch {
    throw new Error("NFT RPC URL is not a URL.");
  }
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol === "https:") return;
  if (url.protocol === "http:" && local) return;
  throw new Error("NFT RPC URL must be https, or http on localhost.");
}

export async function erc721BalanceOf({ rpcUrl, collection, holder, fetchImpl = globalThis.fetch }) {
  assertRpcUrl(rpcUrl);
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: collection, data: balanceOfData(holder) }, "latest"],
    }),
  });
  if (!response.ok) throw new Error("The NFT network did not answer.");
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "The NFT network returned an error.");
  if (typeof payload.result !== "string" || !payload.result.startsWith("0x")) {
    throw new Error("The NFT network returned an unexpected balance.");
  }
  return BigInt(payload.result).toString();
}

export async function recoverPersonalSign(message, signature) {
  const { verifyMessage } = await import("ethers");
  return verifyMessage(message, signature).toLowerCase();
}
