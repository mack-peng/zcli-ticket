import { resolveBaseUrl } from './client';

export interface ClientCredentialsParams {
  subdomain: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  expiresIn?: number;
  timeout?: number;
}

export interface TokenResult {
  accessToken: string;
  expiresIn: number;
  scope: string;
}

export async function exchangeClientCredentials(params: ClientCredentialsParams): Promise<TokenResult> {
  const url = `${resolveBaseUrl(params.subdomain)}/oauth/tokens`;
  const body: Record<string, unknown> = {
    grant_type: 'client_credentials',
    client_id: params.clientId,
    client_secret: params.clientSecret,
  };
  if (params.scope)
    body.scope = params.scope;
  if (params.expiresIn)
    body.expires_in = params.expiresIn;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeout || 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json: any = await response.json().catch(() => ({}));

    if (!response.ok)
      throw new Error(describeTokenError(json, response.status, params.scope));

    if (!json.access_token)
      throw new Error('OAuth token exchange failed: response contains no access_token');

    return {
      accessToken: String(json.access_token),
      expiresIn: Number(json.expires_in) || 0,
      scope: typeof json.scope === 'string' ? json.scope : '',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function describeTokenError(json: any, status: number, requestedScope?: string): string {
  switch (json?.error) {
    case 'invalid_client':
      return 'OAuth token exchange failed (invalid_client): check oauthClientId / oauthClientSecret against Zendesk Admin Center (the client secret is shown only once at creation; regenerate it if lost)';
    case 'unauthorized_client':
      return 'OAuth token exchange failed (unauthorized_client): the OAuth client must be confidential (Admin Center -> APIs -> OAuth clients -> Client kind); public clients cannot use client_credentials';
    case 'invalid_scope':
      return `OAuth token exchange failed (invalid_scope): requested scope '${requestedScope ?? ''}' exceeds the client's allowed scopes`;
    default:
      return `OAuth token exchange failed: ${String(json?.error_description || json?.error || `HTTP ${status}`)}`;
  }
}
