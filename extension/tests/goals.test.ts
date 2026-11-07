import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
vi.mock('wxt/browser', () => ({ browser: { storage: { local: { get: vi.fn(async () => ({})), set: vi.fn() } } } }));
import Dashboard from '../components/Dashboard.vue';
import { goalsState, applyGoals, addGoal, goalDot } from '../keephard/goalsStore';
import { nextTick } from 'vue';

describe('add goal', () => {
  it('has the button and renders appended goals as chips with a dot', async () => {
    applyGoals([]);
    const w = mount(Dashboard);
    expect(w.find('[data-ag-button]').text()).toBe('+ Add a new goal');
    applyGoals([{ id: 'a', label: 'Spain trip', amount: 300, by: '2027-08-31', emoji: 'x', createdAt: 'n' }]);
    await nextTick();
    expect(w.findAll('[data-goal-chip]')).toHaveLength(1);
    expect(w.get('[data-goal-chip]').text()).toContain('£300');
    expect(w.find('[data-goal-chip] .gdot.green').exists()).toBe(true);
    w.unmount(); applyGoals([]);
  });
  it('appends via the backend result and never replaces', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: 'n1', label: 'Laptop', amount: 500, by: '2027-03-01', createdAt: 't' }), { status: 200 })) as any;
    applyGoals([{ id: 'a', label: 'A', amount: 1, by: '2027-01-01', createdAt: 't' }]);
    await addGoal({ text: 'laptop 500 by march' }, f);
    expect(goalsState.goals.map(g => g.id)).toEqual(['a', 'n1']);
    applyGoals([]);
  });
  it('dot colours', () => {
    const now = new Date('2026-11-07');
    expect(goalDot(131, { amount: 300, by: '2027-08-31' }, now)).toBe('green');
    expect(goalDot(131, { amount: 5000, by: '2027-01-31' }, now)).toBe('red');
  });
});
