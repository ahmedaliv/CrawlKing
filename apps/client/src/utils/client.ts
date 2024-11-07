import ky from 'ky';

export const apiPrefix =
  import.meta.env.VITE_APP_API_URL ?? 'http://localhost:3000/api';
export const client = ky.extend({
  prefixUrl: apiPrefix
});
