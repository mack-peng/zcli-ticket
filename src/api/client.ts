import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { AuthProvider } from './auth';

export interface RequestOptions {
  queryParams?: Record<string, any>;
  body?: any;
  timeout?: number;
}

let idempotencyCounter = 0;

function generateIdempotencyKey(): string {
  idempotencyCounter++;
  const prefix = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `${prefix}-${random}-${idempotencyCounter}`;
}

export function resolveBaseUrl(subdomain: string): string {
  if (subdomain.includes('://'))
    return subdomain;
  if (subdomain.includes('.'))
    return `https://${subdomain}`;
  return `https://${subdomain}.zendesk.com`;
}

export class ZendeskClient {
  private baseUrl: string;
  private auth: AuthProvider;
  private defaultTimeout: number;

  constructor(subdomain: string, auth: AuthProvider, defaultTimeout = 30000) {
    this.baseUrl = resolveBaseUrl(subdomain);
    this.auth = auth;
    this.defaultTimeout = defaultTimeout;
  }

  async request(method: string, path: string, options: RequestOptions = {}, retried = false): Promise<any> {
    const query = buildQueryString(options.queryParams);
    const url = this.baseUrl + path + query;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(await this.auth.getHeaders()),
    };

    if (method === 'POST' || method === 'PUT')
      headers['Idempotency-Key'] = generateIdempotencyKey();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || this.defaultTimeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
        await sleep(retryAfter * 1000);
        return this.request(method, path, options);
      }

      if (response.status === 401 && !retried && this.auth.refresh) {
        await this.auth.refresh();
        return this.request(method, path, options, true);
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
    } finally {
      clearTimeout(timeout);
    }
  }

  async upload(filePath: string, filename?: string, tokenOnly = false, retried = false): Promise<any> {
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    const fileBuffer = fs.readFileSync(resolvedPath);
    const blob = new Blob([fileBuffer]);
    const uploadName = filename || path.basename(filePath);

    const query = new URLSearchParams();
    query.set('filename', uploadName);
    if (tokenOnly)
      query.set('token', 'true');

    const url = `${this.baseUrl}/api/v2/uploads?${query.toString()}`;

    const formData = new FormData();
    formData.append('uploaded_data', blob, uploadName);

    const headers: Record<string, string> = {
      ...(await this.auth.getHeaders()),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.defaultTimeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });

      if (response.status === 401 && !retried && this.auth.refresh) {
        await this.auth.refresh();
        return this.upload(filePath, filename, tokenOnly, true);
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
    } finally {
      clearTimeout(timeout);
    }
  }

  async list(method: string, path: string, queryParams: Record<string, any> = {}): Promise<any[]> {
    const results: any[] = [];
    let nextPage: string | null = null;

    do {
      let params = { ...queryParams };

      if (nextPage) {
        if (nextPage.startsWith('http')) {
          const url = new URL(nextPage);
          params = Object.fromEntries(url.searchParams);
        } else {
          params['page[after]'] = nextPage;
        }
      }

      const response = await this.request(method, path, { queryParams: params });

      const key = Object.keys(response).find((k) => Array.isArray(response[k]));
      if (key)
        results.push(...response[key]);

      nextPage = response.links?.next
        || response.next_page
        || (response.meta?.has_more ? response.meta?.after_cursor : null)
        || null;
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
