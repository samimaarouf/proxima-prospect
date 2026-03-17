const GET = async ({ url }) => {
  const imageUrl = url.searchParams.get("url");
  if (!imageUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }
  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.linkedin.com/"
      }
    });
    if (!response.ok) {
      return new Response("Image not found", { status: 404 });
    }
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";
    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch {
    return new Response("Failed to fetch image", { status: 500 });
  }
};
export {
  GET
};
