export async function GET() {
  return Response.json({
    ok: true,
    keys: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
      firecrawl: Boolean(process.env.FIRECRAWL_API_KEY),
    },
  });
}
