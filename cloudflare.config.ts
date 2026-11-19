import { defineConfig } from "cf/config";
import { everyAppWorker, type EveryAppWorkerManifest } from "@every-app/sdk/cloudflare";
import * as entrypoint from "./src/entry.worker.ts" with { type: "cf-worker" };
import config from "./everyapp.config.ts";

// The SDK types a feature as its secrets and settings alone, so one listing
// only providers needs this cast.
const manifest = config as Omit<typeof config, "features"> & Pick<EveryAppWorkerManifest, "features">;

// The Worker is built from everyapp.config.ts: its bindings, its identity
// keys, its name. Nothing the Worker imports may be imported here: in dev the
// Cloudflare Vite plugin hides this file's imports from the Worker.
export default defineConfig((ctx) => ({
  worker: everyAppWorker({ manifest, entrypoint, ctx }),
}));
