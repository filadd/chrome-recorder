import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

// One consolidated secret keeps cold-start fetches to a single round-trip and the
// IAM grant to one ARN. Credentials live here, never in the Lambda's env vars.
export interface PipelineSecret {
  deepgramApiKey: string;
  callbackToken: string;
  llmApiKey: string;
  notionApiKey: string;
}

// Secrets live in the Lambda's own region — not S3_REGION (the bucket may be elsewhere).
const client = new SecretsManagerClient({ region: process.env.AWS_REGION });

let cached: Promise<PipelineSecret> | null = null;

const load = async (): Promise<PipelineSecret> => {
  const secretId = process.env.PIPELINE_SECRET_ARN;

  if (secretId == null || secretId === "") {
    throw new Error("PIPELINE_SECRET_ARN is not configured");
  }

  const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

  if (result.SecretString == null) {
    throw new Error("Pipeline secret has no SecretString");
  }

  return JSON.parse(result.SecretString) as PipelineSecret;
};

// Memoized across warm invocations; a rejected fetch isn't cached so the next
// invocation retries instead of replaying the failure.
export const getPipelineSecret = (): Promise<PipelineSecret> => {
  cached ??= load().catch((error) => {
    cached = null;
    throw error;
  });

  return cached;
};
