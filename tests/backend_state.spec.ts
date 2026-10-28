import {
  assertBackendGeneration,
  backendGeneration,
  canAccessTaskFiles,
  invalidateBackend,
  isExternalBackend,
  remoteDownloadOptions,
  setExternalBackend,
} from "@/services/backend_state";

beforeEach(() => {
  setExternalBackend(false);
});

describe("generation counter", () => {
  it("starts at a stable integer", () => {
    expect(typeof backendGeneration()).toBe("number");
  });

  it("increments on invalidate", () => {
    const before = backendGeneration();
    invalidateBackend();
    expect(backendGeneration()).toBe(before + 1);
  });

  it("assertBackendGeneration passes when generation matches", () => {
    const gen = backendGeneration();
    expect(() => assertBackendGeneration(gen)).not.toThrow();
  });

  it("assertBackendGeneration throws after invalidate", () => {
    const gen = backendGeneration();
    invalidateBackend();
    expect(() => assertBackendGeneration(gen)).toThrow("RPC backend changed");
  });
});

describe("external flag", () => {
  it("is false by default after reset", () => {
    expect(isExternalBackend()).toBe(false);
  });

  it("reflects the value set by setExternalBackend", () => {
    setExternalBackend(true);
    expect(isExternalBackend()).toBe(true);
    setExternalBackend(false);
    expect(isExternalBackend()).toBe(false);
  });
});

describe("canAccessTaskFiles", () => {
  it("allows local aria2 tasks when backend is embedded", () => {
    setExternalBackend(false);
    expect(canAccessTaskFiles({ gid: "abc123" })).toBe(true);
  });

  it("allows vortex tasks regardless of backend mode", () => {
    setExternalBackend(true);
    expect(canAccessTaskFiles({ gid: "vortex:abc" })).toBe(true);
  });

  it("denies non-vortex tasks when backend is external", () => {
    setExternalBackend(true);
    expect(canAccessTaskFiles({ gid: "abc123" })).toBe(false);
  });

  it("denies tasks stamped remote even when backend flag was reset", () => {
    setExternalBackend(false);
    expect(canAccessTaskFiles({ gid: "abc123", remote: true })).toBe(false);
  });
});

describe("remoteDownloadOptions", () => {
  it("returns options unchanged when backend is embedded", () => {
    setExternalBackend(false);
    const opts = { dir: "/downloads", out: "file.zip" };
    expect(remoteDownloadOptions(opts)).toEqual(opts);
  });

  it("strips dir when backend is external", () => {
    setExternalBackend(true);
    const opts = { dir: "/downloads", out: "file.zip" };
    const result = remoteDownloadOptions(opts);
    expect(result).not.toHaveProperty("dir");
    expect(result.out).toBe("file.zip");
  });

  it("does not mutate the original options object", () => {
    setExternalBackend(true);
    const opts = { dir: "/downloads", out: "file.zip" };
    remoteDownloadOptions(opts);
    expect(opts.dir).toBe("/downloads");
  });
});
