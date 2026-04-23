---
name: delegate-plan
description: Delegate approved plan to isolated agent
trigger: When user says 'delegate this plan' or 'agent execute'
---

After a plan is approved, spawn a general-purpose agent with the plan as its prompt.
Use run_in_background: true so the planning conversation stays active.
