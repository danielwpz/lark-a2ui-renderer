import type { BoundValue, DataEntry } from "./types.js";

export function dataEntriesToValue(entries: DataEntry[]): unknown {
  const pairs = entries.map((entry) => [entry.key, dataEntryToValue(entry)] as const);
  if (pairs.length > 0 && pairs.every(([key]) => /^\d+$/.test(key))) {
    const sorted = [...pairs].sort(([a], [b]) => Number(a) - Number(b));
    const isDense = sorted.every(([key], index) => Number(key) === index);
    if (isDense) {
      return sorted.map(([, value]) => value);
    }
  }

  return Object.fromEntries(pairs);
}

export function dataEntryToValue(entry: DataEntry): unknown {
  if ("valueString" in entry) {
    return entry.valueString;
  }
  if ("valueNumber" in entry) {
    return entry.valueNumber;
  }
  if ("valueBoolean" in entry) {
    return entry.valueBoolean;
  }
  if (entry.valueMap != null) {
    return dataEntriesToValue(entry.valueMap);
  }
  return null;
}

export function getJsonPointer(root: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "/") {
    return root;
  }
  if (!pointer.startsWith("/")) {
    return undefined;
  }

  let current: unknown = root;
  for (const part of pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (current == null) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
      continue;
    }
    return undefined;
  }
  return current;
}

export function setJsonPointer(root: unknown, pointer: string, value: unknown): unknown {
  if (pointer === "" || pointer === "/") {
    return value;
  }
  if (!pointer.startsWith("/")) {
    throw new Error(`Invalid JSON pointer: ${pointer}`);
  }

  const base =
    root != null && typeof root === "object" ? cloneJsonContainer(root) : Object.create(null);
  const parts = pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));

  let current: Record<string, unknown> | unknown[] = base as Record<string, unknown> | unknown[];
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (part == null) {
      continue;
    }
    const nextPart = parts[index + 1] ?? "";
    const nextExisting = Array.isArray(current)
      ? current[Number(part)]
      : (current as Record<string, unknown>)[part];
    const next =
      nextExisting != null && typeof nextExisting === "object"
        ? cloneJsonContainer(nextExisting)
        : /^\d+$/.test(nextPart)
          ? []
          : Object.create(null);
    if (Array.isArray(current)) {
      current[Number(part)] = next;
    } else {
      current[part] = next;
    }
    current = next as Record<string, unknown> | unknown[];
  }

  const finalKey = parts.at(-1);
  if (finalKey == null) {
    return base;
  }
  if (Array.isArray(current)) {
    current[Number(finalKey)] = value;
  } else {
    current[finalKey] = value;
  }
  return base;
}

export function resolveBoundValue(value: unknown, dataModel: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }
  const bound = value as BoundValue;
  if (bound.path != null) {
    return getJsonPointer(dataModel, bound.path);
  }
  if ("literalString" in bound) {
    return bound.literalString;
  }
  if ("literalNumber" in bound) {
    return bound.literalNumber;
  }
  if ("literalBoolean" in bound) {
    return bound.literalBoolean;
  }
  if ("literalArray" in bound) {
    return bound.literalArray;
  }
  return undefined;
}

export function resolveString(value: unknown, dataModel: unknown): string {
  const resolved = resolveBoundValue(value, dataModel);
  if (typeof resolved === "string") {
    return resolved;
  }
  if (resolved == null) {
    return "";
  }
  return String(resolved);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function cloneJsonContainer(value: object): object {
  if (Array.isArray(value)) {
    return [...value];
  }
  return { ...(value as Record<string, unknown>) };
}
