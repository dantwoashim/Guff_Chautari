import {
  listTemplateSubmissions,
  submitTemplateContribution,
  voteOnSubmission,
  type TemplateItem,
  type TemplateSubmission,
} from '../marketplace';
import {
  getCollaborativeSubmissionAttribution,
  type CreatorAttributionMember,
} from './collaboration';

export const submitCreatorTemplate = (payload: {
  userId: string;
  template: TemplateItem;
}): TemplateSubmission => {
  return submitTemplateContribution({
    userId: payload.userId,
    template: payload.template,
  });
};

export const castCreatorReviewVote = (payload: {
  userId: string;
  submissionId: string;
  vote: 'up' | 'down';
}): TemplateSubmission => {
  return voteOnSubmission({
    userId: payload.userId,
    submissionId: payload.submissionId,
    vote: payload.vote,
  });
};

export const listCreatorReviewQueue = (payload: {
  userId: string;
  status?: 'community_review' | 'approved' | 'rejected';
}): TemplateSubmission[] => {
  return listTemplateSubmissions({
    userId: payload.userId,
    status: payload.status,
  });
};

export interface CreatorReviewSubmissionWithAttribution extends TemplateSubmission {
  attribution: CreatorAttributionMember[] | null;
}

export const listCreatorReviewQueueWithAttribution = (payload: {
  userId: string;
  status?: 'community_review' | 'approved' | 'rejected';
}): CreatorReviewSubmissionWithAttribution[] => {
  return listCreatorReviewQueue(payload).map((submission) => ({
    ...submission,
    attribution: getCollaborativeSubmissionAttribution({
      submissionId: submission.id,
    }),
  }));
};
