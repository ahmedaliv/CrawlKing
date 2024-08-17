import ky from 'ky';

export const apiPrefix =
  import.meta.env.VITE_APP_API_URL ?? 'https://nilefy-v0-0-1.onrender.com';
export const client = ky.extend({
  prefixUrl: apiPrefix
});
