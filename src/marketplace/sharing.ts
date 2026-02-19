import { getPackSocialProof } from './analytics';
import { getVerticalPackById, type VerticalPackId } from './packs';
import {
  getTemplateById,
  getTemplateCommunityStats,
  getTemplateRating,
} from './manager';
import type { TemplateCommunityStats, TemplateItem, TemplateRating } from './types';

export type MarketplaceShareType = 'pack' | 'template';

interface MarketplaceSharePayload {
  v: 1;
  type: MarketplaceShareType;
  id: string;
  issuedAtIso: string;
}

interface ShareBenchmarkSnapshot {
  generatedAtIso: string;
  compositeScore: number;
  badgeTier: string;
}

interface StoredBenchmarkRecord {
  generatedAtIso?: string;
  compositeScore?: number;
  badgeTier?: string;
}

interface SharedTemplateMetadata {
  template: TemplateItem;
  rating: TemplateRating | null;
  stats: TemplateCommunityStats | null;
}

export type MarketplaceSharePreview =
  | {
      type: 'pack';
      id: VerticalPackId;
      name: string;
      description: string;
      components: {
        personaTemplate: SharedTemplateMetadata | null;
        workflowTemplate: SharedTemplateMetadata | null;
        knowledgeTitle: string;
      };
      socialProof: ReturnType<typeof getPackSocialProof>;
      benchmark: ShareBenchmarkSnapshot | null;
    }
  | {
      type: 'template';
      id: string;
      template: SharedTemplateMetadata;
      benchmark: ShareBenchmarkSnapshot | null;
    };

const SHARE_PARAM = 'ashim_share';
const BENCHMARK_HISTORY_STORAGE_KEY = 'ashim.benchmark.publish.v1';

const toBase64Url = (value: string): string => {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return window
      .btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const fromBase64Url = (value: string): string => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(padded, 'base64').toString('utf8');
};

const readLatestBenchmark = (): ShareBenchmarkSnapshot | null => {
  let records: StoredBenchmarkRecord[] = [];
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(BENCHMARK_HISTORY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          records = parsed as StoredBenchmarkRecord[];
        }
      }
    } catch {
      records = [];
    }
  }

  const latest = records.slice(-1)[0];
  if (!latest) return null;
  if (!latest.generatedAtIso || typeof latest.compositeScore !== 'number' || !latest.badgeTier) {
    return null;
  }
  return {
    generatedAtIso: latest.generatedAtIso,
    compositeScore: latest.compositeScore,
    badgeTier: latest.badgeTier,
  };
};

const resolveBaseUrl = (baseUrl?: string): string => {
  if (baseUrl && baseUrl.trim().length > 0) return baseUrl;
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return 'https://ashim.local/share';
};

const parsePayload = (token: string): MarketplaceSharePayload => {
  const raw = fromBase64Url(token);
  const parsed = JSON.parse(raw) as Partial<MarketplaceSharePayload>;
  if (parsed.v !== 1 || (parsed.type !== 'pack' && parsed.type !== 'template') || !parsed.id) {
    throw new Error('Invalid share payload.');
  }
  if (!parsed.issuedAtIso || Number.isNaN(Date.parse(parsed.issuedAtIso))) {
    throw new Error('Invalid share payload timestamp.');
  }

  return {
    v: 1,
    type: parsed.type,
    id: parsed.id,
    issuedAtIso: parsed.issuedAtIso,
  };
};

const buildTemplateMetadata = (payload: { userId: string; templateId: string }): SharedTemplateMetadata | null => {
  const template = getTemplateById({
    userId: payload.userId,
    templateId: payload.templateId,
  });
  if (!template) return null;

  return {
    template,
    rating: getTemplateRating({
      userId: payload.userId,
      templateId: payload.templateId,
    }),
    stats: getTemplateCommunityStats({
      userId: payload.userId,
      templateId: payload.templateId,
    }),
  };
};

export const createMarketplaceShareLink = (payload: {
  type: MarketplaceShareType;
  id: string;
  baseUrl?: string;
  nowIso?: string;
}): string => {
  const sharePayload: MarketplaceSharePayload = {
    v: 1,
    type: payload.type,
    id: payload.id,
    issuedAtIso: payload.nowIso ?? new Date().toISOString(),
  };

  const token = toBase64Url(JSON.stringify(sharePayload));
  const url = new URL(resolveBaseUrl(payload.baseUrl));
  url.searchParams.set(SHARE_PARAM, token);
  return url.toString();
};

export const parseMarketplaceShareLink = (shareUrl: string): MarketplaceSharePayload => {
  const url = new URL(shareUrl, 'https://ashim.local');
  const token = url.searchParams.get(SHARE_PARAM);
  if (!token) {
    throw new Error(`Share URL missing ${SHARE_PARAM} token.`);
  }
  return parsePayload(token);
};

export const resolveMarketplaceSharePreview = (payload: {
  userId: string;
  shareUrl: string;
}): MarketplaceSharePreview => {
  const share = parseMarketplaceShareLink(payload.shareUrl);
  const benchmark = readLatestBenchmark();

  if (share.type === 'pack') {
    const pack = getVerticalPackById(share.id as VerticalPackId);
    if (!pack) {
      throw new Error(`Shared pack ${share.id} was not found.`);
    }

    return {
      type: 'pack',
      id: pack.id,
      name: pack.name,
      description: pack.description,
      components: {
        personaTemplate: buildTemplateMetadata({
          userId: payload.userId,
          templateId: pack.components.personaTemplateId,
        }),
        workflowTemplate: buildTemplateMetadata({
          userId: payload.userId,
          templateId: pack.components.workflowTemplateId,
        }),
        knowledgeTitle: pack.components.knowledgeTemplate.title,
      },
      socialProof: getPackSocialProof({
        packId: pack.id,
      }),
      benchmark,
    };
  }

  const templateMetadata = buildTemplateMetadata({
    userId: payload.userId,
    templateId: share.id,
  });
  if (!templateMetadata) {
    throw new Error(`Shared template ${share.id} was not found.`);
  }

  return {
    type: 'template',
    id: share.id,
    template: templateMetadata,
    benchmark,
  };
};

export const extractMarketplaceShareTokenFromLocation = (locationHref: string): string | null => {
  const url = new URL(locationHref, 'https://ashim.local');
  return url.searchParams.get(SHARE_PARAM);
};
