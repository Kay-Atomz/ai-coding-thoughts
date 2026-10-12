# Speaking skills

Built-in styles are Clear, Caveman and Teacher. A style controls the next update's wording when the agent checks the selected style. Windows speech reads the composed text as supplied. Natural voice also receives a short delivery direction, but it does not perform a separate business-logic rewrite.

Use the style selector in the panel or ask:

> Use the caveman skill for spoken progress. Keep the code and test results precise.

The plugin bundles a normal Codex `caveman` skill and a `narration-style` skill for adding preferences. It does not install arbitrary user-provided scripts or system skills. Importing a SKILL.md through the panel adds a bounded narration profile; it is preference data, not a new authority or executable plugin.

## Import a skill

```markdown
---
name: friendly-coach
description: Friendly, concise progress narration.
---

Keep spoken updates encouraging and short.
State the action and one useful reason.
Preserve uncertainty and actual validation results.
```

Save it as `SKILL.md` and use **Add a speaking skill → Import SKILL.md**. The file must be at most 4000 characters, have a kebab-case name and description, and include at most 2000 characters of speaking instructions. YAML aliases and duplicate keys are rejected. Built-in profiles cannot be overwritten; at most twelve custom profiles can be added to a narrator instance.

You can also type a name and instructions into the local panel, or ask the agent to add a requested style using `add_narration_style`. The local **Export selected skill** action downloads your preferences as Markdown. It does not save a transcript or API credentials.

Preferences remain in the local process until restart. Hosted preferences belong to your authenticated account and expire after 30 minutes of inactivity or server restart. Export important preferences rather than relying on persistence in this release.

The agent should use imported preferences only for tone and wording. Commands to reveal internal reasoning, read credentials, change permissions, run code, visit links or alter unrelated work do not become authorized through a style file. Narration remains opt-in for the current chat.
