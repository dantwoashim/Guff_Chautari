export interface MobileWorkflowCheckpoint {
  id: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface MobileWorkflowSummary {
  id: string;
  name: string;
  status: 'ready' | 'running' | 'completed' | 'failed';
  pendingCheckpointCount: number;
}

export const summarizeMobileWorkflow = (payload: {
  id: string;
  name: string;
  status: 'ready' | 'running' | 'completed' | 'failed';
  checkpoints: MobileWorkflowCheckpoint[];
}): MobileWorkflowSummary => {
  return {
    id: payload.id,
    name: payload.name,
    status: payload.status,
    pendingCheckpointCount: payload.checkpoints.filter((checkpoint) => checkpoint.status === 'pending').length,
  };
};

export const approveMobileCheckpoint = (
  checkpoints: ReadonlyArray<MobileWorkflowCheckpoint>,
  checkpointId: string
): MobileWorkflowCheckpoint[] => {
  return checkpoints.map((checkpoint) =>
    checkpoint.id === checkpointId ? { ...checkpoint, status: 'approved' } : checkpoint
  );
};
