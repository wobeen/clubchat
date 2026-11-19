export interface Config {
  nodeEnv: string;
  databaseUrl: string;
  appOrigin: string;
  sessionSecret: string;
  port: number;
  authDevLogin: boolean;
  kakaoClientId?: string;
  kakaoClientSecret?: string;
  kakaoRedirectUri?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV || 'development';
  const authDevLogin = env.AUTH_DEV_LOGIN === '1';
  if (nodeEnv === 'production' && authDevLogin) throw new Error('AUTH_DEV_LOGIN must not be enabled in production');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!env.APP_ORIGIN) throw new Error('APP_ORIGIN is required');
  try { new URL(env.APP_ORIGIN); } catch { throw new Error('APP_ORIGIN must be a valid URL'); }
  if (!env.SESSION_SECRET || Buffer.byteLength(env.SESSION_SECRET) < 32)
    throw new Error('SESSION_SECRET must be at least 32 bytes');
  const port = env.PORT ? Number(env.PORT) : 8080;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port');
  return {
    nodeEnv, databaseUrl: env.DATABASE_URL, appOrigin: env.APP_ORIGIN,
    sessionSecret: env.SESSION_SECRET, port, authDevLogin,
    kakaoClientId: env.KAKAO_CLIENT_ID, kakaoClientSecret: env.KAKAO_CLIENT_SECRET,
    kakaoRedirectUri: env.KAKAO_REDIRECT_URI,
  };
}
