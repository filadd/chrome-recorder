// Fire-and-forget bridge from the upload API to the Finalize lambda. Finalize
// does slow LLM + Notion work (≈120 s) that must not block the request, so in
// production we async-invoke it (InvocationType "Event") and return 202. Locally
// there is no Lambda to invoke, so we run it inline.

import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

import { handler as finalizeInline, type FinalizeEvent } from "./finalize";

const client = new LambdaClient({ region: process.env.AWS_REGION });

export const invokeFinalize = async (event: FinalizeEvent): Promise<void> => {
  const functionName = process.env.FINALIZE_FUNCTION_NAME;

  if (functionName == null || functionName === "") {
    await finalizeInline(event);
    return;
  }

  await client.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify(event)),
    }),
  );
};
