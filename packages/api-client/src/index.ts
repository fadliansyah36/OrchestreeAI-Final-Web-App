import type { paths } from '@orchestree/api-types';

export type ApiPath = keyof paths | string;

export interface ApiRequestOptions extends RequestInit {
  /**
   * Relative /api paths are intentionally sent through the hosting Next.js rewrite.
   * Absolute URLs remain supported for local diagnostics and existing admin props.
   */
  baseUrl?: string;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly path: string;
  readonly body: unknown;

  constructor(message: string, status: number, path: string, body: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

function resolveUrl(input: string, baseUrl?: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  const base = (baseUrl ?? '').replace(/\/$/, '');
  if (!base) return input.startsWith('/') ? input : `/${input}`;
  return `${base}${input.startsWith('/') ? input : `/${input}`}`;
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => null);
}

async function rawRequest(input: string, init: ApiRequestOptions = {}): Promise<Response> {
  const { baseUrl, headers, ...requestInit } = init;
  const mergedHeaders = new Headers(headers);
  if (!mergedHeaders.has('Accept')) mergedHeaders.set('Accept', 'application/json');
  if (requestInit.body && typeof requestInit.body === 'string' && !mergedHeaders.has('Content-Type')) {
    mergedHeaders.set('Content-Type', 'application/json');
  }

  return fetch(resolveUrl(input, baseUrl), {
    ...requestInit,
    credentials: requestInit.credentials ?? 'include',
    headers: mergedHeaders,
  });
}

async function request(input: string, init: ApiRequestOptions = {}): Promise<Response> {
  const response = await rawRequest(input, init);
  if (!response.ok) {
    const body = await parseBody(response);
    const detail =
      typeof body === 'object' && body !== null
        ? ((body as Record<string, unknown>).detail ?? (body as Record<string, unknown>).message ?? (body as Record<string, unknown>).error)
        : undefined;
    const message = typeof detail === 'string' ? detail : `Backend request failed (${response.status})`;
    throw new ApiClientError(message, response.status, input, body);
  }
  return response;
}

export const apiClient = {
  request,
  // `fetch` preserves native Response semantics for existing components that inspect ok/status/body.
  fetch: rawRequest,
  get<T = unknown>(input: ApiPath, init?: ApiRequestOptions) {
    return request(String(input), { ...init, method: 'GET' }).then((r) => r.json() as Promise<T>);
  },
  async post<T = unknown>(input: ApiPath, body?: unknown, init?: ApiRequestOptions) {
    const response = await request(String(input), {
      ...init,
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return response.json() as Promise<T>;
  },
  async patch<T = unknown>(input: ApiPath, body?: unknown, init?: ApiRequestOptions) {
    const response = await request(String(input), {
      ...init,
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return response.json() as Promise<T>;
  },
  async put<T = unknown>(input: ApiPath, body?: unknown, init?: ApiRequestOptions) {
    const response = await request(String(input), {
      ...init,
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return response.json() as Promise<T>;
  },
  async delete<T = unknown>(input: ApiPath, init?: ApiRequestOptions) {
    const response = await request(String(input), { ...init, method: 'DELETE' });
    return response.json() as Promise<T>;
  },
};

export type OrchestreeApiPaths = paths;
