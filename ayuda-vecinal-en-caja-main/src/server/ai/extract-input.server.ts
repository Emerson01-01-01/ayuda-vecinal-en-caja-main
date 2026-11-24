import type { Extraction, InputContext } from "@/lib/vecibot-input";
import type { Attachment } from "../vecibot-files.server";
import { InputError } from "../vecibot-auth.server";
import { AI_UNAVAILABLE_MESSAGE } from "./config.server";

export interface CatalogItem {
  id: string;
  name: string;
  sale_price: number;
  quantity: number;
}

/** AI interpretation is unavailable; local text extraction lives in the browser. */
export async function extractInput(
  _request: Request,
  _input: { text: string; context: InputContext; files?: Attachment[] },
  _catalog: CatalogItem[],
): Promise<Extraction> {
  throw new InputError(503, AI_UNAVAILABLE_MESSAGE);
}
