import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || process.env.SENTRY_DSN?.trim();
const enabled = Boolean(dsn);

Sentry.init({
  dsn,
  enabled,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.user?.email) {
      event.user.email = '[redacted]';
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
