// Provider-agnostic chat call over the OpenAI-compatible `/chat/completions`
// shape — the concrete provider/model is env-configured (LLM_BASE_URL, LLM_MODEL)
// so swapping providers never touches this code.
export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export const chat = async (apiKey: string, messages: ChatMessage[]): Promise<string> => {
  const baseUrl = process.env.LLM_BASE_URL;
  const model = process.env.LLM_MODEL;

  if (baseUrl == null || baseUrl === "" || model == null || model === "") {
    throw new Error("LLM_BASE_URL / LLM_MODEL are not configured");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0.2 }),
  });

  if (!response.ok) {
    throw new Error(`LLM call failed: ${response.status} ${await response.text()}`);
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  return json.choices?.[0]?.message?.content ?? "";
};

// Parses a JSON object out of an LLM reply, tolerating ```json fences or prose
// around it. Throws if no object is found so the caller can fail (and retry).
export const parseJsonReply = <T>(reply: string): T => {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced != null ? fenced[1] : reply;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("LLM reply did not contain a JSON object");
  }

  return JSON.parse(candidate.slice(start, end + 1)) as T;
};
