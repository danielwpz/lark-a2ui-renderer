import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
const envFile = resolveEnvFile();

if (existsSync(envFile)) {
  loadEnvFile(envFile);
}

function resolveEnvFile(): string {
  const configured = process.env.A2UI_INTEGRATION_ENV_FILE;
  if (configured == null || configured.length === 0) {
    return join(rootDir, ".env.integration");
  }
  return isAbsolute(configured) ? configured : resolve(rootDir, configured);
}

function loadEnvFile(path: string): void {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const parsed = parseEnvLine(line, index + 1);
    if (parsed == null || parsed.key in process.env) {
      continue;
    }
    process.env[parsed.key] = parsed.value;
  }
}

function parseEnvLine(line: string, lineNumber: number): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith("#")) {
    return null;
  }

  const normalized = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trim()
    : trimmed;
  const equalsIndex = normalized.indexOf("=");
  if (equalsIndex <= 0) {
    throw new Error(`Invalid .env.integration line ${lineNumber}: expected KEY=VALUE`);
  }

  const key = normalized.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`Invalid .env.integration line ${lineNumber}: invalid env key '${key}'`);
  }

  return {
    key,
    value: unquoteValue(normalized.slice(equalsIndex + 1).trim()),
  };
}

function unquoteValue(value: string): string {
  if (value.length < 2) {
    return value;
  }

  const first = value[0];
  const last = value.at(-1);
  if (first === '"' && last === '"') {
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (first === "'" && last === "'") {
    return value.slice(1, -1);
  }
  return value;
}
