// QQ Flash Transfer (QQ 闪传) share link resolver.
//
// Mirrors the Go implementation in qfile_url_go: the anonymous web API is
// called with a random uin and HMAC-SHA1 request signatures.

const ORIGIN = "https://qfile.qq.com";
const API_BASE = `${ORIGIN}/http2rpc/gotrpc/noauth/`;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";
const SIGN_KEY = "9EB18BB9ED457684";
const SCENE_TYPE = 103;
const PAGE_LIMIT = 8 * 1024 * 1024;
const JSON_LIMIT = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const FILESET_PATTERN =
  /GetFileset_.{0,80}?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;

export const INVALID_SHARE_MESSAGE =
  "url must be an https://qfile.qq.com/q/... share link";

/** Thrown when the share URL is not an qfile.qq.com link. */
export class InvalidShareError extends Error {
  constructor() {
    super(INVALID_SHARE_MESSAGE);
    this.name = "InvalidShareError";
  }
}

/** A downloadable file in a share. */
export interface File {
  /** Physical id accepted by BatchDownload. */
  id: string;
  /** cli_fileid, accepted as an alias when selecting a file. */
  cliId: string;
  name: string;
  size: number;
  sha1: string;
}

/** Lists downloadable files in a public share. */
export async function listFiles(share: string): Promise<File[]> {
  validateShareUrl(share);
  const filesetId = await getFilesetId(share);

  const body = {
    fileset_id: filesetId,
    req_infos: [
      {
        parent_id: "",
        req_depth: 1,
        count: 20,
        sort_conditions: [
          { sort_field: 4, sort_order: 2 },
          { sort_field: 0, sort_order: 1 },
        ],
        filter_condition: { file_category: 0, exclude_deleted: true },
      },
    ],
    support_folder_status: true,
    scene_type: SCENE_TYPE,
  };

  const resp = await post<FileListResponse>(
    "trpc.file.FileFlashTrans/GetFileList",
    "0x93d4",
    "1",
    body,
  );
  if (resp.retcode !== 0) {
    throw new Error(
      `GetFileList: ${apiMessage(resp.message, resp.error)} (retcode ${resp.retcode})`,
    );
  }

  const files: File[] = [];
  for (const list of resp.data?.file_lists ?? []) {
    for (const f of list.file_list ?? []) {
      if (f.is_dir || !f.physical?.id) {
        continue;
      }
      files.push({
        id: f.physical.id,
        cliId: f.cli_fileid ?? "",
        name: f.name ?? "",
        size: parseIntOrZero(f.file_size),
        sha1: f.file_sha1 ?? "",
      });
    }
  }
  return files;
}

/** Requests a fresh direct download URL for a file in a share. */
export async function getLink(physicalId: string, name: string): Promise<string> {
  const body = {
    req_head: { agent: 8 },
    download_info: [
      {
        batch_id: physicalId,
        scene: { business_type: 4, app_type: 22, scene_type: 5 },
        index_node: { file_uuid: physicalId },
        url_type: 2,
        download_scene: 0,
      },
    ],
    scene_type: SCENE_TYPE,
  };

  const resp = await post<DownloadResponse>(
    "trpc.qqntv2.richmedia.InnerProxy/BatchDownload",
    "0x9248",
    "4",
    body,
  );
  if (resp.retcode !== 0) {
    throw new Error(
      `BatchDownload: ${apiMessage(resp.message, resp.error)} (retcode ${resp.retcode})`,
    );
  }

  const item = resp.data?.download_rsp?.[0];
  if (!item) {
    throw new Error("BatchDownload: empty download_rsp");
  }
  if (item.ret_code !== "0") {
    throw new Error(`BatchDownload: ${item.ret_msg} (ret_code ${item.ret_code})`);
  }
  if (!item.url) {
    throw new Error("BatchDownload: empty url");
  }
  return appendFilename(item.url, name);
}

/** Validates that a share URL is an https://qfile.qq.com/q/... link. */
export function validateShareUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidShareError();
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "qfile.qq.com" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new InvalidShareError();
  }
  const code = url.pathname.startsWith("/q/") ? url.pathname.slice(3) : "";
  if (code.replace(/^\/+|\/+$/g, "") === "") {
    throw new InvalidShareError();
  }
}

/** Appends an encoded filename parameter to a direct download URL. */
export function appendFilename(rawUrl: string, name: string): string {
  if (name === "") {
    return rawUrl;
  }
  let sep = "?";
  if (rawUrl.includes("?")) {
    sep = "&";
  }
  if (rawUrl.endsWith("?") || rawUrl.endsWith("&")) {
    sep = "";
  }
  return `${rawUrl}${sep}filename=${encodeQueryComponent(name)}`;
}

/** HMAC-SHA1 signature over body + nonce + timestamp, as lowercase hex. */
export async function signRequest(
  body: string,
  nonce: string,
  timestamp: string,
): Promise<string> {
  const mac = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    new TextEncoder().encode(body + nonce + timestamp),
  );
  return hex(new Uint8Array(mac));
}

async function getFilesetId(share: string): Promise<string> {
  const resp = await fetch(share, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  let finalHost = "";
  try {
    finalHost = new URL(resp.url).hostname;
  } catch {
    // Fall through to the rejection below.
  }
  if (finalHost !== "qfile.qq.com") {
    throw new Error("fetch share page: unexpected redirect away from qfile.qq.com");
  }
  if (resp.status !== 200) {
    throw new Error(`fetch share page: HTTP ${resp.status} ${resp.statusText}`);
  }

  const page = await resp.text();
  if (page.length > PAGE_LIMIT) {
    throw new Error("fetch share page: response too large");
  }
  const match = FILESET_PATTERN.exec(page);
  if (!match) {
    throw new Error(
      "fileset id not found in share page; the share may be expired or require an extraction code",
    );
  }
  return match[1]!;
}

async function post<T>(
  service: string,
  command: string,
  serviceType: string,
  body: unknown,
): Promise<T> {
  const raw = JSON.stringify(body);
  const nonce = String(1 + randomInt(10000));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await signRequest(raw, nonce, timestamp);

  const resp = await fetch(API_BASE + service, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      Origin: ORIGIN,
      Referer: `${ORIGIN}/`,
      "x-oidb": `{"uint32_command":${JSON.stringify(command)}, "uint32_service_type":${JSON.stringify(serviceType)}}`,
      "x-device-id": "",
      "x-qq-ar-nonce": nonce,
      "x-qq-ar-timestamp": timestamp,
      "x-qq-ar-signature": signature,
      Cookie: "uin=" + anonymousUin(),
    },
    body: raw,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await resp.text();
  if (resp.status !== 200) {
    throw new Error(
      `${service}: HTTP ${resp.status} ${resp.statusText}: ${snippet(text)}`,
    );
  }
  if (text.length > JSON_LIMIT) {
    throw new Error(`${service}: response too large`);
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(`${service}: decode response: ${errorMessage(err)}`);
  }
}

let signingKeyPromise: Promise<CryptoKey> | undefined;

function signingKey(): Promise<CryptoKey> {
  signingKeyPromise ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SIGN_KEY),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  return signingKeyPromise;
}

let cachedUin = 0;

function anonymousUin(): number {
  if (cachedUin === 0) {
    cachedUin = 100000000 + randomInt(900000000);
  }
  return cachedUin;
}

function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! % max;
}

function hex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

function encodeQueryComponent(value: string): string {
  // Match Go's url.QueryEscape: encodeURIComponent leaves !'()* unescaped.
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function parseIntOrZero(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isNaN(n) ? 0 : n;
}

function apiMessage(message: string | undefined, error: ApiError | undefined): string {
  if (message) {
    return message;
  }
  if (error?.message) {
    return error.message;
  }
  return "request failed";
}

function snippet(data: string): string {
  const s = data.trim();
  return s.length > 200 ? `${s.slice(0, 200)}...` : s;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface ApiError {
  code?: number;
  message?: string;
}

interface ApiFile {
  name?: string;
  file_size?: string;
  file_sha1?: string;
  is_dir?: boolean;
  cli_fileid?: string;
  physical?: { id?: string };
}

interface FileListData {
  file_lists?: Array<{ file_list?: ApiFile[] }>;
}

interface FileListResponse {
  retcode: number;
  message?: string;
  error?: ApiError;
  data?: FileListData;
}

interface DownloadItem {
  url?: string;
  ret_code?: string;
  ret_msg?: string;
}

interface DownloadResponse {
  retcode: number;
  message?: string;
  error?: ApiError;
  data?: { download_rsp?: DownloadItem[] };
}
