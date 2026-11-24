import { InputError } from "../vecibot-auth.server";

export interface VecibotAIConfig {
  provider: string;
}

export const AI_UNAVAILABLE_MESSAGE =
  "El servidor está conectado, pero VeciBot no tiene un servicio de IA habilitado. Puedes usar la voz del navegador, adjuntar archivos y extraer texto localmente. No se generó una respuesta de IA.";

/** No provider is registered. Never infer a service from environment credentials. */
export function getVecibotAIConfig(): VecibotAIConfig {
  throw new InputError(503, AI_UNAVAILABLE_MESSAGE);
}

/** Public capability information only; never return credentials or project data. */
export function vecibotStatus() {
  return Response.json(
    { server: "connected", aiConfigured: false, message: AI_UNAVAILABLE_MESSAGE },
    { headers: { "Cache-Control": "no-store" } },
  );
}
