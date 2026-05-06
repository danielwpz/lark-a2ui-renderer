#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = "v0_8";
const sourceDir = join(projectRoot, "dist", version);
const targetDir = join(projectRoot, "skills", "runtime", version);
const staticSkillRuntimeFiles = new Set([
  "callback.js",
  "index.js",
  "json.js",
  "render.js",
  "surface.js",
  "types.js",
  "validate.js",
]);

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
  if (!staticSkillRuntimeFiles.has(entry.name)) {
    continue;
  }
  const source = join(sourceDir, entry.name);
  const target = join(targetDir, basename(entry.name));
  const contents = transformStaticSkillRuntime(
    entry.name,
    readFileSync(source, "utf8").replace(/\n?\/\/# sourceMappingURL=.*\n?$/u, "\n"),
  );
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

function transformStaticSkillRuntime(filename, contents) {
  if (filename === "index.js") {
    return contents
      .replace(/^export \* from "\.\/datasource\.js";\n/mu, "")
      .replace(/^export \* from "\.\/lark-live\.js";\n/mu, "");
  }

  if (filename === "types.js") {
    return contents.replace(
      /^export const DYNAMIC_DATA_EXTENSION_ID = "urn:a2ui:extension:dynamic-data:v0_1";\n/mu,
      "",
    );
  }

  if (filename !== "validate.js") {
    return contents;
  }

  let output = contents
    .replace(/DYNAMIC_DATA_EXTENSION_ID,\s*/u, "")
    .replace(/^const EXTENSION_MESSAGE_KEYS = \["dataSourceUpdate"\];\n/mu, "")
    .replace(
      /^ {4}const allowDynamicDataSources = options\.allowDynamicDataSources \?\? false;\n/mu,
      "",
    )
    .replace(/^ {12}allowDynamicDataSources,\n/mu, "")
    .replace(
      / {4}const messageKeys = options\.allowDynamicDataSources\n {8}\? \[\.\.\.CORE_MESSAGE_KEYS, \.\.\.EXTENSION_MESSAGE_KEYS\]\n {8}: CORE_MESSAGE_KEYS;\n {4}const presentKeys = messageKeys\.filter\(\(key\) => key in message\);\n/u,
      "    const presentKeys = CORE_MESSAGE_KEYS.filter((key) => key in message);\n",
    )
    .replace(
      / {4}if \(key === "dataSourceUpdate"\) \{\n {8}validateDataSourceUpdate\(message\.dataSourceUpdate, `\$\{path\}\.dataSourceUpdate`, issues\);\n {8}return;\n {4}\}\n/u,
      "",
    )
    .replace(
      /^ {12}const store = new SurfaceStore\(\);\n {12}store\.applyMessages\(input\.filter\(isCoreServerMessage\)\);\n/mu,
      "            const store = new SurfaceStore();\n            store.applyMessages(input);\n",
    );

  output = removeFunction(output, "validateDataSourceUpdate");
  output = removeFunction(output, "validateDataSourceDeclaration");
  output = removeFunction(output, "isCoreServerMessage");
  return output;
}

function removeFunction(contents, name) {
  const marker = `function ${name}(`;
  const start = contents.indexOf(marker);
  if (start === -1) {
    return contents;
  }

  const bodyStart = contents.indexOf("{", start);
  if (bodyStart === -1) {
    throw new Error(`Could not find function body for ${name}`);
  }

  let depth = 0;
  for (let index = bodyStart; index < contents.length; index += 1) {
    const char = contents[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const end = contents[index + 1] === "\n" ? index + 2 : index + 1;
        return `${contents.slice(0, start)}${contents.slice(end)}`;
      }
    }
  }

  throw new Error(`Could not remove function ${name}`);
}
