// A local stand-in for the Gateway's AI proxy, so the suites can exercise
// transcription, highlight picking and subject detection without a real key.
const source = `
const script = "So the biggest lesson from our first year was that nobody buys a feature. They buy a better afternoon. We stopped writing release notes and started recording two minute walkthroughs. Signups doubled in a month. The second lesson is about hiring. Hire the person who asks the most questions in the interview. Every great teammate we have did exactly that. And finally, talk to five customers every week, no matter how busy you are.";
let flaky = 0;
const words = script.split(" ").map((word, i) => ({ word, start: +(i * 0.5).toFixed(2), end: +(i * 0.5 + 0.4).toFixed(2) }));
const reply = (content) => Response.json({ choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }] });
export default { async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/audio/transcriptions")) {
    const offsetWords = words.filter((w) => w.end <= 40);
    return Response.json({ text: script, duration: 40, words: offsetWords });
  }
  if (url.pathname.endsWith("/chat/completions")) {
    const body = await request.text();
    if (body.includes("image_url")) return reply({ positions: [{ x: 0.3, y: 0.5 }, { x: 0.35, y: 0.5 }, { x: 0.4, y: 0.45 }, { x: 0.42, y: 0.45 }] });
    if (body.includes("weekly habits") && flaky++ === 0) return Response.json({ error: { message: "upstream overloaded" } }, { status: 502 });
    if (body.includes("hiring advice")) return reply({ clips: [
      { title: "Hire the curious ones", start: 30, end: 41.5, score: 88, reason: "Clear, quotable hiring rule." },
      { title: "Talk to five customers", start: 54, end: 66, score: 74, reason: "Actionable habit." } ] });
    return reply({ clips: [
      { title: "Nobody buys a feature", start: 1, end: 12.5, score: 93, reason: "Strong opening hook with a memorable line." },
      { title: "Walkthroughs doubled signups", start: 12.5, end: 24, score: 81, reason: "Concrete result people can copy." },
      { title: "Too long for the band", start: 0, end: 39, score: 99, reason: "Exceeds the length band." },
      { title: "Outside the range", start: 70, end: 80, score: 95, reason: "Past the scanned range." } ] });
  }
  return Response.json({ error: "not found" }, { status: 404 });
} };`;
export const fakeGatewayWorker = { config: { name: "fake-gateway", compatibilityDate: "2025-01-01",
  manifest: { mainModule: "fake.mjs", modules: { "fake.mjs": { type: "esm", contents: source } } } } };
export const withFakeAi = { bindings: { EVERY_APP_GATEWAY: { type: "worker", worker: "fake-gateway" } }, workers: [fakeGatewayWorker] };
