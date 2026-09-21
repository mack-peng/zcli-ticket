import { exchangeClientCredentials } from './oauth';

export type AuthMode = 'api-token' | 'basic' | 'oauth';

export interface AuthConfig {
  mode: AuthMode;
  email?: string;
  token?: string;
  username?: string;
  password?: string;
  oauthToken?: string;
  oauthTokenExpiresAt?: number;
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthScope?: string;
  subdomain?: string;
  verbose?: boolean;
  persist?: (token: { accessToken: string; expiresAt: number; scopeGranted?: string }) => void;
}

export interface AuthProvider {
  getHeaders(): Record<string, string> | Promise<Record<string, string>>;
  refresh?(): Promise<void>;
}

const OAUTH_REFRESH_WINDOW_SECONDS = 60;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function createAuthProvider(config: AuthConfig): AuthProvider {
  switch (config.mode) {
    case 'api-token':
      if (!config.email || !config.token)
        throw new Error('API token mode requires --email and --token');
      return {
        getHeaders: () => {
          const encoded = Buffer.from(`${config.email}/token:${config.token}`).toString('base64');
          return { Authorization: `Basic ${encoded}` };
        },
      };
    case 'basic':
      if (!config.email || !config.password)
        throw new Error('Basic auth requires --email and --password');
      return {
        getHeaders: () => {
          const encoded = Buffer.from(`${config.email}:${config.password}`).toString('base64');
          return { Authorization: `Basic ${encoded}` };
        },
      };
    case 'oauth': {
      const canRefresh = !!(config.subdomain && config.oauthClientId && config.oauthClientSecret);
      if (!config.oauthToken && !canRefresh)
        throw new Error('OAuth requires --oauth-token, or oauth-client-id / oauth-client-secret for auto refresh');

      let accessToken = config.oauthToken;
      let expiresAt = config.oauthTokenExpiresAt;
      let inflight: Promise<void> | null = null;
      let persistWarned = false;

      const refresh = async (): Promise<void> => {
        if (!canRefresh)
          throw new Error('Cannot refresh OAuth token: oauth-client-id / oauth-client-secret not configured');
        if (!inflight) {
          inflight = (async () => {
            try {
              const result = await exchangeClientCredentials({
                subdomain: config.subdomain!,
                clientId: config.oauthClientId!,
                clientSecret: config.oauthClientSecret!,
                scope: config.oauthScope,
              });
              accessToken = result.accessToken;
              expiresAt = nowSeconds() + result.expiresIn;
              try {
                config.persist?.({ accessToken, expiresAt, scopeGranted: result.scope });
              } catch (e) {
                if (!persistWarned) {
                  persistWarned = true;
                  console.error(`Warning: failed to persist refreshed oauth token: ${e instanceof Error ? e.message : String(e)}`);
                }
              }
              if (config.verbose)
                console.error(`oauth: refreshed access token (expires in ${result.expiresIn}s)`);
            } catch (e) {
              throw new Error(`刷新 token 失败: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
              inflight = null;
            }
          })();
        }
        return inflight;
      };

      const provider: AuthProvider = {
        getHeaders: async () => {
          if (canRefresh && (!accessToken || (expiresAt !== undefined && expiresAt - nowSeconds() <= OAUTH_REFRESH_WINDOW_SECONDS)))
            await refresh();
          return { Authorization: `Bearer ${accessToken}` };
        },
      };
      if (canRefresh)
        provider.refresh = refresh;
      return provider;
    }
  }
}
