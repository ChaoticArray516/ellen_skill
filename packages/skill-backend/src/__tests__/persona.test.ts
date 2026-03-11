/**
 * Unit tests for persona module
 */

import { EllenPersona } from '../persona';

describe('EllenPersona', () => {
  describe('getSystemPrompt', () => {
    test('returns complete Japanese system prompt', () => {
      const prompt = EllenPersona.getSystemPrompt();

      // Should contain key sections
      expect(prompt).toContain('役割宣言');
      expect(prompt).toContain('エレン・ジョー');
      expect(prompt).toContain('ゼンレスゾーンゼロ');
      expect(prompt).toContain('若山詩音');

      // Should contain format instructions
      expect(prompt).toContain('[motion:');
      expect(prompt).toContain('[exp:');

      // Should contain available motions
      expect(prompt).toContain('idle');
      expect(prompt).toContain('idle2');

      // Should contain available expressions
      expect(prompt).toContain('lazy');
      expect(prompt).toContain('maid');
      expect(prompt).toContain('predator');
      expect(prompt).toContain('hangry');
      expect(prompt).toContain('shy');
      expect(prompt).toContain('surprised');
      expect(prompt).toContain('happy');

      // Should contain examples
      expect(prompt).toContain('ご主人様');
    });

    test('contains all required motion IDs', () => {
      const prompt = EllenPersona.getSystemPrompt();
      const motionMatches = prompt.match(/motion:([a-zA-Z0-9_]+)/g);
      expect(motionMatches?.length).toBeGreaterThanOrEqual(2);
    });

    test('contains all required expression IDs', () => {
      const prompt = EllenPersona.getSystemPrompt();
      // Check that all expression IDs are mentioned in the prompt
      expect(prompt).toContain('lazy');
      expect(prompt).toContain('maid');
      expect(prompt).toContain('predator');
      expect(prompt).toContain('hangry');
      expect(prompt).toContain('shy');
      expect(prompt).toContain('surprised');
      expect(prompt).toContain('happy');
    });
  });

  describe('getContextualPrompt', () => {
    test('returns tail touch context when isTailTouch is true', () => {
      const context = EllenPersona.getContextualPrompt({ isTailTouch: true });

      expect(context).toContain('尻尾');
      expect(context).toContain('shy');
    });

    test('returns low sugar context when isLowSugar is true', () => {
      const context = EllenPersona.getContextualPrompt({ isLowSugar: true });

      expect(context).toContain('低血糖');
      expect(context).toContain('hangry');
    });

    test('returns both contexts when both are true', () => {
      const context = EllenPersona.getContextualPrompt({
        isTailTouch: true,
        isLowSugar: true,
      });

      expect(context).toContain('尻尾');
      expect(context).toContain('低血糖');
    });

    test('returns empty string when no context', () => {
      const context = EllenPersona.getContextualPrompt({});

      expect(context).toBe('');
    });
  });

  describe('getFullPrompt', () => {
    test('returns base prompt without context', () => {
      const fullPrompt = EllenPersona.getFullPrompt();
      const basePrompt = EllenPersona.getSystemPrompt();

      expect(fullPrompt).toBe(basePrompt);
    });

    test('returns combined prompt with context', () => {
      const fullPrompt = EllenPersona.getFullPrompt({ isTailTouch: true });
      const basePrompt = EllenPersona.getSystemPrompt();

      expect(fullPrompt).toContain(basePrompt);
      expect(fullPrompt).toContain('現在の状況');
      expect(fullPrompt).toContain('尻尾');
    });
  });

  describe('getCharacterInfo', () => {
    test('returns correct character metadata', () => {
      const info = EllenPersona.getCharacterInfo();

      expect(info.name).toBe('Ellen Joe');
      expect(info.nameJp).toBe('エレン・ジョー');
      expect(info.cv).toBe('Shion Wakayama');
      expect(info.cvJp).toBe('若山詩音');
      expect(info.game).toBe('Zenless Zone Zero');
      expect(info.trustLevel).toBe(100);
      expect(info.allowTailTouch).toBe(true);
    });
  });
});
