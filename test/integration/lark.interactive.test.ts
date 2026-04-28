import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import "./load-integration-env.js";

import {
  extractLarkCallback,
  formatValidationIssues,
  normalizeCallback,
  renderSurface,
  SurfaceStore,
  validateA2uiMessages,
} from "../../src/v0_8/index.js";
import type { A2uiServerMessage } from "../../src/v0_8/index.js";
import { larkCaseMatrix, prepareLarkCase } from "../support/lark-case-matrix.js";

interface LarkClient {
  im: {
    message: {
      create(input: {
        params: { receive_id_type: "chat_id" };
        data: { receive_id: string; msg_type: "interactive"; content: string };
      }): Promise<unknown>;
    };
  };
}

interface LarkSocket {
  start(input: { eventDispatcher: unknown }): void;
  stop?: () => void;
  close?: () => void;
  handleEventData?: (data: unknown) => unknown;
}

interface LarkModule {
  Client: new (options: { appId: string; appSecret: string; loggerLevel?: unknown }) => LarkClient;
  EventDispatcher: new (
    options: Record<string, never>,
  ) => {
    register(handlers: Record<string, (data: unknown) => unknown>): unknown;
  };
  LoggerLevel: {
    fatal: unknown;
  };
  WSClient: new (options: {
    appId: string;
    appSecret: string;
    autoReconnect: boolean;
    loggerLevel?: unknown;
  }) => LarkSocket;
}

const shouldRun = process.env.RUN_LARK_A2UI_INTEGRATION === "1";
const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
const matrixFilter = process.env.LARK_A2UI_MATRIX_FILTER;
const matrixCases =
  matrixFilter == null || matrixFilter.length === 0
    ? larkCaseMatrix
    : larkCaseMatrix.filter((testCase) => new RegExp(matrixFilter).test(testCase.id));
const sendDelayMs = Number(process.env.LARK_A2UI_SEND_DELAY_MS ?? 100);
const fixtureCallbackTimeoutMs = Number(process.env.LARK_A2UI_CALLBACK_TIMEOUT_MS ?? 180_000);

let larkContextPromise: Promise<{
  Lark: LarkModule;
  client: LarkClient;
  appId: string;
  appSecret: string;
  chatId: string;
}> | null = null;

test.skipIf(!shouldRun)(
  "sends a fixture card to Feishu/Lark and optionally logs card callbacks",
  async () => {
    const listenCallbacks = process.env.LARK_A2UI_LISTEN_CALLBACKS === "1";
    const fixture = process.env.LARK_A2UI_FIXTURE ?? "confirm-button";
    const { Lark, client, appId, appSecret, chatId } = await getLarkContext();

    const messages = readJson<A2uiServerMessage[]>(
      join(rootDir, "fixtures", fixture, "a2ui.messages.json"),
    );
    const validation = validateA2uiMessages(messages);
    assert.equal(validation.ok, true, formatValidationIssues(validation.issues));
    const surfaceId = process.env.LARK_A2UI_SURFACE_ID ?? validation.renderedSurfaceIds[0];
    assert.ok(surfaceId, "No renderable surface found in fixture");

    const store = new SurfaceStore();
    store.applyMessages(messages);
    const surface = store.getSurface(surfaceId);
    const rendered = renderSurface(surface);

    console.log(
      `sending Lark A2UI fixture '${fixture}' surface '${surfaceId}' with ${rendered.callbackBindings.length} callback binding(s)`,
    );
    if (process.env.LARK_A2UI_PRINT_CARD_JSON === "1") {
      console.log("rendered Lark card JSON");
      console.log(JSON.stringify(rendered.card, null, 2));
    }

    const response = await sendInteractiveCard(client, chatId, rendered.card);
    console.log("sent lark a2ui fixture card", JSON.stringify(response, null, 2));
    assert.ok(response);

    if (!listenCallbacks) {
      return;
    }

    console.log("starting callback logger; interact with the card now");
    const callback = await listenForOneCardCallback({ Lark, appId, appSecret });
    console.log("captured raw card callback for fixture", fixture);
    console.log(JSON.stringify(callback, null, 2));
    const callbackInput = extractLarkCallback(callback);
    const userAction = normalizeCallback(surface, callbackInput);
    assert.equal(userAction.userAction.surfaceId, surface.surfaceId);
    assert.equal(userAction.userAction.sourceComponentId, callbackInput.envelope.sourceComponentId);
    writeCallbackArtifact({ rawCallback: callback, callbackInput, userAction });
    console.log("normalized A2UI userAction");
    console.log(JSON.stringify(userAction, null, 2));
  },
  fixtureCallbackTimeoutMs + 30_000,
);

describe.skipIf(!shouldRun)("Lark card render matrix", () => {
  test("matrix has at least 50 real-send cases", () => {
    assert.ok(
      larkCaseMatrix.length >= 50,
      `expected at least 50 cases, got ${larkCaseMatrix.length}`,
    );
    assert.ok(matrixCases.length > 0, `matrix filter '${matrixFilter}' matched no cases`);
  });

  for (const testCase of matrixCases) {
    test(`sends matrix case: ${testCase.id}`, async () => {
      const { client, chatId } = await getLarkContext();
      const prepared = prepareLarkCase(testCase);

      assert.ok(
        prepared.rendered.callbackBindings.length >= testCase.expectedMinimumBindings,
        `${testCase.id} expected at least ${testCase.expectedMinimumBindings} callback bindings`,
      );

      const response = await sendInteractiveCard(client, chatId, prepared.rendered.card);
      assert.ok(response);
      if (sendDelayMs > 0) {
        await sleep(sendDelayMs);
      }
    }, 30_000);
  }
});

async function getLarkContext(): Promise<{
  Lark: LarkModule;
  client: LarkClient;
  appId: string;
  appSecret: string;
  chatId: string;
}> {
  if (larkContextPromise != null) {
    return larkContextPromise;
  }
  larkContextPromise = (async () => {
    const appId = requireEnv("LARK_APP_ID");
    const appSecret = requireEnv("LARK_APP_SECRET");
    const chatId = requireEnv("LARK_CHAT_ID");
    const Lark = (await import(
      process.env.LARK_NODE_SDK_MODULE ?? "@larksuiteoapi/node-sdk"
    )) as unknown as LarkModule;
    const client = new Lark.Client({
      appId,
      appSecret,
      loggerLevel: Lark.LoggerLevel.fatal,
    });
    return { Lark, client, appId, appSecret, chatId };
  })();
  return larkContextPromise;
}

async function sendInteractiveCard(
  client: LarkClient,
  chatId: string,
  card: Record<string, unknown>,
): Promise<unknown> {
  return await client.im.message.create({
    params: { receive_id_type: "chat_id" },
    data: {
      receive_id: chatId,
      msg_type: "interactive",
      content: JSON.stringify(card),
    },
  });
}

async function listenForOneCardCallback(input: {
  Lark: LarkModule;
  appId: string;
  appSecret: string;
}): Promise<unknown> {
  const timeoutMs = fixtureCallbackTimeoutMs;
  return await new Promise<unknown>((resolve, reject) => {
    let socket: LarkSocket | undefined;
    const timeout = setTimeout(() => {
      closeSocket(socket);
      reject(new Error(`Timed out waiting for card.action.trigger after ${timeoutMs}ms`));
    }, timeoutMs);

    const dispatcher = new input.Lark.EventDispatcher({}).register({
      "card.action.trigger": (data: unknown) => {
        console.log("raw card.action.trigger payload");
        console.log(JSON.stringify(data, null, 2));
        clearTimeout(timeout);
        closeSocket(socket);
        resolve(data);
        return {
          toast: {
            type: "success",
            content: "callback logged",
          },
        };
      },
    });

    socket = new input.Lark.WSClient({
      appId: input.appId,
      appSecret: input.appSecret,
      autoReconnect: false,
      loggerLevel: input.Lark.LoggerLevel.fatal,
    });
    patchWsClientForCardCallbacks(socket);
    socket.start({ eventDispatcher: dispatcher });
  });
}

function closeSocket(socket: LarkSocket | undefined): void {
  if (socket == null) {
    return;
  }
  if (typeof socket.stop === "function") {
    socket.stop();
    return;
  }
  if (typeof socket.close === "function") {
    socket.close();
  }
}

function patchWsClientForCardCallbacks(socket: unknown): void {
  const candidate = socket as {
    handleEventData?: (data: unknown) => unknown;
  };
  if (typeof candidate.handleEventData !== "function") {
    return;
  }
  const original = candidate.handleEventData.bind(socket);
  candidate.handleEventData = (data: unknown) => {
    if (isRecord(data) && Array.isArray(data.headers)) {
      data.headers = data.headers.map((header) => {
        if (isRecord(header) && header.key === "type" && header.value === "card") {
          return { ...header, value: "event" };
        }
        return header;
      });
    }
    return original(data);
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeCallbackArtifact(value: unknown): void {
  const outputPath =
    process.env.LARK_A2UI_CALLBACK_OUTPUT ?? join(rootDir, ".tmp", "lark-callback-result.json");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(redactDiagnosticValue(value), null, 2)}\n`);
}

function redactDiagnosticValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactDiagnosticValue);
  }
  if (!isRecord(value)) {
    return value;
  }

  const redacted = [
    "token",
    "app_id",
    "tenant_key",
    "user_id",
    "open_id",
    "union_id",
    "open_chat_id",
    "open_message_id",
  ];
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      redacted.includes(key) ? "[redacted]" : redactDiagnosticValue(entry),
    ]),
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}
