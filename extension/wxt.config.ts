import { defineConfig } from 'wxt';
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Pocket — a little pause, a bigger plan',
    description: 'Your own rules. A friendly little nudge. Frontend-only hackathon demo with Bloub.',
    permissions: ['storage'],
    // KeepHard voice: backend (via background proxy) + ElevenLabs live agent.
    host_permissions: ['http://localhost:8787/*', 'http://127.0.0.1:8787/*', 'https://api.elevenlabs.io/*', 'wss://api.elevenlabs.io/*'],
    icons: { 16: 'icon-16.png', 48: 'icon-48.png', 128: 'icon-128.png' },
    action: { default_title: 'Pocket settings and developer lab' },
  },
});
