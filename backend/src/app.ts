import { Hono } from "hono";
import { cors } from "hono/cors";
import { claude } from "./claude";
import { tools, executeTool } from "./tools";

const app = new Hono();

// ── CORS: allow all origins (mobile app has no browser origin) ──
app.use("/*", cors({ origin: "*" }));

// ── Security Headers ─────────────────────────────────────────────
app.use("/*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
});

// Health check
app.get("/", (c) => c.json({ status: "Jarvis backend running" }));

// ── Main chat endpoint ───────────────────────────────────────────
app.post("/chat", async (c) => {
  const body = await c.req.json();
  const { message, history = [] } = body;

  if (!message || typeof message !== "string") {
    return c.json({ error: "No message provided" }, 400);
  }
  if (message.length > 500) {
    return c.json({ error: "Message too long (max 500 characters)" }, 400);
  }
  if (!Array.isArray(history) || history.length > 20) {
    return c.json({ error: "History must be an array with max 20 items" }, 400);
  }

  try {
    const { reply, ai, timeMs } = await claude(message, history, tools, executeTool);

    const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
    console.log(`[${ts}] | msg_len=${message.length} | ai=${ai} | time=${timeMs}ms`);

    return c.json({ reply });
  } catch (err: any) {
    console.error("Chat error:", err.message);
    return c.json({ error: err.message }, 500);
  }
});

export default app;
