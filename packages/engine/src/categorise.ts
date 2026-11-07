import type { Category } from './types';

/** Keyword list first (instant, offline). The backend LLM is only a backup for 'other'. */
const KEYWORDS: Record<Exclude<Category, 'other'>, RegExp> = {
  alcohol:
    /\b(wine|merlot|malbec|rioja|prosecco|champagne|cava|beer|lager|ale|cider|vodka|gin|rum|whisky|whiskey|tequila|bourbon|brandy|liqueur|spirits?|sauvignon|chardonnay|pinot|ros[eé])\b/i,
  takeaway:
    /\b(deliveroo|just ?eat|uber ?eats|takeaway|take-away|pizza|burger|kebab|sushi|nando'?s|domino'?s|mcdonald'?s|kfc|meal deal|fried chicken)\b/i,
  clothing:
    /\b(trainers?|sneakers?|shoes?|boots?|air max|jordans?|hoodie|t-?shirt|tee|jeans|joggers?|jacket|coat|dress|skirt|shirt|jumper|sweater|leggings|socks|shorts|tracksuit|clothing|apparel)\b/i,
};

const ORDER: Exclude<Category, 'other'>[] = ['alcohol', 'takeaway', 'clothing'];

export function categorise(title: string): Category {
  for (const c of ORDER) if (KEYWORDS[c].test(title)) return c;
  return 'other';
}
