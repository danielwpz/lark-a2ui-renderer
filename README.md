# lark-a2ui-renderer

`lark-a2ui-renderer` is an experimental renderer for turning a constrained
[A2UI](https://a2ui.org/) v0.8 surface into Feishu/Lark Card JSON 2.0.

The goal is to make chat-card UI portable: an LLM or host application can
produce A2UI messages, and this library compiles them into a Lark interactive
card while preserving a stable callback contract back to A2UI `userAction`
events.

For the upstream protocol and specification, see the official A2UI site:
<https://a2ui.org/>. This project implements a Lark-oriented subset and a few
experimental extensions; it is not an official A2UI renderer.

## What It Does

- Validates a Lark-oriented subset of A2UI v0.8.
- Maintains A2UI surface state and data model updates.
- Renders supported components into Feishu/Lark Card JSON.
- Embeds callback envelopes in interactive controls.
- Converts Lark `card.action.trigger` callbacks into normalized A2UI
  `userAction` events.

The library does not send messages, call LLMs, store application state, or make
business decisions. Those responsibilities stay with the host application.

## Current Scope

- A2UI protocol: v0.8, following the stable protocol published at
  <https://a2ui.org/>.
- Target platform: Feishu/Lark interactive cards.
- Catalog id: `urn:a2ui:catalog:lark-card:v0_8`.
- Implementation language: TypeScript.

The supported catalog is intentionally smaller than the full A2UI standard
catalog. It focuses on components that map cleanly into an IM card surface:
text, layout, buttons, forms, text input, choices, and date input.

The repository also documents an experimental dynamic data source extension for
live surfaces such as a pixel clock. That extension is not official A2UI v0.8.
It is tracked separately in
[docs/dynamic-data-sources.md](docs/dynamic-data-sources.md).

## Basic Usage

```ts
import { SurfaceStore, renderSurface, normalizeCallback } from "lark-a2ui-renderer/v0_8";

const store = new SurfaceStore();
store.applyMessages(a2uiMessages);

const rendered = renderSurface(store.getSurface("request_form"));
// Host app sends rendered.card through Feishu/Lark OpenAPI.

const userAction = normalizeCallback(store.getSurface("request_form"), normalizedCallbackInput);
// Host app routes userAction to application logic or an LLM.
```

## Project Status

This is still an experimental package. The core renderer, callback normalizer,
semantic fixtures, LLM generation tests, and real Lark card-send matrix are in
place. The repository also includes a distributable agent skill for authoring
and validating this A2UI subset.

The catalog and platform mapping may change as more real callback and rendering
behavior is verified.

Development notes, integration setup, and agent-specific operating guidance live
in [AGENTS.md](AGENTS.md).

## License

MIT
