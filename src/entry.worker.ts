import tanstackEntry from "@tanstack/react-start/server-entry";
import { everyApp } from "@every-app/sdk/server";
import { runClipJob, type ClipJob } from "./server/jobs";

// everyApp() verifies the identity the Gateway sent before any request reaches
// the app (a request from anywhere else is a 401).
const app = everyApp<Env>(async (request) => tanstackEntry.fetch(request));

export default {
  fetch: app.fetch,
  // Clipping runs here, off the request: transcription and highlight picking.
  async queue(batch: MessageBatch<ClipJob>, env: Env) {
    for (const message of batch.messages) {
      await runClipJob(message.body, env.EVERY_APP_ORG_ID);
      message.ack();
    }
  },
};
