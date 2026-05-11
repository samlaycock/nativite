import { describe, expect, it } from "bun:test";

import { createCliProgram } from "./index.ts";
import { stripAnsi } from "./strip-ansi.test-helper.ts";

describe("nativite CLI", () => {
  it("does not expose the removed dev command in help output", () => {
    const help = stripAnsi(createCliProgram().helpInformation());

    expect(help).toContain("build");
    expect(help).toContain("init");
    expect(help).not.toContain("dev");
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
});
