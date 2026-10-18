/**
 * Chat message helpers – prismarine-chat inspired (simplified)
 */

export type ChatComponent =
  | string
  | { text?: string; translate?: string; with?: ChatComponent[]; color?: string; bold?: boolean };

export function chatToString(msg: ChatComponent | ChatComponent[]): string {
  if (typeof msg === "string") return msg;
  if (Array.isArray(msg)) return msg.map(chatToString).join("");
  if (msg.text) return msg.text;
  if (msg.translate) {
    const args = (msg.with ?? []).map(chatToString);
    return `${msg.translate}(${args.join(", ")})`;
  }
  return "";
}

export function parseChatPacket(data: { message?: string; sourceName?: string; type?: string }) {
  return {
    username: data.sourceName ?? "",
    message: data.message ?? "",
    type: data.type ?? "chat",
  };
}
