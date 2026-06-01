import { NextResponse } from "next/server";

function normalizeJsonUrl(url: string) {
  const match = url.match(/^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^@/]+)@([^/]+)\/(.+)$/);
  if (!match) return url;

  const [, owner, repo, branch, assetPath] = match;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${assetPath}`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetUrl = String(url.searchParams.get("url") || "").trim();
    if (!targetUrl) {
      return NextResponse.json({ error: "Missing url." }, { status: 400 });
    }

    const parsedTarget = new URL(normalizeJsonUrl(targetUrl));
    if (parsedTarget.protocol !== "https:" && parsedTarget.protocol !== "http:") {
      return NextResponse.json({ error: "Only http(s) URLs are supported." }, { status: 400 });
    }

    const response = await fetch(parsedTarget.toString(), {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Asset request failed: ${response.status}` },
        { status: response.status },
      );
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Asset JSON fetch failed." },
      { status: 500 },
    );
  }
}
