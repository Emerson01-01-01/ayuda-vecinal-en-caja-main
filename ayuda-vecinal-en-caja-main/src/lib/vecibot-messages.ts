import { z } from "zod";

export const messageAttachmentSchema = z.object({
  filename: z.string().max(180), mediaType: z.string().max(100),
  size: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const storedMessageSchema = z.object({
  format: z.literal("vecibot-message-v1"), text: z.string(), attachments: z.array(messageAttachmentSchema).max(5),
});
export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;
export const messageReceiptSchema = z.object({
  id: z.string().uuid(), text: z.string(), attachments: z.array(messageAttachmentSchema).max(5),
  received: z.literal(true), ai: z.object({ available: z.boolean(), message: z.string() }),
});
export type MessageReceipt = z.infer<typeof messageReceiptSchema>;

export function storedMessageContent(text: string, attachments: MessageAttachment[]) {
  return JSON.stringify({ format: "vecibot-message-v1", text, attachments });
}

/** Old plain-text history remains readable. No HTML or file bytes are stored here. */
export function readStoredMessage(content: string) {
  try {
    const parsed = storedMessageSchema.safeParse(JSON.parse(content));
    if (parsed.success) return { text: parsed.data.text, attachments: parsed.data.attachments };
  } catch { /* Legacy text. */ }
  return { text: content, attachments: [] as MessageAttachment[] };
}
