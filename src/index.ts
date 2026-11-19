import { InvalidShareError, errorMessage, getLink, listFiles } from "./qfile";

interface FileView {
  file_id: string;
  name: string;
  size: number;
  sha1: string;
  url?: string;
}

const LINK_CONCURRENCY = 6;

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/qfile") {
      return handleFiles(request, url);
    }
    if (url.pathname === "/url") {
      return handleLink(request, url);
    }
    return json(404, { error: "not found" });
  },
} satisfies ExportedHandler;

async function handleFiles(request: Request, url: URL): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }
  const share = url.searchParams.get("url");
  if (!share) {
    return json(400, { error: "missing url parameter" });
  }

  try {
    const files = await listFiles(share);
    const withLinks = url.searchParams.get("link") === "true";
    const urls = withLinks
      ? await mapLimit(files, LINK_CONCURRENCY, (f) => getLink(f.id, f.name))
      : [];

    const views: FileView[] = [];
    for (const [index, f] of files.entries()) {
      const view: FileView = {
        file_id: f.cliId || f.id,
        name: f.name,
        size: f.size,
        sha1: f.sha1,
      };
      if (withLinks) {
        view.url = urls[index]!;
      }
      views.push(view);
    }
    return json(200, { files: views });
  } catch (err) {
    return upstreamError("/qfile", err);
  }
}

async function handleLink(request: Request, url: URL): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }
  const share = url.searchParams.get("url");
  const fileId = url.searchParams.get("file_id");
  if (!share) {
    return json(400, { error: "missing url parameter" });
  }
  if (!fileId) {
    return json(400, { error: "missing file_id parameter" });
  }

  try {
    const files = await listFiles(share);
    const found = files.find((f) => f.cliId === fileId || f.id === fileId);
    if (!found) {
      return json(404, { error: "file not found in share" });
    }
    return json(200, { url: await getLink(found.id, found.name) });
  } catch (err) {
    return upstreamError("/url", err);
  }
}

function methodNotAllowed(): Response {
  return json(405, { error: "method not allowed" }, { Allow: "GET" });
}

function upstreamError(path: string, err: unknown): Response {
  if (err instanceof InvalidShareError) {
    return json(400, { error: err.message });
  }
  console.error(`${path}: ${errorMessage(err)}`);
  return json(502, { error: errorMessage(err) });
}

function json(
  status: number,
  value: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(`${JSON.stringify(value)}\n`, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) {
        return;
      }
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}
