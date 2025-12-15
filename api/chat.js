export default async function handler(req, res) {
  // ✅ CORS
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

    // Validation
    const text = (message || "").toString().trim();
    if (!text) {
      return res.status(400).json({ error: "No message provided" });
    }

    if (text.length > 4000) {
      return res
        .status(413)
        .json({ error: "Message too long (max 4000 chars)." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY is missing." });
    }

    // ✅ Language command detection
    const detectExplicitLangCommand = (t = "") => {
      const s = t.toLowerCase().trim();

      if (
        s === "english" ||
        s.includes("english bolo") ||
        s.includes("in english")
      )
        return "en";

      if (
        s === "bangla" ||
        s === "বাংলা" ||
        s.includes("bangla bolo") ||
        s.includes("বাংলা বলো")
      )
        return "bn";

      return null;
    };

    // Language mode
    let langMode = "bn";
    if (Array.isArray(history)) {
      for (let i = history.length - 1; i >= 0; i--) {
        const cmd = detectExplicitLangCommand(history[i]?.content || "");
        if (cmd) {
          langMode = cmd;
          break;
        }
      }
    }

    const currentCmd = detectExplicitLangCommand(text);
    if (currentCmd) langMode = currentCmd;

    // ✅ SYSTEM PROMPT (IDENTITY + RULES)
    const systemPrompt = `
You are an AI assistant named "Quick AI".

IDENTITY:
- Your name is Quick AI.
- If asked "তোমার নাম কী?" say: "আমার নাম Quick AI"
- If asked "তোমাকে কে বানাইছে?" or "who made you?" say:
  "আমাকে তৈরি করেছেন Murad Ahmed Simanto."
- Never say you are ChatGPT.

STYLE RULES:
- Do not greet.
- Answer clearly and helpfully.
- Default response should be detailed.
- If user asks for short, keep it short.
- If user asks for details, explain step by step.

LANGUAGE RULES:
- Default language is Bangla.
- Switch to English only if explicitly requested.
- Do not auto-detect language.

CURRENT MODE: ${langMode === "en" ? "ENGLISH" : "BANGLA"}
`.trim();

    // History
    const safeHistory = Array.isArray(history)
      ? history.slice(-20).map((m) => ({
          role: m?.role === "assistant" ? "assistant" : "user",
          content: String(m?.content || "").slice(0, 4000),
        }))
      : [];

    const input = [
      { role: "system", content: systemPrompt },
      ...safeHistory,
      { role: "user", content: text },
    ];

    // ✅ OpenAI API call
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input,
        temperature: 0.4,
        max_output_tokens: 900,
      }),
    });

    const json = await r.json();

    if (!r.ok) {
      return res
        .status(500)
        .json({ error: json?.error?.message || "OpenAI API error" });
    }

    const reply =
      json.output?.[0]?.content?.[0]?.text ||
      json.output_text ||
      "কোনো উত্তর পাওয়া যায়নি। আবার চেষ্টা করো।";

    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({
      error: "Server error",
      details: String(e),
    });
  }
}
