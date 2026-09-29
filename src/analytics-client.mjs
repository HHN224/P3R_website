import { inject } from '@vercel/analytics';

if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  inject({ mode: 'production' });
}
