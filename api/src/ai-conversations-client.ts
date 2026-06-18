// The Delivery flow's context generation: ai-conversations runs a configured prompt
// (current living context + named transcript → updated context) as a one-shot
// conversation. Three calls — create conversation, add the user message, generate the
// assistant reply — mirroring what n8n's HTTP nodes will do.

export class AiConversationsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConversationsUnavailableError";
  }
}

const baseUrl = (): string => {
  const url = process.env.AI_CONVERSATIONS_API_URL;

  if (url == null || url === "") {
    throw new Error("AI_CONVERSATIONS_API_URL is not configured");
  }

  return url.replace(/\/$/, "");
};

const promptId = (): string => {
  const value = process.env.AI_CONVERSATIONS_PROMPT_ID;

  if (value == null || value === "") {
    throw new Error("AI_CONVERSATIONS_PROMPT_ID is not configured");
  }

  return value;
};

const request = async (path: string, body: unknown): Promise<any> => {
  let res: Response;

  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.AI_CONVERSATIONS_API_KEY != null
          ? { "X-Api-Key": process.env.AI_CONVERSATIONS_API_KEY }
          : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new AiConversationsUnavailableError(`ai-conversations unreachable: ${error}`);
  }

  if (!res.ok) {
    throw new AiConversationsUnavailableError(
      `ai-conversations POST ${path} returned ${res.status}: ${await res.text()}`,
    );
  }

  return res.json();
};

// The configured prompt owns the merge logic; the stand-in hands it the pitch content
// (background), the current living context, and the named transcript in the user
// message, and returns the reply verbatim.
export const generateContext = async (input: {
  pitchContent: string;
  currentContext: string;
  transcript: string;
}): Promise<string> => {
  const userId = process.env.AI_CONVERSATIONS_USER_ID;

  const conversation = await request("/api/conversation/", {
    prompt_id: promptId(),
    ...(userId != null ? { user_id: Number(userId) } : {}),
  });

  const content = [
    ...(input.pitchContent.trim() !== "" ? ["## Pitch", input.pitchContent, ""] : []),
    "## Contexto actual",
    input.currentContext.trim() === "" ? "(ninguno aún)" : input.currentContext,
    "",
    "## Transcripción de la conversación nueva",
    input.transcript,
  ].join("\n");

  await request("/api/message/", {
    conversation_id: conversation.id,
    role: "user",
    content,
  });

  const assistant = await request(`/api/conversation/${conversation.id}/assistant_message/`, {});

  return assistant.content ?? "";
};
