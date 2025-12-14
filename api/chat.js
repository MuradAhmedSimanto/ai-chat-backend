export default async function handler(req, res) {
  // ✅ CORS (সব response-এ)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { message, history = [] } = req.body || {};

    // Basic validation
    const text = (message || "").toString().trim();
    if (!text) return res.status(400).json({ error: "No message provided" });

    // Keep it sane (you can raise if needed)
    if (text.length > 4000) {
      return res.status(413).json({ error: "Message too long (max 4000 chars)." });
    }

    // Require API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is missing in Vercel env." });
    }

    // ✅ Decide language mode:
    // Default Bangla
    // Switch only if user explicitly says "english" or "bangla"
    // If history exists, keep last chosen mode based on explicit commands
    const detectExplicitLangCommand = (t = "") => {
      const s = t.toLowerCase().trim();
      // English commands
      if (
        s === "english" ||
        s.includes("english bolo") ||
        s.includes("english e") ||
        s.includes("english dao") ||
        s.includes("in english") ||
        s.includes("english please")
      ) return "en";

      // Bangla commands
      if (
        s === "bangla" ||
        s === "বাংলা" ||
        s.includes("bangla bolo") ||
        s.includes("bangla te") ||
        s.includes("বাংলায়") ||
        s.includes("বাংলা বলো")
      ) return "bn";

      return null;
    };

    // Figure out current language mode from history (if provided)
    let langMode = "bn"; // default
    if (Array.isArray(history) && history.length) {
      // scan from end for last explicit language command
      for (let i = history.length - 1; i >= 0; i--) {
        const h = history[i];
        const content = (h && h.content ? String(h.content) : "").trim();
        const cmd = detectExplicitLangCommand(content);
        if (cmd) { langMode = cmd; break; }
      }
    }

    // Override with current message command if any
    const currentCmd = detectExplicitLangCommand(text);
    if (currentCmd) langMode = currentCmd;

    // ✅ System instruction (strong + direct)
    // Note: We enforce default Bangla + only explicit switching
    const systemPrompt = `
You are a fast, direct AI assistant.

CORE RULES:
- Do not greet. Do not say "How can I help?".
- Answer immediately and clearly.
- Keep answers short unless the user asks for long.
- If user asks for "short", give a short version.
- If user asks for "long" or "details", expand.

LANGUAGE MODE (VERY IMPORTANT):
- Default language is Bangla (bn).
- Only switch to English if the user explicitly says: "english", "english bolo", "in english", etc.
- Only switch back to Bangla if the user explicitly says: "bangla", "bangla bolo", "বাংলা", etc.
- Do NOT auto-detect language. Follow the mode.

CURRENT MODE: ${langMode === "en" ? "ENGLISH" : "BANGLA"}
`.trim();

    // ✅ Build messages for Responses API
    // We accept optional "history" (array of {role, content}) from frontend.
    // To stay compatible with your current frontend (no history), it still works.
    const safeHistory = Array.isArray(history)
      ? history
          .slice(-20) // limit history to last 20 turns
          .map((m) => ({
            role: m?.role === "assistant" ? "assistant" : "user",
            content: String(m?.content || "").slice(0, 4000),
          }))
      : [];

    const input = [
      { role: "system", content: systemPrompt },
      ...safeHistory,
      { role: "user", content: text },
    ];

    // ✅ Call OpenAI Responses API
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input,
        // Tuning (strong + consistent)
        temperature: 0.4,
        max_output_tokens: 500,
      }),
    });

    const json = await r.json();

    // If OpenAI returns an error, surface message
    if (!r.ok) {
      const msg = json?.error?.message || "OpenAI API error";
      return res.status(500).json({ error: msg });
    }

    const reply =
      json.output?.[0]?.content?.[0]?.text ||
      json.output_text ||
      "কোনো উত্তর পাওয়া যায়নি। আবার চেষ্টা করো।";

    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e) });
  }
}
