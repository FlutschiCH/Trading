import { getApiBaseUrl } from './components/ip_switcher';

export const API_BASE_URL = {
  toString: () => getApiBaseUrl(),
} as unknown as string;

