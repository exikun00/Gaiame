import * as cheerio from 'cheerio';
import { BaseHttpService } from './baseHttp.js';
import logger from '../utils/logger.js';
import { ANIME_BASE_ORIGIN } from '../config/constants.js';

export interface AnimeSearchResult {
  slug: string;
  title: string;
  poster_url: string;
  type?: string;
  status?: string;
  synopsis?: string;
}

export interface HeroSlide {
  slug: string;
  title: string;
  backdrop_url: string;
  synopsis: string;
  type: string;
  status: string;
  details_slug: string;
  latest_episode?: number;
}

export interface RecentEpisodeRelease {
  slug: string;
  title: string;
  poster_url: string;
  episode_number: number;
  time_ago?: string;
}

export interface OvaRelease {
  slug: string;
  title: string;
  poster_url: string;
  episode_number: number;
  badge: string;
}

export interface HomePageContent {
  hero: HeroSlide[];
  recent_episodes: RecentEpisodeRelease[];
  ovas: OvaRelease[];
  trending: AnimeSearchResult[];
}

export interface AnimeDetails {
  slug: string;
  anime_id: number;
  title: string;
  poster_url: string;
  synopsis: string;
  genres: string[];
  status: string;
  type?: string;
  studios?: string;
  season_name?: string;
  languages?: string;
  episodes_count?: number;
  duration?: string;
  aired?: string;
  csrf_token: string;
  total_episodes?: number;
}

export interface ScrapedEpisode {
  id: number;
  number: number;
  title: string;
  image?: string;
  timestamp?: string;
}

export interface ScrapedServer {
  server: string;
  raw_url: string;
  slug: string;
  size?: string;
}

export class JkanimeScraper extends BaseHttpService {
  private base_url: string;
  private home_cache: HomePageContent | null = null;
  private home_cache_time: number = 0;
  private readonly HOME_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutos de caché en memoria

  private details_cache: Map<string, { timestamp: number; data: AnimeDetails }> = new Map();
  private episodes_cache: Map<number, { timestamp: number; total: number; last_page: number; pages: Map<number, ScrapedEpisode[]> }> = new Map();
  private readonly EPISODES_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos


  constructor() {
    const base_url = ANIME_BASE_ORIGIN;
    super(base_url);
    this.base_url = base_url;
  }

  public async searchAnime(query: string, _page: number = 1): Promise<{ results: AnimeSearchResult[]; total_pages: number }> {
    const clean_query = encodeURIComponent(query.trim().replace(/\s+/g, '_'));
    const target_url = `${this.base_url}/buscar/${clean_query}/`;

    try {
      const response = await this.get<string>(target_url);
      const $ = cheerio.load(response.data);
      const results: AnimeSearchResult[] = [];

      $('.anime__item').each((_, element) => {
        const link_el = $(element).find('a').first();
        const href = link_el.attr('href') || '';
        const slug = href.replace(this.base_url, '').replace(/^\/+|\/+$/g, '').split('/')[0] || '';

        const title = $(element).find('.anime__item__text h5 a').text().trim() ||
                      $(element).find('h5 a').text().trim() ||
                      link_el.text().trim();

        const pic_el = $(element).find('.anime__item__pic');
        const poster_url = pic_el.attr('data-setbg') || pic_el.find('img').attr('src') || '';
        
        // Extraer formato y estado de las etiquetas <li>
        const lis = $(element).find('.anime__item__text ul li').map((_, li) => $(li).text().trim()).get();
        let status = 'En emisión';
        let type = 'Serie';

        for (const item of lis) {
          if (/concluido/i.test(item)) status = 'Concluido';
          else if (/emisi[oó]n/i.test(item)) status = 'En emisión';
          else if (/pel[ií]cula|movie|ova|ona|especial|serie/i.test(item)) type = item;
        }

        const synopsis = $(element).find('.anime__item__text p').text().trim();

        if (slug && title) {
          results.push({
            slug,
            title,
            poster_url,
            type,
            status,
            synopsis,
          });
        }
      });

      // JKAnime muestra todos los resultados de búsqueda en una única vista
      let total_pages = 1;
      $('.pagination__page a, .navigation a').each((_, el) => {
        const p_num = parseInt($(el).text().trim(), 10);
        if (!isNaN(p_num) && p_num > total_pages) {
          total_pages = p_num;
        }
      });

      return { results, total_pages };
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return { results: [], total_pages: 1 };
      }
      console.error(`Error buscando anime "${query}":`, error);
      return { results: [], total_pages: 0 };
    }
  }

  /**
   * Extrae el contenido completo de la página de inicio (Hero slider, Episodios recientes, OVAs, Tendencias).
   * Utiliza caché en memoria de 3 minutos para ofrecer una respuesta instantánea.
   */
  public async getHomePageContent(): Promise<HomePageContent> {
    const now = Date.now();
    if (this.home_cache && now - this.home_cache_time < this.HOME_CACHE_TTL_MS) {
      return this.home_cache;
    }

    try {
      const response = await this.get<string>(`${this.base_url}/`);
      const $ = cheerio.load(response.data);

      // 1. Extraer Hero Slider
      const hero_items: HeroSlide[] = [];
      const seen_hero_slugs = new Set<string>();

      $('.hero__items').each((_, el) => {
        const backdrop_raw = $(el).attr('data-setbg') || $(el).attr('style') || '';
        const backdrop_match = backdrop_raw.match(/url\(["']?([^"']+)["']?\)/);
        const backdrop_url = backdrop_raw.startsWith('http')
          ? backdrop_raw
          : backdrop_match
            ? backdrop_match[1]
            : '';

        const title = $(el).find('h2').text().trim();
        const synopsis = $(el).find('p').text().trim();

        const badges = $(el).find('.ainfo span').map((_, s) => $(s).text().trim()).get();
        const type = badges[0] || 'Serie';
        const status = badges[1] || 'En emisión';

        // Enlaces: Detalles y Ver ahora
        let details_slug = '';
        let latest_episode: number | undefined;

        $(el).find('a').each((_, a_el) => {
          const href = $(a_el).attr('href') || '';
          const clean = href.replace(this.base_url, '').replace(/^\/+|\/+$/g, '');
          const parts = clean.split('/');

          if (parts.length === 1 && parts[0]) {
            details_slug = parts[0];
          } else if (parts.length >= 2 && parts[0] && parts[1]) {
            if (!details_slug) details_slug = parts[0];
            const ep_parsed = parseInt(parts[1], 10);
            if (!isNaN(ep_parsed)) latest_episode = ep_parsed;
          }
        });

        if (details_slug && title && !seen_hero_slugs.has(details_slug)) {
          seen_hero_slugs.add(details_slug);
          hero_items.push({
            slug: details_slug,
            title,
            backdrop_url: backdrop_url || `https://cdn.jkdesa.com/assets/images/animes/image/${details_slug}.jpg`,
            synopsis,
            type,
            status,
            details_slug,
            latest_episode,
          });
        }
      });

      // 2. Extraer Episodios Recientes (Tab 0: #animes / .tab-pane.fade.show.active)
      const recent_episodes: RecentEpisodeRelease[] = [];
      $('#animes a, .tab-content .tab-pane.active a, .tab-content .tab-pane.show.active a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const clean = href.replace(this.base_url, '').replace(/^\/+|\/+$/g, '');
        const parts = clean.split('/');

        if (parts.length >= 2 && parts[0] && parts[1]) {
          const slug = parts[0];
          const ep_num = parseInt(parts[1], 10);
          const title = $(el).find('h5, .card-title, .title').text().trim() || slug.replace(/-/g, ' ');
          const img_el = $(el).find('img');
          const poster_url = img_el.attr('data-animepic') || img_el.attr('src') || '';
          const time_ago = $(el).find('.badge-secondary').text().trim() || 'Reciente';

          if (slug && !isNaN(ep_num) && !recent_episodes.some((e) => e.slug === slug && e.episode_number === ep_num)) {
            recent_episodes.push({
              slug,
              title,
              poster_url,
              episode_number: ep_num,
              time_ago,
            });
          }
        }
      });

      // 3. Extraer OVAs y Especiales (Tab 3: #ovas)
      const ovas: OvaRelease[] = [];
      $('#ovas a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const clean = href.replace(this.base_url, '').replace(/^\/+|\/+$/g, '');
        const parts = clean.split('/');

        if (parts.length >= 1 && parts[0]) {
          const slug = parts[0];
          const ep_num = parts[1] ? parseInt(parts[1], 10) : 1;
          const title = $(el).find('h5, .card-title, .title').text().trim() || slug.replace(/-/g, ' ');
          const img_el = $(el).find('img');
          const poster_url = img_el.attr('data-animepic') || img_el.attr('src') || '';
          const badge = $(el).find('.badge-primary, .badges span').first().text().trim() || 'OVA';

          if (slug && !ovas.some((o) => o.slug === slug)) {
            ovas.push({
              slug,
              title,
              poster_url,
              episode_number: isNaN(ep_num) ? 1 : ep_num,
              badge,
            });
          }
        }
      });

      // 4. Extraer Tendencias / Animes Recientes (.trending_div)
      const trending: AnimeSearchResult[] = [];
      $('.trending_div a, .trending_div .item a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const clean = href.replace(this.base_url, '').replace(/^\/+|\/+$/g, '');
        const slug = clean.split('/')[0] || '';
        const img_el = $(el).find('img');
        const poster_url = img_el.attr('src') || img_el.attr('data-setbg') || '';
        const title = img_el.attr('alt') || $(el).text().trim() || slug.replace(/-/g, ' ');

        if (slug && !trending.some((t) => t.slug === slug)) {
          trending.push({
            slug,
            title,
            poster_url,
            type: 'Serie',
          });
        }
      });

      this.home_cache = {
        hero: hero_items,
        recent_episodes: recent_episodes.slice(0, 24),
        ovas: ovas.slice(0, 16),
        trending: trending.slice(0, 20),
      };
      this.home_cache_time = now;

      return this.home_cache;
    } catch (error) {
      logger.error({ error }, 'Error obteniendo contenido de inicio (Home)');
      // Si la llamada falla pero hay caché previa (aunque expirada), devolverla
      if (this.home_cache) return this.home_cache;
      return {
        hero: [],
        recent_episodes: [],
        ovas: [],
        trending: [],
      };
    }
  }

  public async getLatestReleases(): Promise<AnimeSearchResult[]> {
    try {
      const response = await this.get<string>(`${this.base_url}/`);
      const $ = cheerio.load(response.data);
      const results: AnimeSearchResult[] = [];

      // Extraer estrenos o episodios recientes de la portada
      $('.anime__item, .bloques__item').each((_, el) => {
        const link = $(el).find('a').first().attr('href') || '';
        const slug = link.replace(this.base_url, '').replace(/^\/+|\/+$/g, '').split('/')[0] || '';
        const title = $(el).find('h5, .title').text().trim();
        const poster_url = $(el).find('[data-setbg]').attr('data-setbg') || $(el).find('img').attr('src') || '';

        if (slug && title && !results.some((r) => r.slug === slug)) {
          results.push({
            slug,
            title,
            poster_url,
          });
        }
      });

      return results.slice(0, 20);
    } catch (error) {
      console.error('Error obteniendo últimos lanzamientos:', error);
      return [];
    }
  }

  public async getAnimeDetails(slug: string, force_refresh: boolean = false): Promise<AnimeDetails | null> {
    const clean_slug = slug.replace(/^\/+|\/+$/g, '');
    const now = Date.now();
    const cached = this.details_cache.get(clean_slug);
    if (!force_refresh && cached && now - cached.timestamp < this.EPISODES_CACHE_TTL_MS) {
      return cached.data;
    }

    const url = `${this.base_url}/${clean_slug}/`;

    try {
      const response = await this.get<string>(url);
      const html = response.data;
      const $ = cheerio.load(html);

      const title = $('.anime_info h3').text().trim() ||
                    $('.anime__details__title h3').text().trim() ||
                    $('meta[property="og:title"]').attr('content')?.split('-')[0]?.trim() ||
                    clean_slug.replace(/-/g, ' ');
      // Extraer sinopsis priorizando el contenedor específico y excluyendo botones de voto (.votar)
      let raw_synopsis = $('.sinopsis, .anime__details__text p, .anime_info p.scroll').first().text().trim();
      if (!raw_synopsis) {
        const cloned_info = $('.anime_info').clone();
        cloned_info.find('.votar').remove();
        raw_synopsis = cloned_info.find('p').first().text().trim() || $('.anime__details__text p').first().text().trim();
      }
      const synopsis = raw_synopsis.replace(/\s*Me gusta\s*$/i, '').trim();
      
      // Extraer portada principal priorizando og:image y contenedor principal para evitar falsos positivos con el sidebar
      const poster_url = $('meta[property="og:image"]').attr('content') ||
                         $('.anime_pic img, .movpic img, .anime__details__pic img').attr('src') ||
                         `https://cdn.jkdesa.com/assets/images/animes/image/${clean_slug}.jpg`;

      // Extraer datos del bloque .card.anime_data (soporta .pc y responsive)
      const data_card = $('.card.anime_data, .anime_data');

      const genres: string[] = [];
      data_card.find('a[href*="/genero/"]').each((_, el) => {
        const g = $(el).text().trim();
        if (g && !genres.includes(g)) genres.push(g);
      });
      if (genres.length === 0) {
        $('.anime__details__widget a[href*="/genero/"]').each((_, el) => {
          const g = $(el).text().trim();
          if (g && !genres.includes(g)) genres.push(g);
        });
      }

      // Estado: buscar clase 'enemision', 'finished' o texto en li usando únicamente la primera ocurrencia
      let status = 'En emisión';
      const status_badge = data_card.find('.enemision').first();
      if (status_badge.length > 0) {
        status = status_badge.text().trim();
      } else {
        data_card.find('li').each((_, el) => {
          const text = $(el).text();
          if (text.includes('Estado:')) {
            status = text.replace(/Estado:\s*/i, '').trim();
          }
        });
      }
      if (data_card.find('.finished').length > 0 || status.toLowerCase().includes('concluid')) {
        status = 'Concluido';
      }

      // Tipo (Serie, Película, OVA, etc.)
      let type: string | undefined = undefined;
      const tipo_li = data_card.find('li[rel="tipo"], li:contains("Tipo:")').first();
      if (tipo_li.length > 0) {
        type = tipo_li.text().replace(/Tipo:\s*/i, '').trim();
      }

      // Studios
      let studios: string | undefined = undefined;
      const studio_el = data_card.find('a[href*="/studio/"]');
      if (studio_el.length > 0) {
        studios = studio_el.first().text().trim();
      }

      // Temporada
      let season_name: string | undefined = undefined;
      const temporada_el = data_card.find('a[href*="/temporada/"]');
      if (temporada_el.length > 0) {
        season_name = temporada_el.first().text().trim();
      }

      // Idiomas
      let languages: string | undefined = undefined;
      const idiomas: string[] = [];
      data_card.find('a[href*="/idioma/"]').each((_, el) => {
        const lang = $(el).text().trim();
        if (lang && !idiomas.includes(lang)) idiomas.push(lang);
      });
      if (idiomas.length > 0) {
        languages = idiomas.join(', ');
      }

      // Episodios
      let episodes_count: number | undefined = undefined;
      data_card.find('li').each((_, el) => {
        const text = $(el).text();
        if (text.includes('Episodios:')) {
          const num = parseInt(text.replace(/Episodios:\s*/i, '').trim(), 10);
          if (!isNaN(num)) episodes_count = num;
        }
      });

      // Duración
      let duration: string | undefined = undefined;
      data_card.find('li').each((_, el) => {
        const text = $(el).text();
        if (text.includes('Duracion:') || text.includes('Duración:')) {
          duration = text.replace(/Duraci[oó]n:\s*/i, '').trim();
        }
      });

      // Emitido
      let aired: string | undefined = undefined;
      data_card.find('li').each((_, el) => {
        const text = $(el).text();
        if (text.includes('Emitido:')) {
          aired = text.replace(/Emitido:\s*/i, '').trim();
        }
      });

      const csrf_token = $('meta[name="csrf-token"]').attr('content') || '';

      // Extraer anime_id desde los scripts embebidos
      let anime_id = 0;
      const match_ep_url = html.match(/\/ajax\/episodes\/(\d+)\//);
      if (match_ep_url && match_ep_url[1]) {
        anime_id = parseInt(match_ep_url[1], 10);
      }

      if (!anime_id) {
        const match_data_id = html.match(/data-id="(\d+)"/);
        if (match_data_id && match_data_id[1]) {
          anime_id = parseInt(match_data_id[1], 10);
        }
      }

      if (!title) return null;

      let total_episodes = episodes_count || 0;
      if (anime_id && csrf_token) {
        try {
          const first_page = await this.getAnimeEpisodes(anime_id, 1, csrf_token);
          if (first_page.total > 0) {
            total_episodes = first_page.total;
            if (!episodes_count || episodes_count === 0) {
              episodes_count = first_page.total;
            }
          }
        } catch {
          // Si falla la obtención de página 1, continuar con episodes_count
        }
      }

      const details_result: AnimeDetails = {
        slug: clean_slug,
        anime_id,
        title,
        poster_url,
        synopsis,
        genres,
        status,
        type: type || 'Serie',
        studios,
        season_name,
        languages,
        episodes_count: episodes_count || total_episodes,
        duration,
        aired,
        csrf_token,
        total_episodes: total_episodes || episodes_count,
      };

      this.details_cache.set(clean_slug, { timestamp: now, data: details_result });
      return details_result;
    } catch (error) {
      console.error(`Error obteniendo detalles del anime "${slug}":`, error);
      return null;
    }
  }

  public async getAnimeEpisodes(anime_id: number, page: number, csrf_token: string): Promise<{
    episodes: ScrapedEpisode[];
    current_page: number;
    last_page: number;
    total: number;
  }> {
    const now = Date.now();
    const cached_anime = this.episodes_cache.get(anime_id);
    if (cached_anime && now - cached_anime.timestamp < this.EPISODES_CACHE_TTL_MS) {
      const cached_page = cached_anime.pages.get(page);
      if (cached_page) {
        return {
          episodes: cached_page,
          current_page: page,
          last_page: cached_anime.last_page,
          total: cached_anime.total,
        };
      }
    }

    const url = `${this.base_url}/ajax/episodes/${anime_id}/${page}`;

    try {
      const response = await this.post<{
        current_page: number;
        last_page?: number;
        total: number;
        data: Array<{ id: number; number: number; title: string; image?: string; timestamp?: string }>;
      }>(
        url,
        `_token=${encodeURIComponent(csrf_token)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
          },
        }
      );

      const json = response.data;
      const episodes: ScrapedEpisode[] = (json.data || []).map((ep) => {
        let image = ep.image;
        if (image && image.length > 5 && !image.startsWith('http')) {
          image = `https://cdn.jkdesa.com/assets/images/animes/video/image_thumb/${image}`;
        }
        return {
          id: ep.id,
          number: ep.number,
          title: ep.title,
          image,
          timestamp: ep.timestamp,
        };
      });

      const total = json.total || episodes.length;
      const last_page = json.last_page || Math.ceil(total / 16) || 1;

      // Guardar en caché
      let anime_entry = this.episodes_cache.get(anime_id);
      if (!anime_entry || now - anime_entry.timestamp >= this.EPISODES_CACHE_TTL_MS) {
        anime_entry = {
          timestamp: now,
          total,
          last_page,
          pages: new Map(),
        };
        this.episodes_cache.set(anime_id, anime_entry);
      } else {
        anime_entry.total = total;
        anime_entry.last_page = last_page;
      }
      anime_entry.pages.set(page, episodes);

      return {
        episodes,
        current_page: json.current_page || page,
        last_page,
        total,
      };
    } catch (error) {
      console.error(`Error obteniendo episodios ajax (anime_id: ${anime_id}, pag: ${page}):`, error);
      return { episodes: [], current_page: page, last_page: 1, total: 0 };
    }
  }

  /**
   * Obtiene un rango específico de episodios (por ejemplo capítulos 6 al 10 para PlayerPage).
   * Solo descarga/consulta las 1 o 2 páginas AJAX necesarias sin recorrer toda la serie.
   */
  public async getAnimeEpisodesRange(
    anime_id: number,
    csrf_token: string,
    start_num: number,
    end_num: number
  ): Promise<ScrapedEpisode[]> {
    if (start_num > end_num) return [];
    const start_page = Math.max(1, Math.ceil(start_num / 16));
    const end_page = Math.max(1, Math.ceil(end_num / 16));

    const result: ScrapedEpisode[] = [];
    for (let p = start_page; p <= end_page; p++) {
      const page_data = await this.getAnimeEpisodes(anime_id, p, csrf_token);
      for (const ep of page_data.episodes) {
        if (ep.number >= start_num && ep.number <= end_num) {
          result.push(ep);
        }
      }
    }
    return result.sort((a, b) => a.number - b.number);
  }

  public async getAllAnimeEpisodes(anime_id: number, csrf_token: string, max_pages = 5): Promise<ScrapedEpisode[]> {
    const first_batch = await this.getAnimeEpisodes(anime_id, 1, csrf_token);
    const all_episodes = [...first_batch.episodes];

    const limit = Math.min(first_batch.last_page, max_pages);
    for (let p = 2; p <= limit; p++) {
      const next_batch = await this.getAnimeEpisodes(anime_id, p, csrf_token);
      all_episodes.push(...next_batch.episodes);
    }

    return all_episodes.sort((a, b) => a.number - b.number);
  }

  public async getEpisodeServers(slug: string, episode_num: number): Promise<ScrapedServer[]> {
    const url = `${this.base_url}/${slug}/${episode_num}/`;

    try {
      const response = await this.get<string>(url);
      const html = response.data;
      const $ = cheerio.load(html);
      const servers: ScrapedServer[] = [];

      // Lista blanca estricta de servidores autorizados
      const ALLOWED_SERVERS = ['desu', 'magi', 'mediafire', 'mp4upload', 'mixdrop', 'vidhide', 'filemoon', 'voe', 'streamtape'];
      const isAllowedServer = (name: string): boolean => {
        const lower = name.toLowerCase().trim();
        if (lower.includes('desuka')) return false;
        return ALLOWED_SERVERS.some((allowed) => lower.includes(allowed));
      };

      // 1. Extraer pestañas del reproductor embebido (Desu, Magi)
      const player_tabs: { name: string; data_id: number }[] = [];
      $('.bg-servers a').each((i, el) => {
        const name = $(el).text().trim();
        const data_id = parseInt($(el).attr('data-id') || `${i}`, 10);
        if (name && isAllowedServer(name)) {
          player_tabs.push({ name, data_id });
        }
      });

      const video_array: Record<number, string> = {};
      const video_matches = html.matchAll(/video\[(\d+)\]\s*=\s*['"]<iframe[^>]*src=['"]([^'"]+)['"]/gi);
      for (const m of video_matches) {
        if (m[1] && m[2]) {
          video_array[parseInt(m[1], 10)] = m[2];
        }
      }

      player_tabs.forEach((tab, index) => {
        const embed_url = video_array[tab.data_id] ?? video_array[index];
        if (embed_url) {
          const full_url = embed_url.startsWith('//')
            ? `https:${embed_url}`
            : embed_url.startsWith('/')
            ? `${this.base_url}${embed_url}`
            : embed_url;

          servers.push({
            server: tab.name,
            raw_url: full_url,
            slug: `${slug}-${episode_num}-${tab.name.toLowerCase()}`,
          });
        }
      });

      // 2. Extraer servidores externos / descarga (var servers = [...])
      const match_servers = html.match(/var\s+servers\s*=\s*(\[\s*\{.*?\}\s*\]);/s);
      if (match_servers && match_servers[1]) {
        try {
          const raw_servers = JSON.parse(match_servers[1]);
          for (const item of raw_servers) {
            if (!item.remote || !item.server || !isAllowedServer(item.server)) continue;

            let decoded_url = '';
            try {
              decoded_url = Buffer.from(item.remote, 'base64').toString('utf-8').trim();
            } catch {
              decoded_url = item.remote;
            }

            // Normalizar formatos de embed para hosts conocidos
            const server_lower = item.server.toLowerCase();
            if (server_lower.includes('mixdrop')) {
              decoded_url = decoded_url.replace('/f/', '/e/');
            }

            if (!servers.some((s) => s.server.toLowerCase() === item.server.toLowerCase())) {
              servers.push({
                server: item.server,
                raw_url: decoded_url,
                slug: item.slug || '',
                size: item.size,
              });
            }
          }
        } catch (err) {
          logger.warn({ err }, 'Error parseando JSON de var servers');
        }
      }

      logger.info({ slug, episode_num, total_servers: servers.length }, 'Servidores autorizados extraídos exitosamente');
      return servers;
    } catch (error) {
      logger.error({ error, slug, episode_num }, `Error extrayendo servidores de ${slug} episodio ${episode_num}`);
      return [];
    }
  }
}

export const jkanimeScraper = new JkanimeScraper();
export default jkanimeScraper;
