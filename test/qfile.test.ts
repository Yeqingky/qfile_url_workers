import { describe, expect, it } from "vitest";
import {
  INVALID_SHARE_MESSAGE,
  InvalidShareError,
  appendFilename,
  signRequest,
  validateShareUrl,
} from "../src/qfile";

describe("validateShareUrl", () => {
  const cases: Array<{ name: string; raw: string; valid: boolean }> = [
    { name: "valid", raw: "https://qfile.qq.com/q/tlTMa1XknC", valid: true },
    { name: "valid query", raw: "https://qfile.qq.com/q/tlTMa1XknC?pwd=1234", valid: true },
    { name: "http", raw: "http://qfile.qq.com/q/tlTMa1XknC", valid: false },
    { name: "foreign host", raw: "https://example.com/q/tlTMa1XknC", valid: false },
    { name: "subdomain", raw: "https://sub.qfile.qq.com/q/tlTMa1XknC", valid: false },
    { name: "port", raw: "https://qfile.qq.com:8443/q/tlTMa1XknC", valid: false },
    { name: "userinfo", raw: "https://user@qfile.qq.com/q/tlTMa1XknC", valid: false },
    { name: "wrong path", raw: "https://qfile.qq.com/files/tlTMa1XknC", valid: false },
    { name: "empty code", raw: "https://qfile.qq.com/q/", valid: false },
  ];

  for (const { name, raw, valid } of cases) {
    it(name, () => {
      if (valid) {
        expect(() => validateShareUrl(raw)).not.toThrow();
      } else {
        expect(() => validateShareUrl(raw)).toThrow(InvalidShareError);
        expect(() => validateShareUrl(raw)).toThrow(INVALID_SHARE_MESSAGE);
      }
    });
  }
});

describe("appendFilename", () => {
  const base = "https://multimedia.qfile.qq.com/download?appid=14901&rkey=abc";

  it("encodes the filename like Go's url.QueryEscape", () => {
    expect(appendFilename(base, "a+b c&d.png")).toBe(
      `${base}&filename=a%2Bb%20c%26d.png`,
    );
  });

  it("roundtrips through URLSearchParams", () => {
    const parsed = new URL(appendFilename(base, "a+b c&d.png"));
    expect(parsed.searchParams.get("filename")).toBe("a+b c&d.png");
  });

  it("uses ? when the URL has no query", () => {
    expect(appendFilename("https://multimedia.qfile.qq.com/download", "plain.txt")).toBe(
      "https://multimedia.qfile.qq.com/download?filename=plain.txt",
    );
  });

  it("returns the URL unchanged for an empty name", () => {
    expect(appendFilename(base, "")).toBe(base);
  });

  it("escapes characters that encodeURIComponent leaves alone", () => {
    expect(appendFilename("https://x.test/d", "!()*.png")).toBe(
      "https://x.test/d?filename=%21%28%29%2A.png",
    );
  });
});

describe("signRequest", () => {
  // Vectors computed independently with OpenSSL:
  // HMAC-SHA1("9EB18BB9ED457684", body + nonce + timestamp).
  it("matches a fixed HMAC-SHA1 vector", async () => {
    expect(await signRequest('{"a":1}', "1234", "1700000000")).toBe(
      "1cf1366ad9b069fee57189e18737939810dcc19d",
    );
  });

  it("matches a fixed file list body vector", async () => {
    const body =
      '{"fileset_id":"x","req_infos":[],"support_folder_status":true,"scene_type":103}';
    expect(await signRequest(body, "4321", "1700000000")).toBe(
      "640f851b86909574fcb62a9ad5dfea81485b87ad",
    );
  });
});
