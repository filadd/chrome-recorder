// Delivery flow (stand-in for n8n's Notion-poll flow): for each Transcription a reviewer
// marked `speakers_assigned`, rebuild the named transcript, fold it into the pitch's
// living context via ai-conversations, upsert the Context row, and mark the Transcription
// `delivered`. The living context is the durable outcome the whole pipeline feeds.
//
// A delivery failure leaves the row at `speakers_assigned` (not `failed`, which means a
// transcription error) so the next run retries it.

import { generateContext } from "./ai-conversations-client";
import {
  buildNamedTranscript,
  getContext,
  getPitchContent,
  queryByState,
  setTranscriptionState,
  TRANSCRIPTION_STATE,
  upsertContext,
} from "./notion-client";

export interface DeliveredTranscription {
  transcriptionId: string;
  pitchId: string | null;
  status: "delivered" | "skipped" | "failed";
  error?: string;
}

const DEFAULT_LIMIT = 5;

const deliverOne = async (
  transcriptionId: string,
  pitchId: string | null,
): Promise<DeliveredTranscription> => {
  if (pitchId == null) {
    return { transcriptionId, pitchId, status: "skipped", error: "transcription has no pitch relation" };
  }

  const transcript = await buildNamedTranscript(transcriptionId);
  const currentContext = (await getContext(pitchId))?.text ?? "";
  const pitchContent = await getPitchContent(pitchId).catch(() => "");

  const updated = await generateContext({ pitchContent, currentContext, transcript });

  await upsertContext({
    pitchId,
    title: `Context — ${pitchId.slice(0, 8)}`,
    text: updated,
    updatedIso: new Date().toISOString(),
  });

  await setTranscriptionState(transcriptionId, TRANSCRIPTION_STATE.delivered);

  return { transcriptionId, pitchId, status: "delivered" };
};

export const runDelivery = async (limit = DEFAULT_LIMIT): Promise<DeliveredTranscription[]> => {
  const assigned = (await queryByState(TRANSCRIPTION_STATE.speakersAssigned)).slice(0, limit);
  const delivered: DeliveredTranscription[] = [];

  for (const row of assigned) {
    try {
      delivered.push(await deliverOne(row.id, row.pitchId));
    } catch (error) {
      delivered.push({ transcriptionId: row.id, pitchId: row.pitchId, status: "failed", error: String(error) });
    }
  }

  return delivered;
};
