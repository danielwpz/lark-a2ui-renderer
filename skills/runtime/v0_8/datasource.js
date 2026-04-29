import { spawn } from "node:child_process";
import { isRecord } from "./json.js";
import { DYNAMIC_DATA_EXTENSION_ID } from "./types.js";
export class DynamicDataRuntime {
    surfaceStore;
    options;
    sourcesBySurface = new Map();
    runningBySurface = new Map();
    constructor(surfaceStore, options = {}) {
        this.surfaceStore = surfaceStore;
        this.options = options;
    }
    applyMessages(messages) {
        const list = Array.isArray(messages) ? messages : [messages];
        const coreMessages = [];
        for (const message of list) {
            if ("dataSourceUpdate" in message) {
                this.applyDataSourceUpdate(message);
            }
            else {
                coreMessages.push(message);
            }
        }
        if (coreMessages.length > 0) {
            this.surfaceStore.applyMessages(coreMessages);
        }
    }
    applyDataSourceUpdate(message) {
        const update = message.dataSourceUpdate;
        if (update.extensionId !== undefined && update.extensionId !== DYNAMIC_DATA_EXTENSION_ID) {
            throw new Error(`Unsupported data source extension: ${update.extensionId}`);
        }
        const sources = this.ensureSourceMap(update.surfaceId);
        for (const source of update.sources) {
            validateDataSource(source);
            sources.set(source.id, source);
        }
    }
    start(surfaceId) {
        const sources = this.sourcesBySurface.get(surfaceId);
        if (sources == null) {
            throw new Error(`No data sources registered for surface '${surfaceId}'`);
        }
        const running = this.ensureRunningMap(surfaceId);
        for (const source of sources.values()) {
            if (running.has(source.id)) {
                continue;
            }
            this.runStartedSourceOnce(surfaceId, source.id);
            const timer = setInterval(() => {
                this.runStartedSourceOnce(surfaceId, source.id);
            }, source.trigger.everyMs);
            running.set(source.id, { source, timer });
        }
        return {
            dispose: () => this.stop(surfaceId),
        };
    }
    stop(surfaceId) {
        const running = this.runningBySurface.get(surfaceId);
        if (running == null) {
            return;
        }
        for (const entry of running.values()) {
            clearInterval(entry.timer);
        }
        this.runningBySurface.delete(surfaceId);
    }
    stopAll() {
        for (const surfaceId of this.runningBySurface.keys()) {
            this.stop(surfaceId);
        }
    }
    async runSourceOnce(surfaceId, sourceId) {
        const event = await this.executeSourceOnce(surfaceId, sourceId, false);
        if (event == null) {
            throw new Error(`Data source '${sourceId}' for surface '${surfaceId}' was stopped`);
        }
        return event;
    }
    runStartedSourceOnce(surfaceId, sourceId) {
        this.executeSourceOnce(surfaceId, sourceId, true).catch((error) => {
            this.options.log?.("error", error instanceof Error ? error.message : `Data source failed: ${String(error)}`);
        });
    }
    async executeSourceOnce(surfaceId, sourceId, ignoreIfStopped) {
        const source = this.sourcesBySurface.get(surfaceId)?.get(sourceId);
        if (source == null) {
            throw new Error(`Unknown data source '${sourceId}' for surface '${surfaceId}'`);
        }
        const result = await this.runBashSource(source);
        if (ignoreIfStopped && !this.runningBySurface.get(surfaceId)?.has(sourceId)) {
            return null;
        }
        const value = parseJsonStdout(result.stdout, source.id);
        const event = {
            surfaceId,
            path: source.output.target,
            value,
            sourceId: source.id,
        };
        this.surfaceStore.updateDataModel(surfaceId, source.output.target, value);
        await this.options.onDataModelChange?.(event);
        return event;
    }
    runBashSource(source) {
        const timeoutMs = source.policy?.timeoutMs ?? 5000;
        const maxOutputBytes = source.policy?.maxOutputBytes ?? 1_000_000;
        const shellPath = this.options.shellPath ?? "bash";
        return new Promise((resolve, reject) => {
            const child = spawn(shellPath, ["-lc", source.program.script], {
                cwd: this.options.cwd,
                env: this.options.env ?? process.env,
                stdio: ["ignore", "pipe", "pipe"],
            });
            let stdout = "";
            let stderr = "";
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) {
                    return;
                }
                settled = true;
                child.kill("SIGTERM");
                reject(new Error(`Data source '${source.id}' timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            child.stdout.on("data", (chunk) => {
                stdout += chunk.toString("utf8");
                if (Buffer.byteLength(stdout, "utf8") > maxOutputBytes && !settled) {
                    settled = true;
                    clearTimeout(timer);
                    child.kill("SIGTERM");
                    reject(new Error(`Data source '${source.id}' exceeded maxOutputBytes ${maxOutputBytes}`));
                }
            });
            child.stderr.on("data", (chunk) => {
                stderr += chunk.toString("utf8");
            });
            child.on("error", (error) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                reject(error);
            });
            child.on("close", (code, signal) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                if (code !== 0) {
                    reject(new Error(`Data source '${source.id}' exited with code ${code ?? `signal ${signal}`}: ${stderr.trim()}`));
                    return;
                }
                resolve({ stdout });
            });
        });
    }
    ensureSourceMap(surfaceId) {
        const existing = this.sourcesBySurface.get(surfaceId);
        if (existing != null) {
            return existing;
        }
        const created = new Map();
        this.sourcesBySurface.set(surfaceId, created);
        return created;
    }
    ensureRunningMap(surfaceId) {
        const existing = this.runningBySurface.get(surfaceId);
        if (existing != null) {
            return existing;
        }
        const created = new Map();
        this.runningBySurface.set(surfaceId, created);
        return created;
    }
}
export function isDataSourceUpdateMessage(value) {
    return isRecord(value) && isRecord(value.dataSourceUpdate);
}
function validateDataSource(source) {
    if (typeof source.id !== "string" || source.id.length === 0) {
        throw new Error("Data source id is required");
    }
    if (source.driver !== "bash") {
        throw new Error(`Unsupported data source driver '${String(source.driver)}'`);
    }
    if (source.trigger?.type !== "interval") {
        throw new Error(`Unsupported data source trigger '${String(source.trigger?.type)}'`);
    }
    if (!Number.isInteger(source.trigger.everyMs) || source.trigger.everyMs < 1) {
        throw new Error("Data source trigger.everyMs must be a positive integer");
    }
    if (typeof source.program?.script !== "string" || source.program.script.length === 0) {
        throw new Error("Data source program.script is required");
    }
    if (source.output?.format !== "json") {
        throw new Error(`Unsupported data source output format '${String(source.output?.format)}'`);
    }
    if (typeof source.output.target !== "string" || !source.output.target.startsWith("/")) {
        throw new Error("Data source output.target must be a JSON pointer");
    }
}
function parseJsonStdout(stdout, sourceId) {
    const trimmed = stdout.trim();
    if (trimmed.length === 0) {
        throw new Error(`Data source '${sourceId}' produced empty stdout`);
    }
    try {
        return JSON.parse(trimmed);
    }
    catch (error) {
        throw new Error(`Data source '${sourceId}' produced invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
}
