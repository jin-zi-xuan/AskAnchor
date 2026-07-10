import { describe, expect, it } from "vitest";

const manifest = require("../manifest.json");

describe("extension permissions", () => {
  it("does not request broad tabs permission", () => {
    expect(manifest.permissions).toContain("storage");
    expect(manifest.permissions).toContain("clipboardWrite");
    expect(manifest.permissions).not.toContain("tabs");
  });
});
