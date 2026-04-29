import { renderSurface } from "./render.js";
export class LarkLiveCardPublisher {
    options;
    publications = new Map();
    constructor(options) {
        this.options = options;
    }
    async publishSurface(surface) {
        const rendered = renderSurface(surface);
        const cardCreateResponse = await this.options.cardkit.create({
            data: {
                type: "card_json",
                data: JSON.stringify(rendered.card),
            },
        });
        const cardId = readStringField(cardCreateResponse, ["data", "card_id"]) ??
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
        const publication = {
            surfaceId: surface.surfaceId,
            cardId,
            ...(messageId === undefined ? {} : { messageId }),
            sequence: 1,
            rendered,
        };
        this.publications.set(surface.surfaceId, publication);
        return publication;
    }
    async updateSurface(surface) {
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
        const updated = {
            ...existing,
            sequence,
            rendered,
        };
        this.publications.set(surface.surfaceId, updated);
        return updated;
    }
}
function readStringField(value, path) {
    let current = value;
    for (const key of path) {
        if (current == null || typeof current !== "object" || Array.isArray(current)) {
            return null;
        }
        current = current[key];
    }
    return typeof current === "string" && current.length > 0 ? current : null;
}
