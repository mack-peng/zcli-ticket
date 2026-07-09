import type { AuthProvider } from './auth';

export interface RequestOptions {
  queryParams?: Record<string, any>;
  body?: any;
}

export class ZendeskClient {
  private baseUrl: string;
  private auth: AuthProvider;

  constructor(subdomain: string, auth: AuthProvider) {
    this.baseUrl = `https://${subdomain}.zendesk.com`;
    this.auth = auth;
  }

  async request(method: string, path: string, options: RequestOptions = {}): Promise<any> {
    const query = buildQueryString(options.queryParams);
    const url = this.baseUrl + path + query;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.auth.getHeaders(),
    };

    const response = await fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
      await sleep(retryAfter * 1000);
      return this.request(method, path, options);
    }

    const json: any = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorObj = json.error;
      const message =
        json.description ||
        (typeof errorObj === 'object' && errorObj !== null ? (errorObj.title || errorObj.message || JSON.stringify(errorObj)) : errorObj) ||
        `HTTP ${response.status}`;
      throw new Error(String(message));
    }

    return json;
  }

  async list(method: string, path: string, queryParams: Record<string, any> = {}): Promise<any[]> {
    const results: any[] = [];
    let nextPage: string | null = null;

    do {
      const params = {
        ...queryParams,
        ...(nextPage ? { 'page[after]': nextPage } : {}),
      };
      const response = await this.request(method, path, { queryParams: params });

      const key = Object.keys(response).find((k) => Array.isArray(response[k]));
      if (key)
        results.push(...response[key]);

      nextPage = response.meta?.has_more
        ? response.links?.next
        : response.meta?.after_cursor || null;
    } while (nextPage);

    return results;
  }
}

function buildQueryString(params?: Record<string, any>): string {
  if (!params) return '';
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? '?' + parts.join('&') : '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
