import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "video-clipper",
  name: "Video Clipper",
  description:
    "Turns long videos into short captioned clips: AI picks the highlights, you trim, reframe, caption and export them.",
  resources: {
    d1: ["DB"],
    r2: ["media"],
    queues: [{ name: "jobs", consumer: { maxRetries: 2, maxBatchSize: 1 } }],
  },
  providers: [
    {
      id: "openai",
      why: "Transcribes audio with word timings, picks highlights and finds people in frames.",
      docs: "https://platform.openai.com/api-keys",
    },
  ],
  features: {
    ai: {
      name: "AI clipping and reframe",
      why: "Finds highlight clips in a video and keeps the speaker in frame.",
      providers: ["openai"],
    },
  },
});
