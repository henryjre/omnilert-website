import { useState, useEffect, useCallback } from 'react';

const DEFAULT_EMOJIS = ['✅', '❤️', '🤣', '🙏', '👌', '😭'];

interface EmojiFrequency {
  [emoji: string]: number;
}

export function useMostUsedEmojis(limit = 6) {
  const [mostUsed, setMostUsed] = useState<string[]>(DEFAULT_EMOJIS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('omnilert_emoji_freq');
      if (stored) {
        const freq: EmojiFrequency = JSON.parse(stored);
        const sorted = Object.entries(freq)
          .sort((a, b) => b[1] - a[1])
          .map(([emoji]) => emoji);
        
        if (sorted.length > 0) {
          const combined = Array.from(new Set([...sorted, ...DEFAULT_EMOJIS])).slice(0, limit);
          setMostUsed(combined);
        }
      }
    } catch {
      // Ignore errors
    }
  }, [limit]);

  const addEmoji = useCallback((emoji: string) => {
    try {
      const stored = localStorage.getItem('omnilert_emoji_freq');
      const freq: EmojiFrequency = stored ? JSON.parse(stored) : {};
      freq[emoji] = (freq[emoji] || 0) + 1;
      localStorage.setItem('omnilert_emoji_freq', JSON.stringify(freq));

      const sorted = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .map(([e]) => e);
      
      const combined = Array.from(new Set([...sorted, ...DEFAULT_EMOJIS])).slice(0, limit);
      setMostUsed(combined);
    } catch {
      // Ignore errors
    }
  }, [limit]);

  return { mostUsed, addEmoji };
}
