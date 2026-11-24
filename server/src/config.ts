export type AiProvider = 'anthropic' | 'gemini';
export const defaultModels: Record<AiProvider, string> = {
  anthropic: 'claude-haiku-5-5',
  gemini: 'gemini-3.5-flash',
};

export interface AiConfig {
  provider: AiProvider;
  apiKey?: string;
  model: string;
  monthlyBudgetUsd: number;
  userHourlyLimit: number;
  priceInputPerMTok: number;
  priceOutputPerMTok: number;
  /** One model call; Gemini's free tier can take close to a minute under load. */
  timeoutMs: number;
}
export const defaultAiConfig: AiConfig = {
  provider: 'anthropic',
  model: defaultModels.anthropic,
  monthlyBudgetUsd: 10,
  userHourlyLimit: 20,
  priceInputPerMTok: 1,
  priceOutputPerMTok: 5,
  timeoutMs: 20_000,
};

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
  ai?: AiConfig;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV || 'development';
  const authDevLogin = env.AUTH_DEV_LOGIN === '1';
  if (nodeEnv === 'production' && authDevLogin) throw new Error('AUTH_DEV_LOGIN must not be enabled in production');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!env.APP_ORIGIN) throw new Error('APP_ORIGIN is required');
  try {
    new URL(env.APP_ORIGIN);
  } catch {
    throw new Error('APP_ORIGIN must be a valid URL');
  }
  if (!env.SESSION_SECRET || Buffer.byteLength(env.SESSION_SECRET) < 32)
    throw new Error('SESSION_SECRET must be at least 32 bytes');
  const port = env.PORT ? Number(env.PORT) : 8080;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port');
  const number = (name: string, fallback: number, min: number): number => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < min) throw new Error(`${name} must be a number >= ${min}`);
    return value;
  };
  const provider = (env.AI_PROVIDER || 'anthropic') as AiProvider;
  if (provider !== 'anthropic' && provider !== 'gemini') throw new Error('AI_PROVIDER must be anthropic or gemini');
  // Gemini's free tier may use content to improve Google products: never send real user conversations to it.
  if (nodeEnv === 'production' && provider === 'gemini')
    throw new Error('AI_PROVIDER=gemini is for development and evaluation only; not allowed in production');
  const freeTier = provider === 'gemini';
  const ai: AiConfig = {
    provider,
    apiKey: (provider === 'gemini' ? env.GEMINI_API_KEY : env.ANTHROPIC_API_KEY) || undefined,
    model: env.AI_MODEL || defaultModels[provider],
    monthlyBudgetUsd: number('AI_MONTHLY_BUDGET_USD', defaultAiConfig.monthlyBudgetUsd, 0),
    userHourlyLimit: number('AI_USER_HOURLY_LIMIT', defaultAiConfig.userHourlyLimit, 0),
    priceInputPerMTok: number('AI_PRICE_INPUT_PER_MTOK', freeTier ? 0 : defaultAiConfig.priceInputPerMTok, 0),
    priceOutputPerMTok: number('AI_PRICE_OUTPUT_PER_MTOK', freeTier ? 0 : defaultAiConfig.priceOutputPerMTok, 0),
    timeoutMs: number('AI_TIMEOUT_MS', defaultAiConfig.timeoutMs, 1000),
  };
  return {
    nodeEnv,
    databaseUrl: env.DATABASE_URL,
    appOrigin: env.APP_ORIGIN,
    sessionSecret: env.SESSION_SECRET,
    port,
    authDevLogin,
    kakaoClientId: env.KAKAO_CLIENT_ID,
    kakaoClientSecret: env.KAKAO_CLIENT_SECRET,
    kakaoRedirectUri: env.KAKAO_REDIRECT_URI,
    ai,
  };
}
