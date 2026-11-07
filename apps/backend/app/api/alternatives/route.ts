import { z } from 'zod';
import { findAlternative, type AlternativesResponse } from '../../../lib/alternatives';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Only the item title and unit price are accepted. Nothing about the user's money ever reaches here. */
const Body = z.object({
  item: z.string().trim().min(1).max(300),
  price: z.number().positive().max(100000),
});

/** POST /api/alternatives { item, price } → same model, cheaper, from a UK seller. */
export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'expected { item: string, price: number }' }, { status: 400 });

  const { item, price } = parsed.data;
  const started = Date.now();
  const { reason, ...result } = await findAlternative(item, price);
  // Log only item/price and the outcome.
  console.info(
    `[alternatives] item=${JSON.stringify(item)} price=${price} source=${result.source}` +
      `${reason ? ` reason=${JSON.stringify(reason)}` : ''} ms=${Date.now() - started}`,
  );
  return Response.json(result satisfies AlternativesResponse);
}
