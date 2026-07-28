function enabled(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

export const FEATURE_FLAGS = Object.freeze({
  visits: enabled(import.meta.env.VITE_VISITS_TREATMENT_ENABLED),
  notifications: enabled(import.meta.env.VITE_NOTIFICATIONS_ENABLED),
});
