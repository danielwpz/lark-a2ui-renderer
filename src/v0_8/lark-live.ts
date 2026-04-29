import { renderSurface } from "./render.js";
import type { RenderResult, SurfaceState } from "./types.js";

export interface LarkLiveImClient {
  message: {
    create(input: {
      params: { receive_id_type: "chat_id" };
      data: { receive_id: string; msg_type: "interactive"; content: string };
    }): Promise<unknown>;
  };
}

export interface LarkLiveCardKitClient {
  create(input: { data: { type: "card_json"; data: string } }): Promise<unknown>;
  update(input: {
    path: { card_id: string };
    data: { card: { type: "card_json"; data: string }; sequence: number };
  }): Promise<unknown>;
}

export interface LarkLivePublisherOptions {
  im: LarkLiveImClient;
  cardkit: LarkLiveCardKitClient;
  chatId: string;
}

export interface LarkLivePublication {
  surfaceId: string;
  cardId: string;
  messageId?: string;
  sequence: number;
  rendered: RenderResult;
}

export class LarkLiveCardPublisher {
  private readonly publications = new Map<string, LarkLivePublication>();

  constructor(private readonly options: LarkLivePublisherOptions) {}

  async publishSurface(surface: SurfaceState): Promise<LarkLivePublication> {
    const rendered = renderSurface(surface);
    const cardCreateResponse = await this.options.cardkit.create({
      data: {
        type: "card_json",
        data: JSON.stringify(rendered.card),
      },
    });
    const cardId =
      readStringField(cardCreateResponse, ["data", "card_id"]) ??
      readStringField(cardCreateResponse, ["card_id"]);
    if (cardId == null) {
      throw new Error(`Lark CardKit create response did not contain card_id`);
    }

    const messageResponse = await this.options.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: this.options.chatId,
        msg_type: "interactive",
        content: JSON.stringify({
          type: "card",
          data: {
            card_id: cardId,
          },
        }),
      },
    });
    const messageId = readStringField(messageResponse, ["data", "message_id"]) ?? undefined;
    const publication: LarkLivePublication = {
      surfaceId: surface.surfaceId,
      cardId,
      ...(messageId === undefined ? {} : { messageId }),
      sequence: 1,
      rendered,
    };
    this.publications.set(surface.surfaceId, publication);
    return publication;
  }

  async updateSurface(surface: SurfaceState): Promise<LarkLivePublication> {
    const existing = this.publications.get(surface.surfaceId);
    if (existing == null) {
      throw new Error(`Surface '${surface.surfaceId}' has not been published`);
    }
    const rendered = renderSurface(surface);
    const sequence = existing.sequence + 1;
    await this.options.cardkit.update({
      path: {
        card_id: existing.cardId,
      },
      data: {
        card: {
          type: "card_json",
          data: JSON.stringify(rendered.card),
        },
        sequence,
      },
    });
    const updated: LarkLivePublication = {
      ...existing,
      sequence,
      rendered,
    };
    this.publications.set(surface.surfaceId, updated);
    return updated;
  }
}

function readStringField(value: unknown, path: string[]): string | null {
  let current = value;
  for (const key of path) {
    if (current == null || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.length > 0 ? current : null;
}
