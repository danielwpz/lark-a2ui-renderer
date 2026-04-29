# Language-Neutral Contracts

This document defines the API shape that TypeScript, Python, Go, Java, or other
implementations should share. Concrete names can vary by language, but behavior
and JSON inputs/outputs should stay compatible.

The base protocol is [A2UI](https://a2ui.org/) v0.8. These contracts describe
the renderer-side API for this Lark implementation, plus explicitly marked
experimental extensions.

## Core Operations

```text
applyMessages(surfaceStore, messages) -> surfaceStore
renderSurface(surfaceStore, surfaceId) -> renderResult
normalizeCallback(surfaceStore, callbackInput) -> clientEvent
```

These operations are pure from the perspective of network I/O. They do not send
messages to Feishu/Lark and do not call an LLM.

Experimental dynamic data source support adds a separate runtime contract:

```text
applyDataSourceUpdate(runtime, dataSourceUpdate) -> runtime
startDataSources(runtime, surfaceId) -> disposable
```

This contract is not part of official A2UI v0.8. It belongs to
`urn:a2ui:extension:dynamic-data:v0_1` and is described in
[dynamic-data-sources.md](dynamic-data-sources.md).

## applyMessages

Input:

- A surface store.
- One A2UI v0.8 message or an ordered list of messages.

Behavior:

- `surfaceUpdate` adds or replaces component definitions by id.
- `dataModelUpdate` updates the surface data model.
- `beginRendering` records the render root, catalog id, and optional styles.
- `deleteSurface` removes the surface.

Output:

- Updated surface store.
- Validation errors or warnings when messages are invalid for this catalog.

## renderSurface

Input:

- A surface store.
- A `surfaceId`.

Output:

```ts
interface RenderResult {
  surfaceId: string;
  card: Record<string, unknown>;
  callbackBindings: CallbackBinding[];
  warnings: RenderWarning[];
}
```

Required semantics:

- The returned `card` must represent the current A2UI surface.
- Every interactive control must carry a callback envelope matching
  [callback-envelope.schema.json](../schemas/callback-envelope.schema.json).
- Rendering details such as exact spacing, markdown element choice, and column
  widths are implementation details. They must not change the user action
  semantics.
- `renderSurface` must remain deterministic for a given surface state. Dynamic
  data sources may change the surface data model over time, but the renderer
  itself should not run data source programs, timers, network calls, or platform
  update APIs.

## normalizeCallback

Input:

- A surface store.
- A normalized callback input matching
  [normalized-callback-input.schema.json](../schemas/normalized-callback-input.schema.json).

Output:

- An A2UI v0.8 client event matching `client_to_server.json`, usually a
  `userAction`.

Required semantics:

- Resolve `action.context` from the source A2UI button.
- Merge submitted form values into `userAction.context`.
- Use submitted values to update bound input paths before resolving action
  context.
- Reject callbacks whose envelope does not match the active surface/component.

## Raw Feishu/Lark Callback Extraction

Feishu/Lark raw callback extraction is intentionally separate:

```text
extractLarkCallback(rawPayload) -> normalizedCallbackInput
```

The TypeScript implementation supports the official `card.action.trigger`
wrapper shape and SDK-style unwrapped event objects. Raw payload fixtures should
only be committed after being captured from a real integration run and reviewed.

## Dynamic Data Runtime Extension

The dynamic data runtime consumes custom `dataSourceUpdate` messages and writes
their output into the normal surface data model.

Required MVP semantics:

- Accept `dataSourceUpdate.surfaceId`.
- Accept `extensionId: "urn:a2ui:extension:dynamic-data:v0_1"`.
- Accept `driver: "bash"`.
- Support interval triggers with `everyMs`.
- Run `program.script`.
- Parse stdout as JSON when `output.format` is `"json"`.
- Write the parsed value to `output.target` using JSON Pointer semantics.
- Notify the host or adapter that the surface should be re-rendered.

The runtime should not include Lark-specific behavior. It must not know about
CardKit, Lark card ids, message ids, or Card JSON.

`policy` fields such as `timeoutMs`, `maxOutputBytes`, `network`, and `writeFs`
are part of the declaration shape, but full sandbox enforcement is not required
for the first MVP. Implementations should document which policy fields are
actually enforced.

## Test Strategy

- Unit tests run semantic fixtures and must not call Feishu/Lark APIs.
- Integration tests may call Feishu/Lark APIs only when explicitly enabled by
  environment variables.
- Integration tests may log raw callback payloads for discovery, but those logs
  are diagnostic output and should not be committed as fixtures until reviewed.
