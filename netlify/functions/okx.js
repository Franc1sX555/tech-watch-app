function buildUpstreamUrl(event, baseUrl) {
  const incoming = new URL(event.rawUrl);
  const marker = "/.netlify/functions/okx/";
  const path = incoming.pathname.includes(marker)
    ? incoming.pathname.slice(incoming.pathname.indexOf(marker) + marker.length)
    : incoming.pathname.replace(/^\/okx\//, "");

  return `${baseUrl}/${path}${incoming.search}`;
}

exports.handler = async (event) => {
  const upstreamUrl = buildUpstreamUrl(event, "https://www.okx.com");

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    const body = await upstream.text();

    return {
      statusCode: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "public, max-age=10, stale-while-revalidate=30",
      },
      body,
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "OKX proxy failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};
