# Nexus Manual Mode — Usage Conservation Toolkit
## For Bryan (and Alex) — Effective Immediately

---

## The Problem, Honestly

You're hitting weekly limits on Tuesday because of a combination of factors:

1. **Two people, one account.** Bryan and Alex both use the same Claude allocation.
2. **No session goals.** Conversations start with "hey can you help with..." and evolve organically. Sometimes that's great. Often it means 90 minutes on something that needed 20.
3. **Rabbit holes.** Both of you go deep — Bryan into engineering architecture, Alex into comprehensive guides. Neither is wrong, but depth costs tokens.
4. **Cold starts.** Re-explaining context every conversation. Your context.md helps but doesn't eliminate this.
5. **No drift detection.** Nobody — not you, not Claude — is asking "are we still on track?" mid-conversation.
6. **Wrong model for the job.** Using Opus-tier thinking for Haiku-tier tasks.

This toolkit addresses all six. Use it starting Thursday.

---

## 1. Account Separation (Biggest Single Impact)

**Alex needs her own Claude Pro account.** $20/month. This alone might solve 40-50% of the usage pressure. Her audiobook guides, Coral Gables work, Clean Right Now tasks — all valid, all consuming from your shared pool.

If $20/month is a concern, compare it to the cost of Bryan hitting his limit mid-week and being unable to work on CLX, VaultKeeper, or Cold-Link tasks that have actual business value.

**If you keep sharing:** At minimum, communicate about usage. "I need Tuesday for a big CLX session" means Alex doesn't burn through allocation on Monday night.

---

## 2. Session Planning (Paste This BEFORE Your First Message)

Copy this template. Fill it in. Paste it as your first message in every conversation. Takes 60 seconds. Saves 30-60 minutes of drift.

```
## SESSION PLAN
**Goal:** [One sentence. What am I trying to accomplish?]
**Deliverable:** [What do I walk away with? A file? A decision? A plan?]
**Scope:** [What is IN scope for this session]
**Out of scope:** [What am I NOT doing today, even if it comes up]
**Time budget:** [How many exchanges should this take? 5? 10? 20?]
**Model note:** [Is this a Haiku task, Sonnet task, or Opus task?]

## CONTEXT
[Paste relevant project context here — NOT your entire context.md, 
just the section that matters for THIS session's goal]

## GUARDRAILS FOR CLAUDE
- If I start drifting from the stated goal, flag it immediately
- If a tangent would take more than 2 exchanges to explore, ask me if I want to defer it to a separate session
- If the deliverable is ready, say so — don't keep elaborating unless I ask
- Track our exchange count against the time budget
- If I say "actually, let's also..." — remind me of the original scope and ask if I want to swap or defer
```

**Why this works:** You're giving Claude explicit permission and instructions to push back on drift. Right now, Claude's default behavior is to follow wherever you go — enthusiastically. This changes the dynamic. Claude becomes an accountability partner, not just a yes-machine.

---

## 3. Anti-Drift System Prompt (For Claude Projects)

If you're using a Claude Project for CLX, put this in the project's system instructions:

```
## SESSION MANAGEMENT

You are working with Bryan, a Senior Integrations Engineer. He is thoughtful 
and thorough, which means he sometimes goes deep into tangents that aren't 
the current priority. Your job is to help him stay focused AND be genuinely 
useful — not just compliant.

RULES:
1. If Bryan hasn't stated a session goal, ask for one before diving in.
2. If the conversation drifts from the stated goal, say: 
   "Flagging: we've moved from [original goal] into [current tangent]. 
   Want to defer this to a separate session, or is this now the priority?"
3. After completing the stated deliverable, say so clearly. Don't pad.
4. If a question could be answered in 3 sentences, don't write 15.
5. Prefer concrete output (code, configs, decisions) over exploratory discussion.
6. If Bryan asks for something Haiku could handle, mention it.
7. Never apologize for being direct about scope. Bryan wants this.

COST AWARENESS:
- Every response costs tokens. Be efficient without being terse.
- If Bryan asks for a comparison of 5 options, ask: "Do you want a quick 
  recommendation, or a full analysis of all 5?" — the answer determines 
  whether this is a 200-token or 2000-token response.
- Batch related questions into single responses rather than spreading 
  across multiple exchanges.
```

---

## 4. Model Selection Guide

Tape this to your monitor (or pin it somewhere visible):

```
┌─────────────────────────────────────────────────────────┐
│                 WHICH CLAUDE DO I NEED?                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  HAIKU — The quick answer machine                       │
│  ✓ Reformatting text, JSON, markdown                    │
│  ✓ Simple code generation with clear specs              │
│  ✓ Summarizing documents                                │
│  ✓ Data conversion (CSV→SQL, JSON→YAML, etc.)           │
│  ✓ Writing emails, messages, short content              │
│  ✓ Explaining a concept you mostly understand           │
│  ✓ Auto-generating chat titles                          │
│  ✓ Prompt enhancement (rewriting your input)            │
│                                                         │
│  SONNET — The daily driver                              │
│  ✓ Code writing that requires judgment calls            │
│  ✓ Debugging with context                               │
│  ✓ System design (CLX middleware, API architecture)     │
│  ✓ Document creation (reports, proposals, plans)        │
│  ✓ Analysis that requires connecting multiple facts     │
│  ✓ Most of your CLX and VaultKeeper work                │
│  ✓ Coral Gables operations, menus, event planning       │
│                                                         │
│  OPUS — The architect (use sparingly)                   │
│  ✓ Multi-system architecture decisions                  │
│  ✓ Complex debugging across multiple codebases          │
│  ✓ Nuanced analysis with competing tradeoffs            │
│  ✓ "I need you to think deeply about this" tasks        │
│  ✓ Novel problem-solving (things you haven't seen)      │
│  ✗ NOT for: code gen, formatting, simple Q&A            │
│                                                         │
│  RULE OF THUMB: Start with Sonnet.                      │
│  Drop to Haiku if it's simple.                          │
│  Escalate to Opus only if Sonnet isn't cutting it.      │
└─────────────────────────────────────────────────────────┘
```

**On claude.ai specifically:** You can't choose models with Pro (it auto-selects). But you CAN influence consumption by keeping responses focused and concise — which is what the session planning and guardrails do. Shorter, more targeted conversations = fewer messages burned in the 5-hour window.

---

## 5. Prompt Structure Template

Before hitting Enter, run your prompt through this mental checklist:

```
1. WHAT: What do I want? (Be specific)
2. FORMAT: What should the output look like? (Code? List? Decision? File?)
3. CONSTRAINTS: What are the boundaries? (Language, framework, existing patterns)
4. CONTEXT: What does Claude need to know? (NOT everything — just what's relevant)
5. DONE: How do I know it's done? (What does "finished" look like?)
```

**Example — Bad prompt (leads to 5+ rounds of clarification):**
> "I need help with the CLX API authentication"

**Example — Good prompt (gets it in 1-2 rounds):**
> "Write a JWT validation middleware for the CLX Express API. It should:
> - Validate tokens from the `Authorization: Bearer` header
> - Check expiration and issuer claims
> - Attach decoded payload to `req.user`
> - Return 401 with JSON error for invalid/missing tokens
> - Use the `jsonwebtoken` npm package
> - TypeScript, following the existing CLX middleware patterns
> Give me the middleware file and a test file."

The second prompt might take you 60 seconds longer to write. It saves 10 minutes and 5 exchanges of back-and-forth.

---

## 6. Session Debrief (Capture What Matters)

At the end of every working session, ask Claude:

```
"Summarize this session in the following format:

DECISIONS MADE:
- [what we decided and why]

DISCOVERIES:
- [what we learned that we didn't know before]

TASKS COMPLETED:
- [what got done]

TASKS REMAINING:
- [what's still open]

CONTEXT FOR NEXT SESSION:
- [what the next person (or future me) needs to know to pick up where we left off]
"
```

**Then paste that output into your context.md / project notes.**

This is the manual version of Nexus's progress tracking. It takes 30 seconds to ask for, and it means your next session doesn't start from zero.

---

## 7. The "Actually Let's Also..." Trap

This is the single biggest usage killer. The conversation is going well, the deliverable is almost done, and then:

> "Actually, while we're at it, can we also..."
> "Oh that reminds me, what about..."
> "One more thing — can you also..."

Each of these restarts the meter. A focused 10-exchange session becomes a sprawling 40-exchange session.

**The fix:** Keep a PARKING LOT. When a tangent comes up:

```
## PARKING LOT (for future sessions)
- [ ] Look into BGP failover scenarios
- [ ] Alex's linen tracking system needs X
- [ ] Research Koerber API pagination behavior
- [ ] VaultKeeper price history data source
```

Write it down. Close the session. Start a new, focused session for the new topic. This is cheaper than continuing because long conversations compound context — Claude is processing MORE tokens with every message in a long thread.

---

## 8. Context File Structure (Replace Your Current Approach)

Your current context.md is probably a big block of information about what CLX is. Replace it with a structured, living document:

```markdown
# CLX Project Context
## Last Updated: [date]

## CURRENT STATE
- What's working: [brief]
- What's in progress: [brief]
- What's blocked: [brief]

## ACTIVE DECISIONS
- [Decision]: [rationale] — Revisit if [trigger]

## RECENT DISCOVERIES
- [Finding]: [impact]

## CONSTRAINTS (always true)
- SQL Server is the source of truth
- Must not interfere with Koerber WMS
- [etc.]

## PARKING LOT
- [ ] Items deferred from recent sessions

## FOR CLAUDE
When I paste this context, I am NOT asking you to address everything here.
I'm giving you background so you understand my situation. Wait for my 
actual question, which will follow this context block.
```

**Key difference:** This isn't a reference document — it's a working document that changes after every session. The debrief output (Section 6) feeds directly into this.

---

## 9. The Conservation Math

Here's roughly how each practice maps to savings:

| Practice | Estimated Savings | Why |
|----------|------------------|-----|
| Alex gets own account | 40-50% of total usage | Eliminates shared consumption entirely |
| Session planning | 20-30% per session | Kills drift before it starts |
| Anti-drift guardrails | 15-25% per session | Catches drift mid-conversation |
| Better prompt structure | 10-20% per session | Reduces clarification rounds |
| Model selection | Variable (cost, not messages) | API savings if/when using API |
| Session debrief → context | 10-15% on NEXT session | Faster cold starts |
| Parking lot discipline | 15-20% per session | Prevents session sprawl |

These compound. A focused, well-planned, guardrailed session with good prompts might be 50-60% more efficient than the current pattern.

---

## 10. Quick Reference Card

Print this or keep it open in a tab:

```
BEFORE EVERY SESSION:
  □ What is my ONE goal?
  □ What is my deliverable?
  □ What is OUT of scope?
  □ Did I paste the session plan template?
  □ Am I using the right model?

DURING THE SESSION:
  □ Am I still working toward the stated goal?
  □ Did something come up? → Parking lot, not "actually let's also..."
  □ Is the deliverable done? → Stop. Don't elaborate.

AFTER THE SESSION:
  □ Ask for session debrief summary
  □ Update context.md with decisions, discoveries, remaining tasks
  □ Move parking lot items to a task list

SHARING THE ACCOUNT:
  □ Communicate with Alex about heavy usage days
  □ Budget: Bryan gets [X] days, Alex gets [Y] days
  □ Or: Alex gets her own $20/month Pro account
```

---

## How This Becomes Nexus

Everything in this document is a manual version of a Nexus feature:

| Manual Practice | Nexus Automation |
|----------------|-----------------|
| Session plan template | Pre-flight advisor (auto-scopes before sending) |
| Anti-drift guardrails | Context-aware system prompt injection |
| Model selection guide | Routing advisor (auto-recommends model) |
| Prompt structure | Enhancement engine (Haiku rewrites your prompt) |
| Session debrief | Auto-generated progress log |
| Context.md | Living project context model |
| Parking lot | Task management system |
| Conservation math | Unified budget tracking HUD |

When we build Nexus, we're not inventing new practices — we're automating the ones you've already validated manually. That means Nexus will be designed around patterns you actually use, not patterns that sounded good in a design doc.

**Start manual. Validate what works. Automate what sticks.**
