#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = "v0_8";
const sourceDir = join(projectRoot, "dist", version);
const targetDir = join(projectRoot, "skills", "runtime", version);

if (!existsSync(sourceDir)) {
  console.error(`Missing compiled runtime: ${sourceDir}`);
  console.error("Run `pnpm build` from the project root first.");
  process.exit(1);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });

const copied = [];
for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
  if (!entry.isFile() || extname(entry.name) !== ".js") {
    continue;
  }
  const source = join(sourceDir, entry.name);
  const target = join(targetDir, basename(entry.name));
  const contents = readFileSync(source, "utf8").replace(/\n?\/\/# sourceMappingURL=.*\n?$/u, "\n");
  writeFileSync(target, contents);
  copied.push(join("skills", "runtime", version, entry.name));
}

if (copied.length === 0) {
  console.error(`No JavaScript runtime files found in ${sourceDir}`);
  process.exit(1);
}

console.log(`Synced ${copied.length} runtime file(s):`);
for (const file of copied) {
  console.log(`- ${file}`);
}
