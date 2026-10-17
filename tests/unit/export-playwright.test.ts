import path from "node:path";

import { strFromU8, unzipSync } from "fflate";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { buildPlaywrightFiles, zipFiles } from "@/lib/export/playwright";

import { exportRun } from "./fixtures/export-run";

const input = { detail: exportRun(), documentFilename: "checkout.md" };
const sourceUrl = "http://localhost:3000/?run=11111111-2222-4333-8444-555555555555";

// Type-checks a generated file with the real TypeScript compiler and the
// project's real @playwright/test types. The file is served from memory at
// a path inside the repo, so module resolution finds node_modules exactly
// as it would for a test someone drops into this project.
function typeCheck(content: string): string[] {
  const fileName = path.join(process.cwd(), "tests", "__generated__", "generated.spec.ts");
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (name, languageVersion, ...rest) =>
    path.resolve(name) === fileName
      ? ts.createSourceFile(name, content, languageVersion)
      : getSourceFile(name, languageVersion, ...rest);
  host.fileExists = (name) => path.resolve(name) === fileName || fileExists(name);
  host.readFile = (name) => (path.resolve(name) === fileName ? content : readFile(name));

  const program = ts.createProgram([fileName], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

describe("buildPlaywrightFiles", () => {
  const files = buildPlaywrightFiles(input, { sourceUrl });

  it("writes one file per requirement that has an approved test", () => {
    // REQ-02 has only a draft test, so it gets no file.
    expect(files.map((f) => f.path)).toEqual([
      "req-01-order-total-with-vat.spec.ts",
      "req-03-pleasant-design.spec.ts",
    ]);
  });

  it("includes only approved tests, as test.fixme", () => {
    const req1 = files[0].content;
    expect(req1).toContain('test.fixme("REQ-01-T1: Shows the total in €"');
    expect(req1).not.toContain("SUM");
    expect(req1.match(/test\.fixme\(/g)).toHaveLength(1);
  });

  it("matches the snapshot", () => {
    expect(files[0].content).toMatchSnapshot();
  });

  it("generates files that type-check against @playwright/test", () => {
    for (const file of files) {
      expect(typeCheck(file.content), file.path).toEqual([]);
    }
  }, 30_000);

  it("keeps hostile text inside comments and string literals", () => {
    const hostile = exportRun();
    hostile.requirements[0].title = 'Quote " backslash \\ and */ end';
    hostile.testCases[0].title = "Line\nbreak and `backtick` ${injection}";
    hostile.testCases[0].given = "line one\u2028}); process.exit(1); //";

    const [file] = buildPlaywrightFiles({ ...input, detail: hostile }, { sourceUrl });
    expect(typeCheck(file.content)).toEqual([]);
    expect(file.content).toContain("    // }); process.exit(1); //");
  }, 30_000);

  it("is caught by the type-check when broken (so the check means something)", () => {
    expect(typeCheck('import { test } from "@playwright/test";\ntest.fixme(42);')).not.toEqual([]);
  }, 30_000);
});

describe("zipFiles", () => {
  it("puts every file in one folder inside the zip", () => {
    const zip = unzipSync(
      zipFiles("checkout-playwright", [
        { path: "a.spec.ts", content: "// a €" },
        { path: "b.spec.ts", content: "// b" },
      ]),
    );

    expect(Object.keys(zip).sort()).toEqual([
      "checkout-playwright/a.spec.ts",
      "checkout-playwright/b.spec.ts",
    ]);
    expect(strFromU8(zip["checkout-playwright/a.spec.ts"])).toBe("// a €");
  });
});
