export type ApiVersion = 'v1';

export type ApiHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ApiKeyScope = 'read_only' | 'read_write' | 'admin';

export type ApiCapability =
  | 'health:read'
  | 'conversations:read'
  | 'conversations:write'
  | 'knowledge:read'
  | 'knowledge:write'
  | 'memory:read'
  | 'memory:write'
  | 'memory:admin'
  | 'pipeline:run'
  | 'workflows:read'
  | 'workflows:write'
  | 'workflows:run'
  | 'workspace:admin';

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'validation_failed'
  | 'workspace_scope_denied'
  | 'rate_limited'
  | 'internal_error';

export interface ApiPaginationQuery {
  limit?: number;
  cursor?: string;
}

export interface ApiPaginationMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface ApiRequest {
  method: ApiHttpMethod;
  path: string;
  headers?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

export interface ApiSuccessBody<TData> {
  ok: true;
  requestId: string;
  atIso: string;
  data: TData;
  pagination?: ApiPaginationMeta;
}

export interface ApiErrorBody {
  ok: false;
  requestId: string;
  atIso: string;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponseBody<TData = unknown> = ApiSuccessBody<TData> | ApiErrorBody;

export interface ApiResponse<TData = unknown> {
  status: number;
  headers: Record<string, string>;
  body: ApiResponseBody<TData>;
}

export type ApiValidationResult<TData> =
  | { ok: true; data: TData }
  | { ok: false; issues: string[] };

export type ApiBodyValidator<TData> = (body: unknown) => ApiValidationResult<TData>;

export interface ApiAuthToken {
  tokenType: 'api_key';
  keyId: string;
  scope: ApiKeyScope;
  capabilities: ApiCapability[];
  workspaceScopes: string[];
  issuedAtIso: string;
  expiresAtIso?: string;
}

export interface ApiRequestPrincipal {
  keyId: string;
  ownerUserId: string;
  scope: ApiKeyScope;
  capabilities: ApiCapability[];
  workspaceScopes: string[];
  authenticatedAtIso: string;
  expiresAtIso?: string;
}

export interface ApiRouteMeta {
  name: string;
  version?: ApiVersion;
  requiresAuth?: boolean;
  requireWorkspace?: boolean;
  requiredCapability?: ApiCapability;
}

export const API_SCOPE_CAPABILITY_MATRIX: Record<ApiKeyScope, readonly ApiCapability[]> = {
  read_only: [
    'health:read',
    'conversations:read',
    'knowledge:read',
    'memory:read',
    'workflows:read',
  ],
  read_write: [
    'health:read',
    'conversations:read',
    'conversations:write',
    'knowledge:read',
    'knowledge:write',
    'memory:read',
    'memory:write',
    'pipeline:run',
    'workflows:read',
    'workflows:write',
    'workflows:run',
  ],
  admin: [
    'health:read',
    'conversations:read',
    'conversations:write',
    'knowledge:read',
    'knowledge:write',
    'memory:read',
    'memory:write',
    'memory:admin',
    'pipeline:run',
    'workflows:read',
    'workflows:write',
    'workflows:run',
    'workspace:admin',
  ],
};
