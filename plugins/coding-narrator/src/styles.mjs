import { parseDocument } from 'yaml';

const profiles = [
  { id: 'clear', name: 'Clear', instructions: 'Use clear, concise everyday language. State the action and its purpose in one or two sentences.', voiceDirection: 'Warm, calm, conversational delivery.' },
  { id: 'caveman', name: 'Caveman', instructions: 'Use playful caveman wording with short simple sentences. Example: "Me found bug. Me fix login. Then run tests." Preserve exact technical facts and uncertainty. Never claim work passed before verification.', voiceDirection: 'Playful, friendly, slightly earthy delivery; avoid shouting.' },
  { id: 'teacher', name: 'Teacher', instructions: 'Explain the action and one useful reason in simple language. Use a patient teaching tone and avoid unnecessary jargon.', voiceDirection: 'Patient, friendly, measured delivery.' },
];

export class Styles {
  constructor() { this.profiles = new Map(profiles.map(value => [value.id, { ...value }])); }
  list() { return [...this.profiles.values()].map(({ id, name }) => ({ id, name })); }
  get(id = 'clear') {
    const profile = this.profiles.get(id);
    if (!profile) throw new Error('Choose an available narration style.');
    return { ...profile };
  }
  add(profile) {
    if (!profile || !/^[a-z][a-z0-9-]{0,47}$/.test(profile.id ?? '') ||
        typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 60 ||
        typeof profile.instructions !== 'string' || !profile.instructions.trim() || profile.instructions.length > 2000 ||
        (profile.voiceDirection !== undefined && (typeof profile.voiceDirection !== 'string' || profile.voiceDirection.length > 300))) {
      throw new Error('Use a short style ID, name, and instructions (up to 2000 characters).');
    }
    if (profiles.some(value => value.id === profile.id)) throw new Error('Built-in styles cannot be overwritten.');
    if (!this.profiles.has(profile.id) && this.profiles.size >= 15) throw new Error('Custom style limit reached.');
    const value = { id: profile.id, name: profile.name.trim(), instructions: profile.instructions.trim(), voiceDirection: profile.voiceDirection?.trim() || 'Natural, clear conversational delivery.' };
    this.profiles.set(value.id, value);
    return this.get(value.id);
  }
  importMarkdown(markdown) {
    if (typeof markdown !== 'string' || markdown.length > 4000) throw new Error('Use a SKILL.md file under 4000 characters.');
    const match = markdown.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/);
    if (!match) throw new Error('SKILL.md needs YAML name and description, followed by speaking instructions.');
    const document = parseDocument(match[1], { uniqueKeys: true });
    if (document.errors.length) throw new Error('Invalid skill frontmatter.');
    const meta = document.toJS({ maxAliasCount: 0 });
    if (typeof meta?.name !== 'string' || typeof meta?.description !== 'string' || !meta.description.trim()) throw new Error('Skill name and description are required.');
    return this.add({ id: meta.name, name: meta.name.replace(/-/g, ' '), instructions: match[2].trim() });
  }
}
