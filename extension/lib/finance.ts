import { browser } from 'wxt/browser';
import { reactive, toRaw } from 'vue';
import type { CategoryBudget, Choice, DashboardForecast, EvaluationResult, FinanceProvider, FinanceState, PurchaseDetails, UserProfile } from './contracts';
export const DEMO_DATE = '2026-11-07';
export const money = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
export function demoState(): FinanceState {
  return {
    profile: {name:'Alex',balance:1240,income:2200,incomeDate:'2026-11-28',
      expenses:[{title:'Rent',amount:650,date:'2026-11-12'},{title:'Bills & subscriptions',amount:95,date:'2026-11-16'},{title:'Travel pass',amount:75,date:'2026-11-21'}],
      goal:{id:'home',title:'A flight home',target:800,saved:480,targetDate:'2026-12-20'},
      priorities:'Clothing and takeaways',rules:[{id:'alcohol',text:'No alcohol this month.',category:'alcohol',enabled:true},{id:'pause',text:'Pause before spending £50 or more.',category:'all',enabled:true}],
      impulseHabits:'Late-night browsing and limited-time offers',tone:'Warm, a little playful'},
    categories:[{category:'groceries',label:'Groceries',budget:250,spent:142},{category:'clothing',label:'Clothing',budget:120,spent:75},{category:'electronics',label:'Little extras',budget:100,spent:32},{category:'alcohol',label:'Alcohol',budget:0,spent:0}],
    responses:[],reminders:[],redirected:0,onboarded:false,
  };
}
export interface Persistence { read(): Promise<FinanceState | undefined>; write(state: FinanceState): Promise<void> }
const clone = <T>(v:T):T => JSON.parse(JSON.stringify(v));
export class MockFinanceProvider implements FinanceProvider {
  state = reactive<FinanceState>(demoState());
  private serial = 0;
  private writes: Promise<void> = Promise.resolve();
  constructor(private persistence?: Persistence) {}
  async load() {
    const saved = await this.persistence?.read();
    if(saved && saved.profile && Array.isArray(saved.responses) && saved.profile.goal) Object.assign(this.state,saved);
    return this.state;
  }
  private persist() {
    const snapshot = clone(toRaw(this.state));
    this.writes = this.writes.catch(()=>{}).then(()=>this.persistence?.write(snapshot));
    return this.writes;
  }
  forecast(): DashboardForecast {
    let balance=this.state.profile.balance;
    const points=[{date:DEMO_DATE,balance,label:'Today'}];
    const expenses=[...this.state.profile.expenses].sort((a,b)=>a.date.localeCompare(b.date));
    for(const e of expenses) if(e.date >= DEMO_DATE && e.date < this.state.profile.incomeDate) {balance-=e.amount;points.push({date:e.date,balance,label:e.title});}
    const lowest=Math.min(...points.map(p=>p.balance));
    points.push({date:this.state.profile.incomeDate,balance:balance+this.state.profile.income,label:'Income'});
    return {points,lowest,fixedExpenses:expenses.reduce((s,e)=>s+e.amount,0),nextIncomeDate:this.state.profile.incomeDate};
  }
  async evaluate(item: PurchaseDetails): Promise<EvaluationResult> {
    if(!Number.isFinite(item.price)||item.price<=0||item.price>100000) throw new Error('Enter a purchase amount between £0.01 and £100,000.');
    const p=this.state.profile, forecast=this.forecast();
    const rule=p.rules.find(r=>r.enabled&&r.category===item.category) ?? (item.price>=50?p.rules.find(r=>r.enabled&&r.category==='all'):undefined) ?? null;
    const outcome=rule?.category===item.category||forecast.lowest-item.price<100?'red':item.price>=50?'amber':'green';
    return {id:`evaluation-${Date.now()}-${++this.serial}`,outcome,item:clone(item),rule,lowestBefore:forecast.lowest,lowestAfter:forecast.lowest-item.price,
      goalPercent:Math.round(item.price/p.goal.target*100),
      title:outcome==='green'?'Fits your plan':outcome==='amber'?'A little pause?':'A promise to yourself.',
      message:outcome==='green'?'A little something, with room for your bigger plans.':`You told me you wanted to save for ${p.goal.title.toLowerCase()}. Your call, always.`,
      reflection:'Will you still want this tomorrow? What would saving it make possible?'};
  }
  async respond(e: EvaluationResult, choice: Choice) {
    if(this.state.responses.some(r=>r.evaluation.id===e.id)) return;
    this.state.responses.unshift({evaluation:clone(e),choice,at:new Date().toISOString()});
    if(choice==='continue') {
      this.state.profile.balance=Math.round((this.state.profile.balance-e.item.price)*100)/100;
      const c=this.state.categories.find(c=>c.category===e.item.category); if(c)c.spent=Math.round((c.spent+e.item.price)*100)/100;
    } else if(choice==='save') {
      const amount=Math.min(e.item.price, Math.max(0,this.state.profile.goal.target-this.state.profile.goal.saved));
      this.state.profile.goal.saved=Math.round((this.state.profile.goal.saved+amount)*100)/100;
      this.state.profile.balance=Math.round((this.state.profile.balance-amount)*100)/100;
      this.state.redirected=Math.round((this.state.redirected+amount)*100)/100;
    } else this.state.reminders.push({title:e.item.title,due:new Date(Date.now()+86400000).toISOString(),mock:true});
    await this.persist();
  }
  async updateProfile(profile: UserProfile) {Object.assign(this.state,{profile:clone(profile),onboarded:true});await this.persist();}
  async toggleRule(id: string) {const rule=this.state.profile.rules.find(r=>r.id===id);if(rule)rule.enabled=!rule.enabled;await this.persist();}
  async reset() {Object.assign(this.state,demoState());await this.persist();}
}
export const storage: Persistence = {
  async read() {const result=await browser.storage.local.get('pocket-v1');return result['pocket-v1'] as FinanceState|undefined;},
  async write(state) {await browser.storage.local.set({'pocket-v1':state});},
};
export const scenarios: Record<string,PurchaseDetails> = {
  green:{id:'notebook',title:'Everyday notebook',price:4,currency:'GBP',category:'stationery'},
  amber:{id:'trainers',title:'Weekend trainers',price:60,currency:'GBP',category:'clothing'},
  red:{id:'wine',title:'Friday wine selection',price:28,currency:'GBP',category:'alcohol'},
};
