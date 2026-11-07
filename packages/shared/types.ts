// SINGLE SOURCE OF TRUTH. Change only as a team (3 people). Backend base URL: http://localhost:8787

export type Category = 'sport' | 'fashion' | 'eating_out' | 'groceries' | 'tech' | 'other';

export interface Profile {
  name: string;
  monthlyBudget: number;              // £
  categories: Record<Category, { limit: number; rule: string }>; // rule = user's own words
  goal: { label: string; amount: number; saved: number; by: string };
  savedByKeepHard: number;            // £ cumulative, shown on dashboard
  tone: 'supportive';
}

export interface Product {
  title: string; brand: string; price: number; currency: 'GBP';
  url: string; site: 'amazon.co.uk' | 'amazon.com'; imageUrl?: string;
}

// ---- Voice (owner: you / Claude A+B) ----
export type AvatarState = 'peek' | 'idle' | 'listening' | 'talking' | 'happy' | 'disappointed';

export interface Verdict {
  verdict: 'accept' | 'reject';
  reasonCategory: Category;           // what the user's reason was judged to be
  userReasonSummary: string;          // "friend has the same pair"
  spokenLine: string;                 // what the avatar says (already spoken by the agent)
}

// ---- Search (owner: third teammate) ----
export interface SearchRequest { product: Product }
export interface SearchResult {
  found: boolean;
  alternative?: { title: string; brand: string; price: number; url: string; retailer: string; sameModel: boolean };
  savings: number;                    // £, original - alternative
  spokenLine: string;                 // "Same Nike Pegasus, £20 cheaper at ..."
  cached: boolean;
}

// ---- Dashboard (owner: frontend) ----
export interface SavingsEntry { at: string; label: string; amount: number }
