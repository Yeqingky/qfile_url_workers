import { afterEach, describe, expect, it, vi } from "vitest";
import { signFileLinks } from "../src/index";
import type { File } from "../src/qfile";

function file(id: string): File {
  return { id, cliId: "", name: `${id}.txt`, size: 0, sha1: "" };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("signFileLinks", () => {
  it("keeps signed links when one file fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const links = await signFileLinks(
      [file("a"), file("b"), file("c")],
      async (id) => {
        if (id === "b") {
          throw new Error("upstream rejected b");
        }
        return `https://example.test/${id}`;
      },
    );
    expect(links).toEqual(["https://example.test/a", null, "https://example.test/c"]);
  });
});
