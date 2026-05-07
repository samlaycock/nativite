import { describe, expect, it } from "bun:test";

import { stripAnsi } from "./strip-ansi.test-helper.ts";

describe("nativite CLI", () => {
  it("does not expose the removed dev command in help output", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "--help"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NO_COLOR: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const help = stripAnsi(stdout);
    expect(help).toContain("build");
    expect(help).toContain("init");
    expect(help).not.toContain("dev");
  });
});
