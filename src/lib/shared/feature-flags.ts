export function isFeatureEnabled(name: string): boolean {
  const env = process.env[name];
  if (!env) return false;
  const v = String(env).toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'on' || v === 'enabled' || v === 'yes';
}

export const FEATURE_SHARE_LESSONS = 'FEATURE_SHARE_LESSONS';



