import type { ModelMessage, UIMessage, UIMessageStreamOnEndCallback } from "ai";
import type { VecibotAIConfig } from "./config.server";
import { AI_UNAVAILABLE_MESSAGE } from "./config.server";
import { InputError } from "../vecibot-auth.server";

/** Preserve the chat contract without an external provider or substitute answers. */
export function createResponsesCall(_request: Request, _config: VecibotAIConfig, _messages: ModelMessage[], _instructions = "") {
  return {
    result: {
      toUIMessageStreamResponse(_options: {
        originalMessages: UIMessage[];
        sendReasoning?: boolean;
        onFinish: UIMessageStreamOnEndCallback<UIMessage>;
        onError: (error: unknown) => string;
      }): Response {
        throw new InputError(503, AI_UNAVAILABLE_MESSAGE);
      },
    },
  };
}
