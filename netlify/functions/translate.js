function buildUpstreamUrl(event, baseUrl) {
  const incoming = new URL(event.rawUrl);
  const marker = "/.netlify/functions/translate/";
  const path = incoming.pathname.includes(marker)
    ? incoming.pathname.slice(incoming.pathname.indexOf(marker) + marker.length)
    : incoming.pathname.replace(/^\/translate\//, "");

  return `${baseUrl}/${path}${incoming.search}`;
}

exports.handler = async (event) => {
  const upstreamUrl = buildUpstreamUrl(event, "https://translate.googleapis.com");

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
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
      body,
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Translate proxy failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};
