import { describe, expect, it } from "bun:test";

import { createCliProgram } from "./index.ts";
import { stripAnsi } from "./strip-ansi.test-helper.ts";

describe("nativite CLI", () => {
  it("exposes the optional dev status command in help output", () => {
    const help = stripAnsi(createCliProgram().helpInformation());

    expect(help).toContain("build");
    expect(help).toContain("dev");
    expect(help).toContain("init");
    expect(help).toContain("test");
  });

  it("documents dev URL selection in help output", () => {
    const program = createCliProgram();
    const devCommand = program.commands.find((command) => command.name() === "dev");

    expect(devCommand).toBeDefined();
    const help = stripAnsi(devCommand!.helpInformation());
    expect(help).toContain("--url <url>");
    expect(help).toContain("Vite dev server URL");
  });

  it("documents init platform selection in help output", () => {
    const program = createCliProgram();
    const initCommand = program.commands.find((command) => command.name() === "init");

    expect(initCommand).toBeDefined();
    const help = stripAnsi(initCommand!.helpInformation());
    expect(help).toContain("--platform <platform>");
    expect(help).toContain("ios,");
    expect(help).toContain("macos, or android");
  });

  it("documents native test orchestration options in help output", () => {
    const program = createCliProgram();
    const testCommand = program.commands.find((command) => command.name() === "test");

    expect(testCommand).toBeDefined();
    const help = stripAnsi(testCommand!.helpInformation());
    expect(help).toContain("--platform <platform>");
    expect(help).toContain("--device <id>");
    expect(help).toContain("--watch");
    expect(help).toContain("--coordinator-port <port>");
  });
});
