import { ApiKeyManager, extractApiKeyFromHeaders, isApiKeyAuthFailure } from './auth';
import type {
  ApiBodyValidator,
  ApiErrorCode,
  ApiHttpMethod,
  ApiPaginationMeta,
  ApiRequest,
  ApiRequestPrincipal,
  ApiResponse,
  ApiRouteMeta,
  ApiVersion,
} from './types';

const SUPPORTED_METHODS = new Set<ApiHttpMethod>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const normalizePath = (path: string): string => {
  const trimmed = path.trim();
  if (!trimmed) return '/';
  const noQuery = trimmed.split('?')[0] || '/';
  if (noQuery === '/') return '/';
  return noQuery.endsWith('/') ? noQuery.slice(0, -1) : noQuery;
};

const parsePathAndQuery = (path: string): { pathname: string; query: Record<string, string> } => {
  const url = new URL(path, 'https://ashim.local');
  return {
    pathname: normalizePath(url.pathname),
    query: Object.fromEntries(url.searchParams.entries()),
  };
};

const normalizeHeaders = (
  headers: Record<string, string | undefined> = {}
): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));

const defaultHeaders = (version: ApiVersion): Record<string, string> => ({
  'content-type': 'application/json',
  'x-api-version': version,
});

export class ApiRouteError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(payload: {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  }) {
    super(payload.message);
    this.name = 'ApiRouteError';
    this.status = payload.status;
    this.code = payload.code;
    this.details = payload.details;
  }
}

const errorResponse = (payload: {
  status: number;
  requestId: string;
  atIso: string;
  version: ApiVersion;
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}): ApiResponse => ({
  status: payload.status,
  headers: defaultHeaders(payload.version),
  body: {
    ok: false,
    requestId: payload.requestId,
    atIso: payload.atIso,
    error: {
      code: payload.code,
      message: payload.message,
      details: payload.details,
    },
  },
});

const successResponse = <TData>(payload: {
  status?: number;
  requestId: string;
  atIso: string;
  version: ApiVersion;
  data: TData;
  pagination?: ApiPaginationMeta;
  headers?: Record<string, string>;
}): ApiResponse<TData> => ({
  status: payload.status ?? 200,
  headers: {
    ...defaultHeaders(payload.version),
    ...payload.headers,
  },
  body: {
    ok: true,
    requestId: payload.requestId,
    atIso: payload.atIso,
    data: payload.data,
    pagination: payload.pagination,
  },
});

const matchPath = (
  routePath: string,
  requestPath: string
): { matched: boolean; params: Record<string, string> } => {
  const routeSegments = normalizePath(routePath).split('/').filter(Boolean);
  const requestSegments = normalizePath(requestPath).split('/').filter(Boolean);

  if (routeSegments.length !== requestSegments.length) {
    return { matched: false, params: {} };
  }

  const params: Record<string, string> = {};
  for (let index = 0; index < routeSegments.length; index += 1) {
    const routeSegment = routeSegments[index];
    const requestSegment = requestSegments[index];

    if (routeSegment.startsWith(':')) {
      params[routeSegment.slice(1)] = decodeURIComponent(requestSegment);
      continue;
    }
    if (routeSegment !== requestSegment) {
      return { matched: false, params: {} };
    }
  }

  return { matched: true, params };
};

export interface ApiGatewayRuntimeInfo {
  version: ApiVersion;
  startedAtIso: string;
  routeCount: number;
}

export interface ApiGatewayContext<TBody = unknown> {
  requestId: string;
  nowIso: string;
  request: {
    method: ApiHttpMethod;
    path: string;
    headers: Record<string, string | undefined>;
    query: Record<string, string | undefined>;
    body: TBody;
  };
  pathParams: Record<string, string>;
  workspaceId: string | null;
  principal: ApiRequestPrincipal | null;
  routeMeta: ApiRouteMeta;
}

export interface ApiRouteHandlerResult<TData = unknown> {
  status?: number;
  headers?: Record<string, string>;
  data: TData;
  pagination?: ApiPaginationMeta;
}

export type ApiRouteHandler<TBody = unknown, TData = unknown> = (
  context: ApiGatewayContext<TBody>
) => Promise<ApiRouteHandlerResult<TData>> | ApiRouteHandlerResult<TData>;

export interface ApiRouteDefinition<TBody = unknown, TData = unknown> {
  method: ApiHttpMethod;
  path: string;
  meta: ApiRouteMeta;
  validateBody?: ApiBodyValidator<TBody>;
  handler: ApiRouteHandler<TBody, TData>;
}

export type ApiMiddleware = (
  context: ApiGatewayContext<unknown>,
  next: () => Promise<ApiResponse>
) => Promise<ApiResponse>;

export const createApiAuthMiddleware = (authManager: ApiKeyManager): ApiMiddleware => {
  return async (context, next) => {
    if (!context.routeMeta.requiresAuth) {
      return next();
    }

    if (context.routeMeta.requireWorkspace && !context.workspaceId) {
      return errorResponse({
        status: 400,
        requestId: context.requestId,
        atIso: context.nowIso,
        version: context.routeMeta.version ?? 'v1',
        code: 'bad_request',
        message: 'x-workspace-id header is required for this route.',
      });
    }

    const apiKey = extractApiKeyFromHeaders(context.request.headers);
    if (!apiKey) {
      return errorResponse({
        status: 401,
        requestId: context.requestId,
        atIso: context.nowIso,
        version: context.routeMeta.version ?? 'v1',
        code: 'unauthorized',
        message: 'Missing API key.',
      });
    }

    const authResult = await authManager.authenticateApiKeyAsync({
      apiKey,
      workspaceId: context.workspaceId,
      requiredCapability: context.routeMeta.requiredCapability,
      nowIso: context.nowIso,
    });
    if (isApiKeyAuthFailure(authResult)) {
      const status = authResult.code === 'workspace_scope_denied' || authResult.code === 'forbidden' ? 403 : 401;
      return errorResponse({
        status,
        requestId: context.requestId,
        atIso: context.nowIso,
        version: context.routeMeta.version ?? 'v1',
        code: authResult.code,
        message: authResult.reason,
      });
    }

    context.principal = authResult.principal;
    return next();
  };
};

interface CompiledRoute {
  definition: ApiRouteDefinition<unknown, unknown>;
  normalizedPath: string;
}

export class ApiGateway {
  private readonly version: ApiVersion;
  private readonly routes: CompiledRoute[] = [];
  private readonly middlewares: ApiMiddleware[] = [];
  private startedAtIso: string | null = null;

  constructor(options: { version?: ApiVersion; authManager?: ApiKeyManager } = {}) {
    this.version = options.version ?? 'v1';
    if (options.authManager) {
      this.middlewares.push(createApiAuthMiddleware(options.authManager));
    }
    this.registerHealthRoute();
  }

  boot(nowIso = new Date().toISOString()): ApiGatewayRuntimeInfo {
    if (!this.startedAtIso) {
      this.startedAtIso = nowIso;
    }
    return {
      version: this.version,
      startedAtIso: this.startedAtIso,
      routeCount: this.routes.length,
    };
  }

  getRuntimeInfo(): ApiGatewayRuntimeInfo {
    return this.boot();
  }

  use(middleware: ApiMiddleware): void {
    this.middlewares.push(middleware);
  }

  registerRoute<TBody = unknown, TData = unknown>(route: ApiRouteDefinition<TBody, TData>): void {
    const normalizedPath = normalizePath(route.path);
    const alreadyRegistered = this.routes.some(
      (entry) =>
        entry.definition.method === route.method && entry.normalizedPath === normalizedPath
    );
    if (alreadyRegistered) {
      throw new Error(`Route ${route.method} ${normalizedPath} is already registered.`);
    }
    this.routes.push({
      definition: {
        ...route,
        path: normalizedPath,
        meta: {
          ...route.meta,
          version: route.meta.version ?? this.version,
        },
      },
      normalizedPath,
    });
  }

  async handleRequest(request: ApiRequest): Promise<ApiResponse> {
    const nowIso = new Date().toISOString();
    this.boot(nowIso);
    const requestId = makeId('api-request');

    if (!SUPPORTED_METHODS.has(request.method)) {
      return errorResponse({
        status: 400,
        requestId,
        atIso: nowIso,
        version: this.version,
        code: 'bad_request',
        message: `Unsupported method ${request.method}.`,
      });
    }

    const parsed = parsePathAndQuery(request.path);
    const headers = normalizeHeaders(request.headers);
    const query = {
      ...parsed.query,
      ...(request.query ?? {}),
    };
    const requestPath = parsed.pathname;
    const workspaceId = headers['x-workspace-id']?.trim() || query.workspaceId?.trim() || null;

    const pathCandidates = this.routes
      .map((route) => ({ route, match: matchPath(route.normalizedPath, requestPath) }))
      .filter((entry) => entry.match.matched);

    if (pathCandidates.length === 0) {
      return errorResponse({
        status: 404,
        requestId,
        atIso: nowIso,
        version: this.version,
        code: 'not_found',
        message: `Route ${request.method} ${requestPath} not found.`,
      });
    }

    const routeEntry = pathCandidates.find((entry) => entry.route.definition.method === request.method);
    if (!routeEntry) {
      return errorResponse({
        status: 405,
        requestId,
        atIso: nowIso,
        version: this.version,
        code: 'method_not_allowed',
        message: `Method ${request.method} is not allowed for ${requestPath}.`,
      });
    }

    const route = routeEntry.route.definition;
    let context: ApiGatewayContext<unknown> = {
      requestId,
      nowIso,
      request: {
        method: request.method,
        path: requestPath,
        headers,
        query,
        body: request.body,
      },
      pathParams: routeEntry.match.params,
      workspaceId,
      principal: null,
      routeMeta: route.meta,
    };

    if (route.validateBody) {
      const validation = route.validateBody(request.body);
      if (!validation.ok) {
        const issues = 'issues' in validation ? validation.issues : [];
        return errorResponse({
          status: 400,
          requestId,
          atIso: nowIso,
          version: this.version,
          code: 'validation_failed',
          message: 'Request body validation failed.',
          details: {
            issues,
          },
        });
      }
      context = {
        ...context,
        request: {
          ...context.request,
          body: validation.data,
        },
      };
    }

    const runRoute = async (): Promise<ApiResponse> => {
      try {
        const output = await route.handler(context);
        return successResponse({
          status: output.status,
          headers: output.headers,
          requestId,
          atIso: nowIso,
          version: this.version,
          data: output.data,
          pagination: output.pagination,
        });
      } catch (error) {
        if (error instanceof ApiRouteError) {
          return errorResponse({
            status: error.status,
            requestId,
            atIso: nowIso,
            version: this.version,
            code: error.code,
            message: error.message,
            details: error.details,
          });
        }

        return errorResponse({
          status: 500,
          requestId,
          atIso: nowIso,
          version: this.version,
          code: 'internal_error',
          message: error instanceof Error ? error.message : 'Unhandled gateway error.',
        });
      }
    };

    const execute = async (index: number): Promise<ApiResponse> => {
      if (index >= this.middlewares.length) return runRoute();
      const middleware = this.middlewares[index];
      return middleware(context, () => execute(index + 1));
    };

    return execute(0);
  }

  private registerHealthRoute(): void {
    this.registerRoute({
      method: 'GET',
      path: `/${this.version}/health`,
      meta: {
        name: 'health.check',
        version: this.version,
        requiresAuth: false,
      },
      handler: () => ({
        status: 200,
        data: {
          status: 'ok',
          version: this.version,
          startedAtIso: this.startedAtIso,
        },
      }),
    });
  }
}

export const createApiGateway = (options: { version?: ApiVersion; authManager?: ApiKeyManager } = {}): ApiGateway =>
  new ApiGateway(options);
