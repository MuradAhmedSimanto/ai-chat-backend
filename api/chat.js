export default async function handler(req, res) {
  // ✅ CORS for ALL responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: "No message provided" });

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: message,
      }),
    });

    const json = await r.json();

    const reply =
      json.output?.[0]?.content?.[0]?.text ||
      json.output_text ||
      json.error?.message ||   // ✅ if OpenAI returns an error, show it
      "No reply";

    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e) });
  }
}
