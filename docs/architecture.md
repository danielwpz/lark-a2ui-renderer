# Architecture

This renderer is a server-side A2UI v0.8 renderer for Feishu/Lark interactive
cards. It is different from the React/Lit renderers because there is no browser
runtime that can keep local widget state and repaint synchronously. The library
compiles A2UI state into card JSON, and the host application decides when to send
or update the card.

The stable protocol baseline is A2UI v0.8. Dynamic data sources, live updates,
and pixel-grid rendering are experimental renderer extensions. They must be
documented and implemented as extensions, not as official A2UI v0.8 features.

## A2UI v0.8 Message Model

The library consumes the stable v0.8 server-to-client message types:

- `surfaceUpdate`: add or replace component definitions for a surface.
- `dataModelUpdate`: update values used by `path` bindings.
- `beginRendering`: select the root component and catalog for rendering.
- `deleteSurface`: remove a surface from renderer state.

v0.8 components use the nested shape:

```json
{
  "id": "title",
  "component": {
    "Text": {
      "text": {
        "literalString": "Hello"
      }
    }
  }
}
```

This is intentionally not the v0.9 shape (`"component": "Text"`).

## Library Modules

The package follows the official React renderer's versioned layout. Protocol
specific code lives under `src/v0_8`; the root `src/index.ts` only re-exports the
current default version for compatibility. A future v0.9 implementation should
be added as `src/v0_9` with its own entry point rather than sharing v0.8 files.

Inside each protocol version, the package should split into pure modules:

- `catalog`: exports the v0.8 catalog id and JSON schema.
- `surface`: applies A2UI v0.8 messages and stores surface state.
- `render`: compiles a surface into Feishu/Lark Card JSON.
- `callback`: parses Feishu/Lark callbacks into A2UI `userAction` events.
- `datasource`: optional experimental runtime support for dynamic data source
  declarations. This layer is protocol/channel neutral and updates the A2UI
  data model; it does not know about Lark.

Transport adapters can live outside the core package. A host app may use the
official Lark SDK, a webhook framework, or any other delivery mechanism.

## Render Pipeline

1. Validate the incoming A2UI message against v0.8 plus this catalog.
2. Apply the message to the in-memory surface store.
3. Resolve `beginRendering.root` into a component tree by id.
4. Resolve `literal*` values and `path` bindings against the data model.
5. Compile each supported component into Card JSON 2.0 nodes.
6. Return a render result:

```ts
interface RenderResult {
  surfaceId: string;
  card: Record<string, unknown>;
  callbacks: CallbackBinding[];
  warnings: RenderWarning[];
}
```

The library should return data, not perform network I/O.

## Dynamic Runtime Extension

Dynamic data sources are described in
[dynamic-data-sources.md](dynamic-data-sources.md). They add a custom extension
message, `dataSourceUpdate`, on top of A2UI v0.8.

The intended layering is:

```text
A2UI v0.8 surface state
  official surfaceUpdate/dataModelUpdate/beginRendering/deleteSurface

Dynamic data extension
  dataSourceUpdate -> runtime driver -> dataModel mutation

Renderer
  current surface state -> channel render output

Channel adapter
  rendered output -> platform create/update APIs
```

This means a component should normally bind to data with `{ "path": "..." }`.
The path reads the current data model. It is not a function and should not know
where the data came from.

The first dynamic data MVP should implement only the `bash` driver with an
interval trigger. Other drivers such as HTTP, WebSocket, file watch, MCP, or
event emitters are future extensions.

## Lark Live Update Adapter

Lark live updates are channel-specific. They are not part of the dynamic data
extension itself.

The Lark adapter can use this loop:

```text
renderSurface(surface)
  -> CardKit card.create
  -> im.message.create with card_id
  -> on dataModel changed:
       renderSurface(surface)
       CardKit card.update with incrementing sequence
```

CardKit card ids, Lark message ids, update sequences, and Card JSON 2.0 details
belong to the Lark adapter. They should not leak into channel-neutral A2UI
messages or data source declarations.

## Host Responsibilities

The host application is responsible for:

- Persisting the mapping from application session to A2UI `surfaceId`.
- Persisting the mapping from Lark `message_id` or `card_id` to `surfaceId`.
- Calling Lark APIs to create or update interactive messages.
- Enforcing application-specific authorization.
- Routing normalized `userAction` events to deterministic handlers or to an LLM.
- Starting and stopping optional dynamic data runtimes when the host chooses to
  support the experimental extension.

## First Implementation Target

The first runnable experiment should support:

- Text-only status cards.
- Confirm/cancel button cards.
- Form cards with text input and choice input.

Everything else should be additive after this closed loop works.
