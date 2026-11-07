# ElevenLabs agent: manual setup (KeepHard)

Use this if the API key lacks `convai_write`. Two routes. Pick one.

## Route A (fastest if you own the account): fix the key, run the script

1. elevenlabs.io, sign in, click your profile (bottom-left) then **API Keys** (also under Developers).
2. Edit your key (or create a new one). Turn on **ElevenLabs Agents / Conversational AI**: set it to **Read and Write** (permission `convai_write` plus `convai_read`). Also keep Text to Speech access on.
3. Save. If a new key was created, paste it into `backend/.env` as `ELEVENLABS_API_KEY=...` (never commit or print it).
4. Run:
   ```
   cd backend && npx tsx scripts/create-agent.ts
   ```
   It prints `agent_id` and writes `ELEVENLABS_AGENT_ID` into `.env`. Done. Skip Route B.

Note: the script sets `expects_response: false` for `decide`. The handoff says blocking. If you want blocking, change it to `true` in the script first.

## Route B: build the agent by hand in the dashboard

Dashboard wording changes often. Names below match the docs as checked on 2026-11-07; if a label differs, pick the closest one.

### 1. Create the agent
1. Left sidebar: **Agents** (formerly Conversational AI), then **Create an agent** / **New agent**.
2. Choose **Blank template**. Name it `KeepHard`. Language: English.

### 2. Agent tab: first message and system prompt
Paste into **First message**:
```
Hey, I see {{product_title}} for £{{price}}. Why do you need these?
```

Paste into **System prompt**:
```
You are KeepHard, a short, punchy, supportive student money coach. The student is about to buy {{product_title}} for £{{price}} (brand {{brand}}).
Their budget rules: {{rules}}. Sport limit £{{sport_limit}}, fashion limit £{{fashion_limit}}.
Ask exactly ONE question: "Why do you need these?" (under 12 words). Then judge their answer against the budget.
Reject fashion reasons, "my friend has it" reasons, and any peer-pressure reasons. Accept sport and training reasons.
Max 2 rounds: if the first answer is rejected, say so kindly in one short line and let them try once more. On the second round, decide.
Every spoken line is under 15 words. Never lecture. Be warm, never shaming.
After each reason, call the client tool "decide" with {verdict, reasonCategory, userReasonSummary, spokenLine}. Speak the same spokenLine.
The tool result tells you what to do next. Follow it.
```

### 3. Dynamic variables
In the Agent tab find **Dynamic variables** (or the placeholders section). Add these placeholders with defaults (all strings):

| Name | Default |
|---|---|
| product_title | Nike Pegasus 41 Running Shoes |
| price | 119.99 |
| brand | Nike |
| sport_limit | 40 |
| fashion_limit | 0 |
| rules | no fashion this month |

The backend overrides them per session via `dynamicVariables`.

### 4. LLM (lowest latency)
Agent tab, **LLM** dropdown: pick the fastest Flash-class model offered. Preferred order: **Gemini 2.0 Flash** (what the script uses), then Gemini 2.5 Flash / Flash Lite, then GPT-4o mini. Avoid large or "thinking" models. Temperature 0.3. If there is a **Reasoning effort** setting, set it to lowest or off. Max tokens ~150.

### 5. Add the `decide` client tool
1. Agent tab, **Tools** section, **Add tool**.
2. **Tool type**: **Client**.
3. **Name**: `decide` (case-sensitive, must match the voice package).
4. **Description**:
   ```
   Report the verdict on the purchase reason. Call after judging each answer.
   ```
5. Turn on **Wait for response** (this is the blocking mode: the agent waits for the string the package returns).
6. Add four parameters, each **Data type: String**, **Required: on**:

| Identifier | Description |
|---|---|
| verdict | accept or reject |
| reasonCategory | sport, fashion, eating_out, groceries, tech or other |
| userReasonSummary | Short summary of the user's reason |
| spokenLine | The line you just said to the user |

Exact schema equivalent (for reference; the UI builds this from the table):
```json
{
  "type": "client",
  "name": "decide",
  "description": "Report the verdict on the purchase reason. Call after judging each answer.",
  "expects_response": true,
  "parameters": {
    "type": "object",
    "required": ["verdict", "reasonCategory", "userReasonSummary", "spokenLine"],
    "properties": {
      "verdict": { "type": "string", "description": "accept or reject" },
      "reasonCategory": { "type": "string", "description": "sport, fashion, eating_out, groceries, tech or other" },
      "userReasonSummary": { "type": "string", "description": "Short summary of the user's reason" },
      "spokenLine": { "type": "string", "description": "The line you just said to the user" }
    }
  }
}
```
If the UI offers an enum for `verdict`, use `accept`, `reject`. Otherwise leave plain strings.

### 6. Voice tab
Pick any voice (or the id in `ELEVENLABS_VOICE_ID`). Model: **Flash v2.5** (lowest TTS latency). Stability ~0.5.

### 7. Advanced / conversation settings (turn-taking)
- **Turn timeout**: ~5 s or lower (lower = snappier).
- **Turn eagerness**: **Eager** or **Normal** (Eager for the demo; fewer dead pauses).
- **Interruptions**: **on** (let the student cut in). Optional but good for a punchy feel.
- **Max conversation duration**: 120 s.
- Leave **soft timeout** off.

### 8. Security tab: allow overrides and auth
1. **Security** tab (agent settings).
2. If your backend gets a signed URL (`/api/voice/session` returns `signedUrl`): turn **Enable authentication** on. If you use the plain `agentId` with no signed URL: leave it off.
3. **Overrides**: dynamic variables work without overrides. Only if the package sends `overrides` for first message or system prompt, turn on **First message** and **System prompt** (and **LLM** if you override it). If a toggle is off the override is ignored.
4. Allowlist: add the extension origin if hosts are restricted (for a `chrome-extension://` origin, leave the allowlist empty).

### 9. Save, test, copy the id
1. Click **Publish** / **Save**.
2. **Test AI agent**: say "My friend has the same pair" (expect reject), then "I need them for track" (expect accept). Check `decide` shows in the transcript with all four fields.
3. Copy the agent id: it is in the page URL (`.../agents/agent_xxxxxxxx`) and shown near the agent name (**Copy ID**).
4. Put it in `backend/.env`:
   ```
   ELEVENLABS_AGENT_ID=agent_xxxxxxxx
   ```
5. Restart: `cd backend && npm start`, then `POST /api/voice/session` should return `signedUrl` and `agentId` instead of a 500. Note: the signed-url call itself also needs the key to have ConvAI read access (Route A step 2 only needs the read part).

## Section 2: separate "KeepHard Interviewer" agent

Create a second agent the same way (Blank template, name `KeepHard Interviewer`, same fast LLM, no dynamic variables needed).

First message:
```
Hi, I'm KeepHard. Quick money check. How much comes in this month?
```

System prompt:
```
You are KeepHard Interviewer, a short, warm student money coach.
Ask exactly 3 questions, one at a time, and wait for each answer:
1. What is your income this month?
2. What are you saving for?
3. What should you NOT spend on this month?
Every spoken line is under 15 words. No lectures. Acknowledge each answer in a few words.
After the third answer, say one short goodbye line.
Then call the client tool "save_profile" with {summary}: one or two sentences covering income, savings goal, and spending to avoid.
```

Client tool: Tools, Add tool, type **Client**, name `save_profile`, description `Save the student's money profile after the interview ends.`, **Wait for response** on, one parameter: **summary**, String, Required, description `One or two sentences: monthly income, savings goal, what not to spend on`.

```json
{
  "type": "client",
  "name": "save_profile",
  "description": "Save the student's money profile after the interview ends.",
  "expects_response": true,
  "parameters": {
    "type": "object",
    "required": ["summary"],
    "properties": {
      "summary": { "type": "string", "description": "One or two sentences: monthly income, savings goal, what not to spend on" }
    }
  }
}
```

Copy its agent id for later use (for example `ELEVENLABS_INTERVIEWER_AGENT_ID` in `.env`). Nothing reads it yet: `/api/interview` currently takes `{answers}`. This agent is not part of the demo.
