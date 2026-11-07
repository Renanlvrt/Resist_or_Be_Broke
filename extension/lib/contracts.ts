export type Outcome = 'green' | 'amber' | 'red';
export type Choice = 'continue' | 'save' | 'remind';
export interface SavingsGoal { id: string; title: string; target: number; saved: number; targetDate: string }
export interface SpendingRule { id: string; text: string; category: string; enabled: boolean }
export interface Expense { title: string; amount: number; date: string }
export interface UserProfile {
  name: string; balance: number; income: number; incomeDate: string; expenses: Expense[];
  goal: SavingsGoal; priorities: string; rules: SpendingRule[]; impulseHabits: string; tone: string;
}
export interface PurchaseDetails { id: string; title: string; price: number; currency: 'GBP'; category: string }
export interface InterventionMessage { title: string; message: string; reflection: string }
export interface EvaluationResult extends InterventionMessage {
  id: string; outcome: Outcome; item: PurchaseDetails; rule: SpendingRule | null;
  lowestBefore: number; lowestAfter: number; goalPercent: number;
}
export interface ForecastPoint { date: string; balance: number; label: string }
export interface DashboardForecast { points: ForecastPoint[]; lowest: number; fixedExpenses: number; nextIncomeDate: string }
export interface UserResponse { evaluation: EvaluationResult; choice: Choice; at: string }
export interface CategoryBudget { category: string; label: string; budget: number; spent: number }
export interface FinanceState {
  profile: UserProfile; categories: CategoryBudget[]; responses: UserResponse[];
  reminders: { title: string; due: string; mock: true }[]; redirected: number; onboarded: boolean;
}
export interface FinanceProvider {
  readonly state: FinanceState;
  toggleRule(id: string): Promise<void>;
  load(): Promise<FinanceState>; evaluate(item: PurchaseDetails): Promise<EvaluationResult>;
  respond(result: EvaluationResult, choice: Choice): Promise<void>;
  updateProfile(profile: UserProfile): Promise<void>; reset(): Promise<void>; forecast(): DashboardForecast;
}
export type MascotAction = 'IDLE'|'PEEK'|'EXCLAIM'|'SUSPICIOUS'|'DISAPPROVE'|'THINKING'|'HAPPY'|'GUARD'|'DISMISS'|'RETURN'|'OPEN_DASHBOARD'|'CLOSE_DASHBOARD';
export type MascotEvent = { type: MascotAction } | { type: 'PURCHASE_EVALUATED'; result: EvaluationResult };
