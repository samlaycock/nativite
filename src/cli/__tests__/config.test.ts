import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

describe("loadConfig", () => {
  let stdoutSpy: ReturnType<typeof spyOn>;
  let stderrSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    stdoutSpy = spyOn(process.stdout, "write").mockReturnValue(true);
    stderrSpy = spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  const validConfig = {
    app: {
      name: "TestApp",
      bundleId: "com.example.testapp",
      version: "1.0.0",
      buildNumber: 1,
    },
    platforms: [{ platform: "ios", minimumVersion: "17.0" }],
  };

  it("successfully loads a valid config", async () => {
    void mock.module("/fake/project/nativite.config.ts", () => ({
      default: validConfig,
    }));

    const { loadConfig } = await import("../config.ts");
    const config = await loadConfig("/fake/project");

    expect(config.app.name).toBe("TestApp");
    expect(config.app.bundleId).toBe("com.example.testapp");
    expect(config.app.version).toBe("1.0.0");
    expect(config.app.buildNumber).toBe(1);
  });

  it("throws when config file does not exist", async () => {
    void mock.module("/nonexistent/nativite.config.ts", () => {
      throw new Error("Cannot find module");
    });

    const { loadConfig } = await import("../config.ts");

    let error: Error | undefined;
    try {
      await loadConfig("/nonexistent");
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toContain("Could not load nativite.config.ts");
  });

  it("throws when config has no default export", async () => {
    void mock.module("/no-default/nativite.config.ts", () => ({
      // No default export
    }));

    const { loadConfig } = await import("../config.ts");

    let error: Error | undefined;
    try {
      await loadConfig("/no-default");
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toContain("must export a default config object");
  });

  it("throws when default export is not an object", async () => {
    void mock.module("/bad-default/nativite.config.ts", () => ({
      default: "not-an-object",
    }));

    const { loadConfig } = await import("../config.ts");

    let error: Error | undefined;
    try {
      await loadConfig("/bad-default");
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toContain("must export a default config object");
  });

  it("throws when default export is null", async () => {
    void mock.module("/null-default/nativite.config.ts", () => ({
      default: null,
    }));

    const { loadConfig } = await import("../config.ts");

    let error: Error | undefined;
    try {
      await loadConfig("/null-default");
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toContain("must export a default config object");
  });

  it("throws when config fails schema validation", async () => {
    void mock.module("/invalid-schema/nativite.config.ts", () => ({
      default: {
        app: {
          name: "", // empty name violates min(1)
          bundleId: "invalid",
          version: "1.0.0",
          buildNumber: 1,
        },
      },
    }));

    const { loadConfig } = await import("../config.ts");

    let error: unknown;
    try {
      await loadConfig("/invalid-schema");
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
  });

  it("includes cwd in the error message when file is missing", async () => {
    void mock.module("/my/project/nativite.config.ts", () => {
      throw new Error("ENOENT");
    });

    const { loadConfig } = await import("../config.ts");

    let error: Error | undefined;
    try {
      await loadConfig("/my/project");
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toContain("/my/project");
  });

  it("suggests using defineConfig in the no-default-export error", async () => {
    void mock.module("/no-define/nativite.config.ts", () => ({
      // intentionally empty
    }));

    const { loadConfig } = await import("../config.ts");

    let error: Error | undefined;
    try {
      await loadConfig("/no-define");
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toContain("defineConfig()");
  });
});
