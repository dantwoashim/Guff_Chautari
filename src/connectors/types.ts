import type { ActorRole, ApprovalRequest, PolicyDecisionRecord } from '../policy';

export type ConnectorAuthType = 'none' | 'api_key' | 'oauth';
export type ConnectorRuntimeMode = 'live' | 'mock';

export interface ConnectorAuth {
  type: ConnectorAuthType;
  setupLabel: string;
}

export interface ConnectorActionDefinition {
  id: string;
  title: string;
  description: string;
  mutation: boolean;
  idempotent?: boolean;
  policyActionId?: string;
}

export interface ConnectorManifest {
  id: string;
  name: string;
  version: string;
  auth: ConnectorAuth;
  runtimeMode?: ConnectorRuntimeMode;
  actions: ConnectorActionDefinition[];
}

export interface ConnectorExecutionContext {
  userId: string;
  payload: Record<string, unknown>;
}

export interface ConnectorHealthCheckContext {
  userId: string;
  authToken?: string;
}

export interface ConnectorAuthValidationResult {
  valid: boolean;
  message: string;
}

export interface ConnectorActionResult {
  ok: boolean;
  summary: string;
  data?: Record<string, unknown>;
  errorMessage?: string;
}

export interface Connector {
  manifest: ConnectorManifest;
  execute: (actionId: string, context: ConnectorExecutionContext) => Promise<ConnectorActionResult>;
  validateAuth?: (
    context: ConnectorHealthCheckContext
  ) => Promise<ConnectorAuthValidationResult>;
}

export interface ConnectorInvokeInput {
  userId: string;
  connectorId: string;
  actionId: string;
  payload?: Record<string, unknown>;
  actorRole?: ActorRole;
}

export interface ConnectorInvocationOutcome {
  connectorId: string;
  actionId: string;
  policyDecision: PolicyDecisionRecord;
  approvalRequest?: ApprovalRequest;
  result?: ConnectorActionResult;
}

export interface ConnectorHealthCheckInput {
  userId: string;
  connectorId: string;
  authToken?: string;
}

export interface ConnectorHealthStatus {
  connectorId: string;
  connectorName: string;
  ok: boolean;
  authType: ConnectorAuthType;
  checkedAtIso: string;
  message: string;
}

export type ToolRuntimeSource = 'connector' | 'plugin';

export interface ToolRuntimeDescriptor {
  id: string;
  source: ToolRuntimeSource;
  title: string;
  description: string;
  requiresMutation: boolean;
}

export interface ToolRuntimeInvocation {
  userId: string;
  toolId: string;
  payload?: Record<string, unknown>;
  actorRole?: ActorRole;
}

export interface ToolRuntimeResult {
  ok: boolean;
  toolId: string;
  source: ToolRuntimeSource;
  summary: string;
  data?: Record<string, unknown>;
  denied?: boolean;
  policyDecision?: PolicyDecisionRecord;
}

export interface ToolRuntime {
  listTools: () => ToolRuntimeDescriptor[];
  invoke: (input: ToolRuntimeInvocation) => Promise<ToolRuntimeResult>;
}
