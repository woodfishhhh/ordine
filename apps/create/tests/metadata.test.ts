import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(testsDir, "..");
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
  bin: Record<string, string>;
  description: string;
  name: string;
  version: string;
};
const cliSource = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

describe("create package metadata", () => {
  it("uses the npm create ordine initializer name", () => {
    expect(packageJson.name).toBe("create-ordine");
    expect(packageJson.description).toContain("npm create ordine");
    expect(packageJson.bin["create-ordine"]).toBe("dist/index.js");
  });

  it("keeps the CLI version string aligned with package.json", () => {
    expect(cliSource).toContain(`.version("${packageJson.version}")`);
  });
});
