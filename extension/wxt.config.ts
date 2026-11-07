import { defineConfig } from 'wxt';
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Pocket — a little pause, a bigger plan',
    description: 'Your own rules. A friendly little nudge. Frontend-only hackathon demo with Bloub.',
    permissions: ['storage'],
    icons: { 16: 'icon-16.png', 48: 'icon-48.png', 128: 'icon-128.png' },
    action: { default_title: 'Pocket settings and developer lab' },
  },
});
