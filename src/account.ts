export type OkxPosition = {
  instId: string;
  side: string;
  pos: number;
  avgPx: number | null;
  markPx: number | null;
  margin: number | null;
  notionalUsd: number | null;
  upl: number;
  uplRatio: number | null;
  lever: string;
  liqPx: number | null;
};

export type OkxAccountSnapshot = {
  configured: boolean;
  fetchedAt: string;
  totalEq: number | null;
  adjEq: number | null;
  availEq: number | null;
  imr: number | null;
  mmr: number | null;
  notionalUsd: number | null;
  positions: OkxPosition[];
  errors: string[];
};

export async function loadOkxAccountSnapshot(): Promise<OkxAccountSnapshot> {
  try {
    const response = await fetch("/account/summary");
    if (!response.ok) throw new Error(`account ${response.status}`);
    return await response.json();
  } catch (error) {
    return {
      configured: false,
      fetchedAt: new Date().toISOString(),
      totalEq: null,
      adjEq: null,
      availEq: null,
      imr: null,
      mmr: null,
      notionalUsd: null,
      positions: [],
      errors: [error instanceof Error ? error.message : "account fetch failed"],
    };
  }
}
