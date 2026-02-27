const STATIC_ASSET_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".eot",
  ".flac",
  ".gif",
  ".heic",
  ".heif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".m4a",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".png",
  ".svg",
  ".tif",
  ".tiff",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
]);

const MODULE_QUERY_PARAMS = [
  "html-proxy",
  "import",
  "inline",
  "raw",
  "sharedworker",
  "url",
  "worker",
] as const;

type HeaderValue = string | string[] | undefined;

type RequestHeaders = Record<string, HeaderValue>;

function normalizeHeaderValue(value: HeaderValue): string | undefined {
  if (Array.isArray(value)) return value.join(",");
  return value;
}

function stripQueryAndHash(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? url;
}

function hasModuleQuery(url: string): boolean {
  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) return false;

  const hashIndex = url.indexOf("#", queryIndex);
  const query = url.slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex);
  if (!query) return false;

  const params = new URLSearchParams(query);
  return MODULE_QUERY_PARAMS.some((param) => params.has(param));
}

function hasStaticAssetExtension(pathname: string): boolean {
  const basename = pathname.slice(pathname.lastIndexOf("/") + 1);
  const extensionStart = basename.lastIndexOf(".");
  if (extensionStart === -1) return false;
  const extension = basename.slice(extensionStart).toLowerCase();
  return STATIC_ASSET_EXTENSIONS.has(extension);
}

function acceptsHtmlDocument(acceptHeader: string): boolean {
  return /\btext\/html\b|\bapplication\/xhtml\+xml\b/.test(acceptHeader);
}

export function shouldTransformNativeRequest(url: string, headers: RequestHeaders): boolean {
  const pathname = stripQueryAndHash(url);
  const moduleQuery = hasModuleQuery(url);
  const fetchDest = normalizeHeaderValue(headers["sec-fetch-dest"]);
  const accept = normalizeHeaderValue(headers["accept"]) ?? "";
  if (pathname === "/") return false;
  if (pathname.endsWith(".html") && !moduleQuery) return false;
  // Top-level navigations (e.g. "/sheet") must be served as HTML documents
  // so SPA routes can bootstrap. Transforming these as modules leads to blank
  // pages in WKWebView when fetch metadata headers are absent.
  if (!moduleQuery && acceptsHtmlDocument(accept)) return false;

  // Query markers are authoritative signals from Vite's module graph.
  // Honor them even when request headers are ambiguous on WKWebView.
  if (moduleQuery) return true;

  // Bare static asset URLs can still represent module imports in dev
  // (e.g. `import logo from "./logo.svg"` requesting `/src/logo.svg` as a
  // module). Allow transform for script-like destinations only.
  if (hasStaticAssetExtension(pathname)) {
    if (fetchDest) {
      return fetchDest === "script" || fetchDest === "empty";
    }
    // Old runtimes may omit Sec-Fetch-Dest. Prefer raw static serving unless
    // the Accept header explicitly looks JavaScript-like.
    if (
      /\bapplication\/javascript\b|\btext\/javascript\b|\bapplication\/ecmascript\b|\btext\/ecmascript\b/.test(
        accept,
      )
    ) {
      return true;
    }
    return false;
  }

  if (fetchDest) {
    return fetchDest === "script" || fetchDest === "empty";
  }

  return !/\bimage\/|\bfont\/|\baudio\/|\bvideo\//.test(accept);
}
