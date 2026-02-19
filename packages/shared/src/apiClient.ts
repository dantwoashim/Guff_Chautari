import type { SharedApiRequest, SharedApiResponse } from './types';

export interface SharedApiClient {
  request: <TData = unknown>(request: SharedApiRequest) => Promise<SharedApiResponse<TData>>;
}

const headersWithDefaults = (headers: Record<string, string> | undefined): Record<string, string> => ({
  'content-type': 'application/json',
  ...(headers ?? {}),
});

export const createSharedApiClient = (baseUrl: string, fetcher: typeof fetch = fetch): SharedApiClient => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  return {
    request: async <TData>(request: SharedApiRequest): Promise<SharedApiResponse<TData>> => {
      try {
        const response = await fetcher(`${normalizedBaseUrl}${request.path}`, {
          method: request.method,
          headers: headersWithDefaults(request.headers),
          body: request.body === undefined ? undefined : JSON.stringify(request.body),
        });

        const json = (await response.json().catch(() => null)) as
          | { ok?: boolean; data?: TData; error?: { code?: string; message?: string } }
          | null;

        if (!response.ok) {
          return {
            status: response.status,
            ok: false,
            error: {
              code: json?.error?.code ?? 'http_error',
              message: json?.error?.message ?? `Request failed with status ${response.status}.`,
            },
          };
        }

        return {
          status: response.status,
          ok: true,
          data: json?.data,
        };
      } catch (error) {
        return {
          status: 0,
          ok: false,
          error: {
            code: 'network_error',
            message: error instanceof Error ? error.message : 'Unknown network failure.',
          },
        };
      }
    },
  };
};
