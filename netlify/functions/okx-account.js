const crypto = require("crypto");

const OKX_BASE_URL = "https://www.okx.com";

function sign(timestamp, method, requestPath, body = "") {
  const prehash = `${timestamp}${method}${requestPath}${body}`;
  return crypto.createHmac("sha256", process.env.OKX_API_SECRET).update(prehash).digest("base64");
}

async function okxGet(requestPath) {
  const timestamp = new Date().toISOString();
  const method = "GET";
  const headers = {
    "OK-ACCESS-KEY": process.env.OKX_API_KEY,
    "OK-ACCESS-SIGN": sign(timestamp, method, requestPath),
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": process.env.OKX_API_PASSPHRASE,
    Accept: "application/json",
  };

  const response = await fetch(`${OKX_BASE_URL}${requestPath}`, { headers });
  const data = await response.json();

  if (!response.ok || data?.code !== "0") {
    throw new Error(`${requestPath} ${response.status} ${data?.msg ?? data?.code ?? ""}`);
  }

  return data?.data ?? [];
}

function numberOrNull(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

exports.handler = async () => {
  const configured =
    Boolean(process.env.OKX_API_KEY) &&
    Boolean(process.env.OKX_API_SECRET) &&
    Boolean(process.env.OKX_API_PASSPHRASE);

  if (!configured) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        configured: false,
        fetchedAt: new Date().toISOString(),
        totalEq: null,
        adjEq: null,
        availEq: null,
        imr: null,
        mmr: null,
        notionalUsd: null,
        positions: [],
        errors: ["OKX read-only API key is not configured in Netlify environment variables."],
      }),
    };
  }

  const errors = [];
  let balance = {};
  let positions = [];

  try {
    const balanceData = await okxGet("/api/v5/account/balance");
    balance = balanceData?.[0] ?? {};
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "balance fetch failed");
  }

  try {
    const positionData = await okxGet("/api/v5/account/positions");
    positions = positionData ?? [];
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "positions fetch failed");
  }

  const normalizedPositions = positions
    .filter((position) => Number(position.pos) !== 0)
    .map((position) => ({
      instId: position.instId,
      side: position.posSide || position.side || "net",
      pos: numberOrNull(position.pos) ?? 0,
      avgPx: numberOrNull(position.avgPx),
      markPx: numberOrNull(position.markPx),
      upl: numberOrNull(position.upl) ?? 0,
      uplRatio: numberOrNull(position.uplRatio),
      lever: position.lever || "",
      liqPx: numberOrNull(position.liqPx),
    }));

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({
      configured: true,
      fetchedAt: new Date().toISOString(),
      totalEq: numberOrNull(balance.totalEq),
      adjEq: numberOrNull(balance.adjEq),
      availEq: numberOrNull(balance.availEq),
      imr: numberOrNull(balance.imr),
      mmr: numberOrNull(balance.mmr),
      notionalUsd: numberOrNull(balance.notionalUsd),
      positions: normalizedPositions,
      errors,
    }),
  };
};
