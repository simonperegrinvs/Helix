import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const modulesRoot = join(process.cwd(), "apps/server/src/modules");
const violations = [];

const collectFiles = (directory) => {
  const output = [];
  for (const entry of readdirSync(directory)) {
    const next = join(directory, entry);
    const stats = statSync(next);
    if (stats.isDirectory()) {
      output.push(...collectFiles(next));
      continue;
    }
    if (next.endsWith(".ts")) {
      output.push(next);
    }
  }
  return output;
};

const files = collectFiles(modulesRoot);
const importRegex = /from\s+["']([^"']+)["']/g;

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const matches = content.matchAll(importRegex);
  for (const match of matches) {
    const specifier = match[1];
    if (!specifier.includes("/modules/")) {
      continue;
    }

    const crossImport = specifier.match(/modules\/([^/]+)\/(.+)$/);
    if (!crossImport) {
      continue;
    }

    const currentModule = relative(modulesRoot, file).split("/")[0];
    const targetModule = crossImport[1];
    const targetPath = crossImport[2];

    if (currentModule === targetModule) {
      continue;
    }

    if (targetPath !== "api" && !targetPath.startsWith("api/")) {
      violations.push(
        `${relative(process.cwd(), file)} imports ${specifier} (cross-module imports must use /api only)`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error("Boundary violations found:\n");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Boundary check passed.");
