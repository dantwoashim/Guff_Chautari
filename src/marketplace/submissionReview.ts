import { marketplaceStore, type MarketplaceStore } from './store';
import type {
  TemplateReviewDecision,
  TemplateReviewRecord,
  TemplateSubmission,
} from './types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(4));
};

const defaultQualityDelta = (decision: TemplateReviewDecision): number => {
  if (decision === 'approve') return 0.08;
  if (decision === 'request_changes') return -0.05;
  return -0.18;
};

const nextStatusForDecision = (decision: TemplateReviewDecision): TemplateSubmission['status'] => {
  if (decision === 'approve') return 'approved';
  if (decision === 'request_changes') return 'changes_requested';
  return 'rejected';
};

export const reviewTemplateSubmission = (
  payload: {
    userId: string;
    submissionId: string;
    reviewerId: string;
    decision: TemplateReviewDecision;
    notes?: string;
    qualityScoreDelta?: number;
    nowIso?: string;
  },
  store: MarketplaceStore = marketplaceStore
): TemplateSubmission => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const qualityScoreDelta = payload.qualityScoreDelta ?? defaultQualityDelta(payload.decision);
  let updated: TemplateSubmission | null = null;

  store.update(payload.userId, (state) => {
    const nextSubmissions = state.submissions.map((submission) => {
      if (submission.id !== payload.submissionId) return submission;

      const reviewRecord: TemplateReviewRecord = {
        id: makeId('submission-review'),
        reviewerId: payload.reviewerId,
        decision: payload.decision,
        notes: payload.notes?.trim() || undefined,
        createdAtIso: nowIso,
        qualityScoreDelta,
      };

      const next: TemplateSubmission = {
        ...submission,
        status: nextStatusForDecision(payload.decision),
        reviewHistory: [...submission.reviewHistory, reviewRecord],
        qualityScore: clamp01(submission.qualityScore + qualityScoreDelta),
        decidedAtIso: nowIso,
      };

      updated = next;
      return next;
    });

    return {
      ...state,
      submissions: nextSubmissions,
    };
  });

  if (!updated) {
    throw new Error(`Submission ${payload.submissionId} not found.`);
  }

  return updated;
};
