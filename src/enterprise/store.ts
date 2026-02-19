import { create } from 'zustand';
import type { Organization, OrgAdmin } from './types';
import type { SSOProvider } from './sso/types';

export interface EnterpriseStoreState {
  currentOrganizationId: string | null;
  organizations: Organization[];
  workspacesByOrganization: Record<string, string[]>;
  adminsByOrganization: Record<string, OrgAdmin[]>;
  ssoByOrganization: Record<string, SSOProvider[]>;
  setCurrentOrganizationId: (organizationId: string | null) => void;
  upsertOrganization: (organization: Organization) => void;
  setOrganizationWorkspaces: (organizationId: string, workspaceIds: string[]) => void;
  setOrganizationAdmins: (organizationId: string, admins: OrgAdmin[]) => void;
  setOrganizationSsoProviders: (organizationId: string, providers: SSOProvider[]) => void;
  resetEnterpriseStore: () => void;
}

const initialState = {
  currentOrganizationId: null,
  organizations: [],
  workspacesByOrganization: {},
  adminsByOrganization: {},
  ssoByOrganization: {},
};

export const useEnterpriseStore = create<EnterpriseStoreState>()((set) => ({
  ...initialState,
  setCurrentOrganizationId: (organizationId) => set({ currentOrganizationId: organizationId }),
  upsertOrganization: (organization) =>
    set((state) => ({
      organizations: [organization, ...state.organizations.filter((entry) => entry.id !== organization.id)],
    })),
  setOrganizationWorkspaces: (organizationId, workspaceIds) =>
    set((state) => ({
      workspacesByOrganization: {
        ...state.workspacesByOrganization,
        [organizationId]: [...workspaceIds],
      },
    })),
  setOrganizationAdmins: (organizationId, admins) =>
    set((state) => ({
      adminsByOrganization: {
        ...state.adminsByOrganization,
        [organizationId]: [...admins],
      },
    })),
  setOrganizationSsoProviders: (organizationId, providers) =>
    set((state) => ({
      ssoByOrganization: {
        ...state.ssoByOrganization,
        [organizationId]: [...providers],
      },
    })),
  resetEnterpriseStore: () =>
    set({
      ...initialState,
    }),
}));
