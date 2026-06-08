import { handle } from "hono/aws-lambda";

import { app } from "./app";

// Lambda entry: the same Hono app, behind a Function URL. AWS credentials come
// from the execution role; presign + control-plane S3 calls use them directly.
export const handler = handle(app);
