export const EMOJIS = [
  { key: 'fire', symbol: '🔥', label: 'fire' },
  { key: 'dead', symbol: '💀', label: 'dead' },
  { key: 'mind_blown', symbol: '🤯', label: 'blown' },
  { key: 'emotional', symbol: '😭', label: 'felt' },
  { key: 'respect', symbol: '🙏', label: 'respect' },
  { key: 'accurate', symbol: '🎯', label: 'accurate' },
] as const;

export type EmojiKey = typeof EMOJIS[number]['key'];
