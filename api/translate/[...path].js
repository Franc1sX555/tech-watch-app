export default async function handler(req, res) {
  const path = Array.isArray(req.query.path) ? req.query.path.join("/") : req.query.path || "";
  const params = new URLSearchParams();

  Object.entries(req.query).forEach(([key, value]) => {
    if (key === "path") return;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value != null) params.set(key, value);
  });

  const upstreamUrl = `https://translate.googleapis.com/${path}${params.toString() ? `?${params}` : ""}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json,text/plain,*/*",
      },
    });

    const body = await upstream.arrayBuffer();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.send(Buffer.from(body));
  } catch (error) {
    res.status(502).json({
      error: "Translate proxy failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
