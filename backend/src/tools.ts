// ============================================================
// TOOL DEFINITIONS — Gemini sees these to decide what to call
// ============================================================
export const tools = [
  {
    name: "search_web",
    description: "Search the internet for any information, news, facts, or current events",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_current_time",
    description: "Get the current date and time",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];

// ============================================================
// TOOL EXECUTORS — actual logic for each tool
// ============================================================
export async function executeTool(name: string, input: any): Promise<any> {
  switch (name) {
    case "search_web":
      return searchWeb(input.query);

    case "get_current_time":
      return {
        datetime: new Date().toISOString(),
        readable: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Google Custom Search ─────────────────────────────────────
async function searchWeb(query: string) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;

  if (!apiKey || !cx) throw new Error("GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_CX not set");

  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=5`;
  const res = await fetch(url);
  const data: any = await res.json();

  if (!data.items) return { query, results: [], message: "No results found" };

  const results = data.items.map((item: any) => ({
    title: item.title,
    url: item.link,
    snippet: item.snippet,
  }));

  return { query, results };
}
