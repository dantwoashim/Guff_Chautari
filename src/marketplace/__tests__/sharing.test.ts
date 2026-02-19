import { describe, expect, it } from 'vitest';
import {
  createMarketplaceShareLink,
  parseMarketplaceShareLink,
  resolveMarketplaceSharePreview,
} from '../sharing';

describe('marketplace sharing', () => {
  it('generates and resolves pack share link preview metadata', () => {
    const shareUrl = createMarketplaceShareLink({
      type: 'pack',
      id: 'founder_os',
      baseUrl: 'https://ashim.app/marketplace',
      nowIso: '2026-04-02T10:00:00.000Z',
    });

    const parsed = parseMarketplaceShareLink(shareUrl);
    expect(parsed.type).toBe('pack');
    expect(parsed.id).toBe('founder_os');

    const preview = resolveMarketplaceSharePreview({
      userId: 'week61-sharing-user',
      shareUrl,
    });

    expect(preview.type).toBe('pack');
    if (preview.type === 'pack') {
      expect(preview.id).toBe('founder_os');
      expect(preview.components.knowledgeTitle.toLowerCase()).toContain('founder');
      expect(preview.components.personaTemplate?.template.metadata.id).toBe('persona-coach');
      expect(preview.components.workflowTemplate?.template.metadata.id).toBe('workflow-weekly-review');
    }
  });

  it('generates and resolves template share link preview metadata', () => {
    const shareUrl = createMarketplaceShareLink({
      type: 'template',
      id: 'workflow-weekly-review',
      baseUrl: 'https://ashim.app/marketplace',
      nowIso: '2026-04-02T11:00:00.000Z',
    });

    const parsed = parseMarketplaceShareLink(shareUrl);
    expect(parsed.type).toBe('template');
    expect(parsed.id).toBe('workflow-weekly-review');

    const preview = resolveMarketplaceSharePreview({
      userId: 'week61-sharing-user',
      shareUrl,
    });

    expect(preview.type).toBe('template');
    if (preview.type === 'template') {
      expect(preview.template.template.metadata.id).toBe('workflow-weekly-review');
      expect(preview.template.template.kind).toBe('workflow');
    }
  });
});
