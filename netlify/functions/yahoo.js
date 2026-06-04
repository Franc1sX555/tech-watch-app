function buildUpstreamUrl(event, baseUrl) {
  const incoming = new URL(event.rawUrl);
  const marker = "/.netlify/functions/yahoo/";
  const path = incoming.pathname.includes(marker)
    ? incoming.pathname.slice(incoming.pathname.indexOf(marker) + marker.length)
    : incoming.pathname.replace(/^\/yahoo\//, "");

  return `${baseUrl}/${path}${incoming.search}`;
}

exports.handler = async (event) => {
  const upstreamUrl = buildUpstreamUrl(event, "https://query1.finance.yahoo.com");

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json,text/plain,*/*",
      },
    });

    const body = await upstream.text();

    return {
      statusCode: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
      body,
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Yahoo proxy failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};
