import { createStore } from 'zustand/vanilla';
import type { Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceStoreState } from './types';

export interface WorkspaceStoreActions {
  setWorkspaces: (workspaces: Workspace[]) => void;
  upsertWorkspace: (workspace: Workspace) => void;
  setActiveWorkspace: (workspaceId: string | null) => void;
  setMembers: (workspaceId: string, members: WorkspaceMember[]) => void;
  upsertMember: (member: WorkspaceMember) => void;
  removeMember: (workspaceId: string, userId: string) => void;
  setPendingInvites: (workspaceId: string, invites: WorkspaceInvite[]) => void;
  upsertInvite: (invite: WorkspaceInvite) => void;
  clearWorkspaceState: (workspaceId: string) => void;
  reset: () => void;
}

export type WorkspaceStore = WorkspaceStoreState & WorkspaceStoreActions;

const initialWorkspaceState = (): WorkspaceStoreState => ({
  workspaces: [],
  activeWorkspaceId: null,
  membersByWorkspaceId: {},
  pendingInvitesByWorkspaceId: {},
});

const upsertById = <T extends { id: string }>(items: ReadonlyArray<T>, next: T): T[] => {
  const existing = items.find((item) => item.id === next.id);
  if (!existing) return [next, ...items];
  return items.map((item) => (item.id === next.id ? next : item));
};

export const createWorkspaceStore = (seed?: Partial<WorkspaceStoreState>) =>
  createStore<WorkspaceStore>((set) => ({
    ...initialWorkspaceState(),
    ...seed,
    setWorkspaces: (workspaces) =>
      set(() => ({
        workspaces: [...workspaces],
      })),
    upsertWorkspace: (workspace) =>
      set((state) => ({
        workspaces: upsertById(state.workspaces, workspace),
      })),
    setActiveWorkspace: (workspaceId) =>
      set(() => ({
        activeWorkspaceId: workspaceId,
      })),
    setMembers: (workspaceId, members) =>
      set((state) => ({
        membersByWorkspaceId: {
          ...state.membersByWorkspaceId,
          [workspaceId]: [...members],
        },
      })),
    upsertMember: (member) =>
      set((state) => {
        const current = state.membersByWorkspaceId[member.workspaceId] ?? [];
        return {
          membersByWorkspaceId: {
            ...state.membersByWorkspaceId,
            [member.workspaceId]: upsertById(current, member),
          },
        };
      }),
    removeMember: (workspaceId, userId) =>
      set((state) => {
        const current = state.membersByWorkspaceId[workspaceId] ?? [];
        return {
          membersByWorkspaceId: {
            ...state.membersByWorkspaceId,
            [workspaceId]: current.filter((member) => member.userId !== userId),
          },
        };
      }),
    setPendingInvites: (workspaceId, invites) =>
      set((state) => ({
        pendingInvitesByWorkspaceId: {
          ...state.pendingInvitesByWorkspaceId,
          [workspaceId]: [...invites],
        },
      })),
    upsertInvite: (invite) =>
      set((state) => {
        const current = state.pendingInvitesByWorkspaceId[invite.workspaceId] ?? [];
        return {
          pendingInvitesByWorkspaceId: {
            ...state.pendingInvitesByWorkspaceId,
            [invite.workspaceId]: upsertById(current, invite),
          },
        };
      }),
    clearWorkspaceState: (workspaceId) =>
      set((state) => {
        const nextMembers = { ...state.membersByWorkspaceId };
        const nextInvites = { ...state.pendingInvitesByWorkspaceId };
        delete nextMembers[workspaceId];
        delete nextInvites[workspaceId];
        return {
          membersByWorkspaceId: nextMembers,
          pendingInvitesByWorkspaceId: nextInvites,
          workspaces: state.workspaces.filter((workspace) => workspace.id !== workspaceId),
          activeWorkspaceId:
            state.activeWorkspaceId === workspaceId ? null : state.activeWorkspaceId,
        };
      }),
    reset: () =>
      set(() => ({
        ...initialWorkspaceState(),
      })),
  }));

export const workspaceStore = createWorkspaceStore();
