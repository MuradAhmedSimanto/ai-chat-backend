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

    // Keep it sane
    if (text.length > 4000) {
      return res
        .status(413)
        .json({ error: "Message too long (max 4000 chars)." });
    }

    // ✅ Quick fixed replies for better human-like chat (NO OpenAI call)
    const t = text.toLowerCase().trim();

    const isGreeting =
      /^(hi|hello|hey|assalamualaikum|as-salamu alaykum|salam|আসসালামু আলাইকুম|সালাম|হাই|হ্যালো)\b/.test(
        t
      ) ||
      ["hi", "hello", "hey", "হাই", "হ্যালো", "সালাম", "আসসালামু আলাইকুম"].includes(
        text.trim()
      );

    const isHowAreYou =
      /(kemon aso|kemon acho|kemon aco|kmn aso|kmn acho|how are you|what's up|ki khobor|কি খবর|কেমন আছো|কেমন আছেন|কেমন আছিস)/.test(
        t
      );

    const isAskName =
      /(tomar name ki|tumar name ki|your name|name ki|নাম কী|তোমার নাম কী|আপনার নাম কী)/.test(
        t
      );

    const isAskMaker =
      /(ke banaise|ke banayse|toke ke banaise|tomake ke banaise|who made you|who created you|creator|ডেভেলপার কে|কে বানাইছে|কে বানিয়েছে|তোমাকে কে বানাইছে)/.test(
        t
      );

    const isThanks =
      /(thanks|thank you|ধন্যবাদ|থ্যাংকস|অনেক ধন্যবাদ|tnx)/.test(t);

    const isBye =
      /^(bye|goodbye|see you|বিদায়|আল্লাহ হাফেজ|আবার দেখা হবে)\b/.test(t);

    const isHelp =
      /(ki korte paro|কি করতে পারো|help|sahajjo|সাহায্য|তুমি কী পারো|capabilities|kisu bolo)/.test(
        t
      );

    if (isGreeting) {
      return res.status(200).json({
        reply:
          "হ্যালো। আমি Everest Ai. পড়াশোনা, লেখা, হিসাব বা যেকোনো প্রশ্নে সাহায্য করতে পারি।",
      });
    }

    if (isHowAreYou) {
      return res.status(200).json({
        reply:
          "আমি ভালো আছি। তোমার কী অবস্থা? তুমি কী নিয়ে কথা বলতে চাও—বললে আমি সাহায্য করবো।",
      });
    }

    if (isAskName) {
      return res.status(200).json({
        reply: "আমার নাম Everest Ai😊আপনি চাইলে আমি নিজের সম্পর্কে বলতে পারি এবং আপনার সব ধরনের প্রশ্নের উত্তর দিতে পারি। আমি কোডিং, পড়াশোনা, মজার বিষয়—প্রায় সবকিছুর সাহায্য করতে পারি।

"আপনি বলুন, আপনি কোন ধরনের সাহায্য চাইছেন?
",
      });
    }

    if (isAskMaker) {
      return res.status(200).json({
        reply:
          "আমাকে তৈরি করেছে Murad Ahmed Simanto মানুষের দৈনন্দিন কাজ, শিক্ষা, সৃজনশীলতা আর গবেষণায় সাহায্য করার জন্য। মানুষ যেন সহজে তথ্য পায়, শেখে, আর দ্রুত সমস্যার সমাধান করতে পারে।",
      });
    }

    if (isThanks) {
      return res.status(200).json({
        reply:
          "স্বাগতম 😊 তুমি চাইলে আরেকটা প্রশ্ন করো—আমি সাহায্য করছি।",
      });
    }

    if (isBye) {
      return res.status(200).json({
        reply: "বিদায়! আবার কথা হবে 😊",
      });
    }

    if (isHelp) {
      return res.status(200).json({
        reply:
          "আমি পড়াশোনা/এক্সাম নোট, লেখালেখি (CV, ইমেইল, আবেদন), হিসাব-নিকাশ, টেক সাপোর্ট, অনুবাদ, এবং পরিকল্পনা—এগুলাতে বিস্তারিতভাবে সাহায্য করতে পারি। তুমি কোনটা নিয়ে শুরু করতে চাও?",
      });
    }

    // Require API key
    if (!process.env.OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY is missing in Vercel env." });
    }

    // ✅ Decide language mode:
    const detectExplicitLangCommand = (tt = "") => {
      const s = tt.toLowerCase().trim();

      // English commands
      if (
        s === "english" ||
        s.includes("english bolo") ||
        s.includes("english e") ||
        s.includes("english dao") ||
        s.includes("in english") ||
        s.includes("english please")
      )
        return "en";

      // Bangla commands
      if (
        s === "bangla" ||
        s === "বাংলা" ||
        s.includes("bangla bolo") ||
        s.includes("bangla te") ||
        s.includes("বাংলায়") ||
        s.includes("বাংলা বলো")
      )
        return "bn";

      return null;
    };

    // Figure out current language mode from history
    let langMode = "bn"; // default
    if (Array.isArray(history) && history.length) {
      for (let i = history.length - 1; i >= 0; i--) {
        const h = history[i];
        const content = (h && h.content ? String(h.content) : "").trim();
        const cmd = detectExplicitLangCommand(content);
        if (cmd) {
          langMode = cmd;
          break;
        }
      }
    }

    // Override with current message command if any
    const currentCmd = detectExplicitLangCommand(text);
    if (currentCmd) langMode = currentCmd;

    // ✅ System instruction (upgraded: more friendly + detailed by default)
    const systemPrompt = `
You are an AI assistant named "Quick AI".

IDENTITY:
- Your name is Quick AI.
- If asked "তোমার নাম কী?" say: "আমার নাম Quick AI."
- If asked "তোমাকে কে বানাইছে?" / "who made you?" say:
  "আমাকে তৈরি করেছেন Murad Ahmed Simanto."
- Never say you are ChatGPT.

STYLE:
- Do not start with greetings unless the user greeted first.
- Be warm, natural, and helpful.
- Default: give clear, detailed answers with practical steps.
- If the user asks for "short/সংক্ষেপে", provide a short version.
- If user asks for "details/long/বিস্তারিত", expand further.
- When appropriate, include 2–4 bullet points to keep it readable.

LANGUAGE MODE:
- Default language is Bangla (bn).
- Only switch to English if the user explicitly says: "english", "in english", etc.
- Only switch back to Bangla if the user explicitly says: "bangla", "বাংলা", etc.
- Do NOT auto-detect language. Follow the mode.

CURRENT MODE: ${langMode === "en" ? "ENGLISH" : "BANGLA"}
`.trim();

    // ✅ Build messages for Responses API
    const safeHistory = Array.isArray(history)
      ? history
          .slice(-20)
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
        temperature: 0.4,
        max_output_tokens: 900,
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
    return res
      .status(500)
      .json({ error: "Server error", details: String(e) });
  }
}
