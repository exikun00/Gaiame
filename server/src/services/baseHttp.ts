import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ANIME_BASE_URL } from '../config/constants.js';

export abstract class BaseHttpService {
  protected client: AxiosInstance;
  protected session_cookies: Map<string, string> = new Map();

  constructor(base_url?: string) {
    this.client = axios.create({
      baseURL: base_url,
      timeout: 15000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        Referer: ANIME_BASE_URL,
      },
    });

    this.client.interceptors.response.use(
      (response) => {
        this.extractCookies(response);
        return response;
      },
      (error) => {
        if (error.response) {
          this.extractCookies(error.response);
        }
        return Promise.reject(error);
      }
    );
  }

  protected extractCookies(response: AxiosResponse): void {
    const raw_cookies = response.headers['set-cookie'];
    if (!raw_cookies) return;

    for (const cookie_str of raw_cookies) {
      const parts = cookie_str.split(';')[0]?.split('=');
      if (parts && parts.length >= 2 && parts[0] && parts[1]) {
        this.session_cookies.set(parts[0].trim(), parts[1].trim());
      }
    }
  }

  protected getCookieHeader(): string {
    const cookie_entries: string[] = [];
    for (const [key, val] of this.session_cookies.entries()) {
      cookie_entries.push(`${key}=${val}`);
    }
    return cookie_entries.join('; ');
  }

  protected async get<T = any>(
    url: string,
    config: AxiosRequestConfig = {}
  ): Promise<AxiosResponse<T>> {
    const cookie_header = this.getCookieHeader();
    const headers = {
      ...config.headers,
      ...(cookie_header ? { Cookie: cookie_header } : {}),
    };
    return this.client.get<T>(url, { ...config, headers });
  }

  protected async post<T = any>(
    url: string,
    data?: any,
    config: AxiosRequestConfig = {}
  ): Promise<AxiosResponse<T>> {
    const cookie_header = this.getCookieHeader();
    const headers = {
      ...config.headers,
      ...(cookie_header ? { Cookie: cookie_header } : {}),
    };
    return this.client.post<T>(url, data, { ...config, headers });
  }

  public async checkUrlAvailability(url: string): Promise<{
    available: boolean;
    status_code: number;
    content_type?: string;
    content_length?: number;
  }> {
    try {
      const head_res = await axios.head(url, {
        timeout: 8000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer:  ANIME_BASE_URL,
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 400,
      });

      const raw_type = head_res.headers['content-type'];
      const raw_len = head_res.headers['content-length'];
      const content_type = raw_type ? String(raw_type) : undefined;
      const content_length = raw_len ? parseInt(String(raw_len), 10) : undefined;

      return {
        available: true,
        status_code: head_res.status,
        content_type,
        content_length,
      };
    } catch {
      try {
        const get_res = await axios.get(url, {
          timeout: 8000,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Referer:  ANIME_BASE_URL,
            Range: 'bytes=0-10',
          },
          maxRedirects: 5,
          validateStatus: (status) => status < 400,
        });

        const raw_type = get_res.headers['content-type'];
        return {
          available: true,
          status_code: get_res.status,
          content_type: raw_type ? String(raw_type) : undefined,
        };
      } catch (err: any) {
        return {
          available: false,
          status_code: err.response?.status || 500,
        };
      }
    }
  }
}
