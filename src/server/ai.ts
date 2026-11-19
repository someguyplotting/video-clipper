import {
  createGatewayFetch,
  gatewayRefusal,
  providerBaseUrl,
  refusalFromError,
  type GatewayCallFor,
} from "@every-app/sdk/server";
import { env } from "cloudflare:workers";

const PROVIDER = "openai";
const CHAT_MODEL = "gpt-4o-mini";
const TRANSCRIBE_MODEL = "whisper-1";

/** An AI failure with a sentence the member can read. */
export class AiError extends Error {}

async function call(path: string, init: RequestInit, target?: GatewayCallFor) {
  let response: Response;
  try {
    const gatewayFetch = createGatewayFetch({ env, ...(target ? { for: target } : {}) });
    response = await gatewayFetch(`${providerBaseUrl(PROVIDER)}${path}`, init);
  } catch (error) {
    const refusal = refusalFromError(error);
    throw new AiError(refusal ? notSetUp(refusal.code, refusal.message) : "The AI service could not be reached.");
  }
  const refused = await gatewayRefusal(response);
  if (refused) throw new AiError(notSetUp(refused.code, refused.message));
  if (!response.ok) {
    throw new AiError(`The AI service answered ${response.status}. Try again in a moment.`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

function notSetUp(code: string, message: string) {
  return /not_configured|not_allowed/.test(code)
    ? "AI isn't set up yet. An admin adds an OpenAI key in the Gateway."
    : message;
}

export interface TranscribedWord {
  word: string;
  start: number;
  end: number;
}

export async function transcribe(audio: ArrayBuffer, target: GatewayCallFor) {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "audio.wav");
  form.append("model", TRANSCRIBE_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  const result = await call("/v1/audio/transcriptions", { method: "POST", body: form }, target);
  const words = Array.isArray(result.words) ? (result.words as TranscribedWord[]) : [];
  return words.filter((w) => typeof w.word === "string" && Number.isFinite(w.start) && Number.isFinite(w.end));
}

/** A chat completion that answers with one JSON object. */
export async function chatJson(
  messages: unknown[],
  target?: GatewayCallFor,
): Promise<Record<string, unknown>> {
  const result = await call(
    "/v1/chat/completions",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: CHAT_MODEL, messages, response_format: { type: "json_object" } }),
    },
    target,
  );
  const choices = result.choices as { message?: { content?: string } }[] | undefined;
  const content = choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new AiError("The AI answer couldn't be read. Try again.");
  }
}
