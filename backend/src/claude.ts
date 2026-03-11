import Groq from "groq-sdk";
import { GoogleGenerativeAI, FunctionCallingMode } from "@google/generative-ai";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `You are Jarvis, a personal AI assistant. You are smart, concise, and helpful.
You speak in short, natural sentences — like a real assistant, not a chatbot.
You have tools to search the web and get the current time.
Always be direct. Never say "Certainly!" or "Of course!". Just do the task.
The user talks to you by voice, so keep responses conversational and brief unless detail is needed.`;

// ── Rate Limiter ────────────────────────────────────────────
const GROQ_RPM_LIMIT = 25;
const GROQ_RPD_LIMIT = 10000;
const QUEUE_MAX_WAIT_MS = 10000;
const AI_TIMEOUT_MS = 15000;

const rateLimiter = {
  minuteRequests: [] as number[],
  dayRequests: [] as number[],

  canRequest(): boolean {
    const now = Date.now();
    this.minuteRequests = this.minuteRequests.filter((t) => now - t < 60000);
    this.dayRequests = this.dayRequests.filter((t) => now - t < 86400000);
    return (
      this.minuteRequests.length < GROQ_RPM_LIMIT &&
      this.dayRequests.length < GROQ_RPD_LIMIT
    );
  },

  record(): void {
    const now = Date.now();
    this.minuteRequests.push(now);
    this.dayRequests.push(now);
  },

  msUntilAvailable(): number {
    if (this.dayRequests.length >= GROQ_RPD_LIMIT) return Infinity;
    if (this.minuteRequests.length >= GROQ_RPM_LIMIT) {
      const oldest = this.minuteRequests[0];
      return 60000 - (Date.now() - oldest) + 50; // small buffer
    }
    return 0;
  },
};

// ── Gemini Usage Logger ─────────────────────────────────────
export function logGeminiUsage(reason: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] | GEMINI_USED | reason=${reason}`);
}

// ── Timeout helper ──────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// ── Sleep helper ────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Groq Tool Format ─────────────────────────────────────────
function toGroqTools(tools: any[]) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

// ── Gemini Tool Format ───────────────────────────────────────
function toGeminiTools(tools: any[]) {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      })),
    },
  ];
}

function toGeminiHistory(history: { role: string; content: string }[]) {
  return history.map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.content }],
  }));
}

// ── Main Export ──────────────────────────────────────────────
export async function claude(
  userMessage: string,
  history: { role: string; content: string }[],
  tools: any[],
  executeTool: (name: string, input: any) => Promise<any>
): Promise<{ reply: string; ai: string; timeMs: number }> {
  const start = Date.now();

  // Try Groq with smart queue
  const groqResult = await tryGroqWithQueue(userMessage, history, tools, executeTool);
  if (groqResult !== null) {
    return { reply: groqResult, ai: "Groq", timeMs: Date.now() - start };
  }

  // Fallback to Gemini
  logGeminiUsage("groq_failed_or_rate_limited");
  console.log("🟡 Falling back to Gemini...");
  try {
    const reply = await withTimeout(
      runGemini(userMessage, history, tools, executeTool),
      AI_TIMEOUT_MS,
      "Gemini"
    );
    return { reply, ai: "Gemini", timeMs: Date.now() - start };
  } catch (geminiErr: any) {
    console.error("❌ Gemini also failed:", geminiErr.message);
    throw new Error("Something went wrong, try again");
  }
}

// ── Smart Queue: Try Groq with wait + retry ─────────────────
async function tryGroqWithQueue(
  userMessage: string,
  history: { role: string; content: string }[],
  tools: any[],
  executeTool: (name: string, input: any) => Promise<any>
): Promise<string | null> {
  const waitMs = rateLimiter.msUntilAvailable();

  // If wait exceeds queue max, skip to Gemini
  if (waitMs > QUEUE_MAX_WAIT_MS) {
    console.log(`⏳ Groq rate limited, wait ${waitMs}ms exceeds queue max. Skipping to Gemini.`);
    return null;
  }

  // Wait if needed
  if (waitMs > 0) {
    console.log(`⏳ Groq rate limited, queuing for ${waitMs}ms...`);
    await sleep(waitMs);
  }

  // Check again after wait
  if (!rateLimiter.canRequest()) {
    console.log("⏳ Groq still rate limited after queue wait. Skipping to Gemini.");
    return null;
  }

  rateLimiter.record();

  try {
    console.log("🟢 Trying Groq...");
    return await withTimeout(
      runGroq(userMessage, history, tools, executeTool),
      AI_TIMEOUT_MS,
      "Groq"
    );
  } catch (err: any) {
    console.warn("⚠️ Groq failed:", err.message);

    // If rate limit error from API, wait 60s if within queue budget
    if (err.status === 429 || err.message?.includes("rate_limit")) {
      console.log("⏳ Groq 429 — will fallback to Gemini.");
    }
    return null;
  }
}

// ── Groq Agentic Loop ────────────────────────────────────────
async function runGroq(
  userMessage: string,
  history: { role: string; content: string }[],
  tools: any[],
  executeTool: (name: string, input: any) => Promise<any>
): Promise<string> {
  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage },
  ];

  while (true) {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      tools: toGroqTools(tools),
      tool_choice: { string: "auto" },
      max_tokens: 1024,
    });

    const msg = response.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return msg.content || "";
    }

    for (const toolCall of msg.tool_calls) {
      const name = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments || "{}");
      console.log(`🔧 Groq using tool: ${name}`, args);

      let result: any;
      try {
        result = await executeTool(name, args);
      } catch (err: any) {
        result = { error: err.message };
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }
}

// ── Gemini Agentic Loop ──────────────────────────────────────
async function runGemini(
  userMessage: string,
  history: { role: string; content: string }[],
  tools: any[],
  executeTool: (name: string, input: any) => Promise<any>
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: SYSTEM_PROMPT,
    tools: toGeminiTools(tools),
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
  });

  const chat = model.startChat({ history: toGeminiHistory(history) });
  let currentMessage: any = userMessage;

  while (true) {
    const result = await chat.sendMessage(currentMessage);
    const response = result.response;
    const functionCalls = response.functionCalls();

    if (!functionCalls || functionCalls.length === 0) {
      return response.text();
    }

    const functionResults = await Promise.all(
      functionCalls.map(async (call) => {
        console.log(`🔧 Gemini using tool: ${call.name}`, call.args);
        try {
          const result = await executeTool(call.name, call.args);
          return { functionResponse: { name: call.name, response: { result } } };
        } catch (err: any) {
          return { functionResponse: { name: call.name, response: { error: err.message } } };
        }
      })
    );

    currentMessage = functionResults;
  }
}
