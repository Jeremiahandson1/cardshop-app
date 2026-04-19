const { Colors, Typography, Spacing, Radius, Shadows } = require('../theme/index');

describe('Theme', () => {
  describe('Colors', () => {
    it('has required background colors', () => {
      expect(Colors.bg).toBeDefined();
      expect(Colors.surface).toBeDefined();
      expect(Colors.surface2).toBeDefined();
    });

    it('has brand accent color', () => {
      expect(Colors.accent).toBe('#e8c547');
    });

    it('has text colors', () => {
      expect(Colors.text).toBeDefined();
      expect(Colors.textMuted).toBeDefined();
    });

    it('has status colors', () => {
      expect(Colors.success).toBeDefined();
      expect(Colors.warning).toBeDefined();
      expect(Colors.error).toBeDefined();
    });

    it('has card status colors', () => {
      expect(Colors.nfs).toBeDefined();
      expect(Colors.nft).toBeDefined();
      expect(Colors.listed).toBeDefined();
    });
  });

  describe('Typography', () => {
    it('has size scale', () => {
      expect(Typography.xs).toBeLessThan(Typography.sm);
      expect(Typography.sm).toBeLessThan(Typography.base);
      expect(Typography.base).toBeLessThan(Typography.lg);
      expect(Typography.lg).toBeLessThan(Typography.xl);
    });

    it('has weight values', () => {
      expect(Typography.regular).toBe('400');
      expect(Typography.bold).toBe('700');
    });
  });

  describe('Spacing', () => {
    it('has ascending scale', () => {
      expect(Spacing.xs).toBeLessThan(Spacing.sm);
      expect(Spacing.sm).toBeLessThan(Spacing.md);
      expect(Spacing.md).toBeLessThan(Spacing.base);
      expect(Spacing.base).toBeLessThan(Spacing.lg);
    });
  });

  describe('Radius', () => {
    it('has ascending scale', () => {
      expect(Radius.sm).toBeLessThan(Radius.md);
      expect(Radius.md).toBeLessThan(Radius.lg);
      expect(Radius.full).toBe(999);
    });
  });

  describe('Shadows', () => {
    it('has shadow presets with required properties', () => {
      ['sm', 'md', 'gold'].forEach((key) => {
        expect(Shadows[key]).toHaveProperty('shadowColor');
        expect(Shadows[key]).toHaveProperty('shadowOffset');
        expect(Shadows[key]).toHaveProperty('shadowOpacity');
        expect(Shadows[key]).toHaveProperty('elevation');
      });
    });
  });
});
