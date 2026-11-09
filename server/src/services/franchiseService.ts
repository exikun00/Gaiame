import axios from 'axios';
import prisma from './prisma.js';
import jkanimeScraper from './scraper.js';
import storageService from './storage.js';
import logger from '../utils/logger.js';
import { DEFAULT_USER_AGENT } from '../config/constants.js';

const ANILIST_GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';

export interface AniListMedia {
  id: number;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
    userPreferred?: string;
  };
  format: 'TV' | 'TV_SHORT' | 'ONA' | 'OVA' | 'SPECIAL' | 'MOVIE' | string;
  status: string;
  episodes?: number;
  seasonYear?: number;
  startDate?: {
    year?: number;
    month?: number;
    day?: number;
  };
  coverImage?: {
    large?: string;
    medium?: string;
  };
  relations?: {
    edges?: Array<{
      relationType: string;
      node: AniListMedia;
    }>;
  };
}

export interface ValidatedFranchiseItem {
  anilistId: number;
  jkanimeSlug: string;
  title: string;
  format: string;
  category: 'season' | 'movie' | 'ova' | 'special';
  seasonNumber?: number;
  year?: number;
  episodes?: number;
  status?: string;
  coverUrl: string;
  localCoverUrl?: string;
}

export interface FranchiseResult {
  franchiseName: string;
  seasons: ValidatedFranchiseItem[];
  movies: ValidatedFranchiseItem[];
  ovas: ValidatedFranchiseItem[];
  all: ValidatedFranchiseItem[];
}

const GENERIC_WORDS = new Set([
  'the', 'and', 'for', 'with', 'part', 'season', 'seasons', 'final', 'movie', 'movies',
  'ova', 'ovas', 'ona', 'onas', 'special', 'specials', 'spin', 'stage', 'anime', 'story',
  'chapter', 'arc', 'episode', 'episodes', 'version', 'second', 'third', 'fourth', 'first',
  'hen', 'dai', 'zoku', 'gekijouban', 'isekai', 'kara', 'hajimeru',
]);

const ALLOWED_RELATIONS = new Set([
  'PREQUEL', 'SEQUEL', 'PARENT', 'SPIN_OFF', 'SIDE_STORY', 'FULL_STORY', 'SUMMARY', 'ADAPTATION',
]);

const GRAPHQL_QUERY = `
fragment MediaFields on Media {
  id
  title {
    romaji
    english
    native
    userPreferred
  }
  format
  status
  episodes
  seasonYear
  startDate {
    year
    month
    day
  }
  coverImage {
    large
    medium
  }
}

query GetAnimeFranchise($search: String, $formats: [MediaFormat]) {
  Page(page: 1, perPage: 50) {
    media(search: $search, type: ANIME, format_in: $formats, sort: [START_DATE, POPULARITY_DESC]) {
      ...MediaFields
      relations {
        edges {
          relationType
          node {
            ...MediaFields
            relations {
              edges {
                relationType
                node {
                  ...MediaFields
                  relations {
                    edges {
                      relationType
                      node {
                        ...MediaFields
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`;

export class FranchiseService {
  /**
   * Normaliza un texto removiendo acentos y caracteres especiales.
   */
  public normalize(text?: string | null): string {
    if (!text) return '';
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Deriva el título base de una franquicia eliminando sufijos de temporadas, partes y películas.
   */
  public deriveBaseTitle(title?: string | null): string {
    if (!title) return '';
    let base = title.trim();

    // Eliminar marcadores comunes al final (2nd Season, Season 2, Part 2, etc.)
    base = base.replace(
      /\s*(?:\d+(?:st|nd|rd|th)\s+Season(?:\s+Part\s+\d+)?|Season\s+\d+(?:\s+Part\s+\d+)?|Part\s+\d+|Final\s+Season(?:\s+Part\s+\d+)?|(?:TV\s+)?(?:OVA|ONA|Specials?|Movies?|Recap)s?)\s*$/i,
      ''
    );
    // Eliminar números finales
    base = base.replace(/\s+(?:\d{1,2}|[IVX]{1,4})$/i, '');

    // Si tiene dos puntos con subtítulo, cortar en el primero salvo que sea muy corto
    if (base.includes(': ')) {
      const parts = base.split(': ');
      if (parts[0] && parts[0].length >= 3) {
        base = parts[0];
      }
    }

    base = base.replace(/[\s\-_:,]+$/, '');
    return base.length >= 3 ? base : title.trim();
  }

  /**
   * Extrae tokens significativos de una cadena para comparación difusa.
   */
  public extractTokens(text?: string | null): Set<string> {
    const norm = this.normalize(text);
    const raw_tokens = norm.split(/[^0-9a-z]+/);
    const tokens = new Set<string>();

    for (const t of raw_tokens) {
      if (t.length >= 3 && !GENERIC_WORDS.has(t)) {
        tokens.add(t);
      }
    }
    return tokens;
  }

  /**
   * Comprueba si dos títulos comparten suficientes tokens distintivos.
   */
  public sharesTokens(titleA: string, titleB: string, minShared: number = 2): boolean {
    const tokensA = this.extractTokens(titleA);
    const tokensB = this.extractTokens(titleB);
    let common = 0;

    for (const t of tokensA) {
      if (tokensB.has(t)) {
        common++;
      }
    }
    return common >= minShared;
  }

  /**
   * Extrae el número de temporada a partir de un título o slug.
   */
  public extractSeasonNumber(title?: string | null, slug?: string | null): number | undefined {
    const text = `${title || ''} ${slug || ''}`;
    const m =
      text.match(/(\d+)(?:st|nd|rd|th)?[\s\-_]+season/i) ||
      text.match(/season[\s\-_]+(\d+)/i) ||
      text.match(/temporada[\s\-_]+(\d+)/i) ||
      text.match(/[\s\-_]+(\d+)$/);
    return m && m[1] ? parseInt(m[1], 10) : undefined;
  }

  /**
   * Consulta GraphQL a AniList de forma segura con reintentos para rate limit (HTTP 429).
   * La estructura Page nunca arroja error 404 y entrega los resultados ordenados.
   */
  public async queryAniList(search: string): Promise<{ searchResults: AniListMedia[] }> {
    const variables = {
      search,
      formats: ['TV', 'TV_SHORT', 'ONA', 'OVA', 'SPECIAL', 'MOVIE'],
    };

    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        const response = await axios.post(
          ANILIST_GRAPHQL_ENDPOINT,
          { query: GRAPHQL_QUERY, variables },
          {
            timeout: 10000,
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'User-Agent': DEFAULT_USER_AGENT,
            },
          }
        );

        const data = response.data?.data;
        return {
          searchResults: data?.Page?.media || [],
        };
      } catch (err: any) {
        if (err.response?.status === 429) {
          const retryAfter = parseFloat(err.response.headers['retry-after'] || '2');
          logger.warn(`[FranchiseService] AniList 429 Rate Limit. Esperando ${retryAfter}s...`);
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        if (attempts >= 3) {
          logger.error({ error: err.message, search }, '[FranchiseService] Error consultando AniList GraphQL');
          return { searchResults: [] };
        }
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
    return { searchResults: [] };
  }

  private readonly ANIME_FORMATS = new Set(['TV', 'TV_SHORT', 'ONA', 'OVA', 'SPECIAL', 'MOVIE']);

  /**
   * Recorre recursivamente las relaciones de los nodos en AniList recolectando todos los elementos de la franquicia.
   */
  private collectMediaItems(searchResults: AniListMedia[], baseTitle: string): AniListMedia[] {
    const map = new Map<number, AniListMedia>();
    const visited = new Set<number>();

    const traverse = (node?: AniListMedia | null) => {
      if (!node || visited.has(node.id)) return;
      visited.add(node.id);

      if (this.ANIME_FORMATS.has(node.format)) {
        map.set(node.id, node);
      }

      if (node.relations?.edges) {
        for (const edge of node.relations.edges) {
          if (ALLOWED_RELATIONS.has(edge.relationType) && edge.node) {
            traverse(edge.node);
          }
        }
      }
    };

    for (const media of searchResults) {
      traverse(media);
    }

    // Filtrar elementos recolectados para asegurar pertenencia a la franquicia
    const filtered: AniListMedia[] = [];
    for (const media of map.values()) {
      const mediaTitle = media.title?.romaji || media.title?.english || media.title?.userPreferred || '';
      if (this.sharesTokens(mediaTitle, baseTitle, 1) || searchResults.some((sr) => sr.id === media.id)) {
        filtered.push(media);
      }
    }

    return filtered;
  }

  /**
   * Clasifica el formato de AniList en una de las 4 categorías clave.
   */
  private categorizeFormat(format: string): 'season' | 'movie' | 'ova' | 'special' {
    const f = (format || '').toUpperCase();
    if (f === 'TV' || f === 'TV_SHORT') return 'season';
    if (f === 'MOVIE') return 'movie';
    if (f === 'OVA' || f === 'ONA') return 'ova';
    return 'special';
  }

  /**
   * Emparejamiento biyectivo (1-a-1) ponderado por puntuación entre animes de JKAnime y nodos de AniList.
   */
  private matchFranchiseItems(
    jkanimeResults: { slug: string; title: string; poster_url: string; type?: string; status?: string }[],
    mediaItems: AniListMedia[],
    cleanSlug: string,
    localAnime: any,
    searchTitle: string
  ): ValidatedFranchiseItem[] {
    interface CandidatePair {
      jk: (typeof jkanimeResults)[0];
      m: AniListMedia;
      score: number;
    }

    const pairs: CandidatePair[] = [];

    for (const jk of jkanimeResults) {
      const jkNorm = this.normalize(jk.title).replace(/[^a-z0-9]/g, '');
      const jkSlugNorm = jk.slug.replace(/[^a-z0-9]/g, '');
      const jkSeason = this.extractSeasonNumber(jk.title, jk.slug);
      const jkIsMovie =
        /\b(movie|pel[ií]cula)\b/i.test(jk.title) || /(?:^|-)(movie|pelicula)(?:-|$)/i.test(jk.slug);
      const jkIsOva =
        /\b(ova|ona|special|kizuna|snow|annai|christmas)\b/i.test(jk.title) ||
        /(?:^|-)(ova|ona|special|kizuna|snow)(?:-|$)/i.test(jk.slug);

      for (const m of mediaItems) {
        const mRomaji = this.normalize(m.title?.romaji).replace(/[^a-z0-9]/g, '');
        const mEnglish = this.normalize(m.title?.english).replace(/[^a-z0-9]/g, '');
        const mPreferred = this.normalize(m.title?.userPreferred).replace(/[^a-z0-9]/g, '');
        const mSeason = this.extractSeasonNumber(m.title?.romaji, m.title?.english);
        const mIsMovie = m.format === 'MOVIE';
        const mIsOva = m.format === 'OVA' || m.format === 'ONA' || m.format === 'SPECIAL';

        let score = 0;

        // 1. Coincidencia exacta de títulos
        if (
          jkNorm === mRomaji ||
          jkNorm === mEnglish ||
          jkNorm === mPreferred ||
          jkSlugNorm === mRomaji ||
          jkSlugNorm === mEnglish
        ) {
          score = 1000;
        } else {
          // Puntuación por coincidencia de formato
          if (jkIsMovie && mIsMovie) {
            score += 100;
          } else if (jkIsOva && mIsOva) {
            score += 100;
          } else {
            if (jkIsMovie !== mIsMovie) score -= 300;
            if (jkIsOva !== mIsOva) score -= 200;
          }

          // Verificación estricta de número de temporada
          if (jkSeason !== undefined && mSeason !== undefined) {
            if (jkSeason === mSeason) {
              score += 400;
            } else {
              score -= 1000; // Penalización severa para no mezclar temporadas
            }
          }

          // Palabras clave distintivas de subtítulo/arco
          const keywords = [
            'santen',
            'sensou',
            'seiya',
            'kessen',
            'tenjiku',
            'shin',
            'henshuuban',
            'hyouketsu',
            'kizuna',
            'memory',
            'snow',
            'christmas',
            'annai',
          ];
          for (const kw of keywords) {
            const inJk = jkNorm.includes(kw) || jkSlugNorm.includes(kw);
            const inM = mRomaji.includes(kw) || mEnglish.includes(kw);
            if (inJk && inM) {
              score += 300;
            } else if (inJk && !inM && ['santen', 'seiya', 'tenjiku'].includes(kw)) {
              // Solo penalizar si es un arco argumental mayor de TV que no coincide
              score -= 300;
            }
          }

          // Similitud por tokens compartidos
          let commonTokens = 0;
          const tokens = this.extractTokens(jk.title);
          const mText = `${m.title?.romaji || ''} ${m.title?.english || ''}`;
          for (const t of tokens) {
            if (this.extractTokens(mText).has(t)) {
              commonTokens++;
            }
          }
          score += commonTokens * 40;
        }

        if (score >= 120) {
          pairs.push({ jk, m, score });
        }
      }
    }

    // Ordenar pares por puntuación descendente
    pairs.sort((a, b) => b.score - a.score);

    const assignedJk = new Set<string>();
    const assignedMedia = new Set<number>();
    const matchMap = new Map<string, AniListMedia>();

    for (const p of pairs) {
      if (!assignedJk.has(p.jk.slug) && !assignedMedia.has(p.m.id)) {
        assignedJk.add(p.jk.slug);
        assignedMedia.add(p.m.id);
        matchMap.set(p.jk.slug, p.m);
      }
    }

    const validatedItems: ValidatedFranchiseItem[] = [];

    for (const jk of jkanimeResults) {
      const matchedMedia = matchMap.get(jk.slug);

      let format = matchedMedia?.format;
      if (!format) {
        if (
          /\b(movie|pel[ií]cula)\b/i.test(jk.title) ||
          /(?:^|-)(movie|pelicula)(?:-|$)/i.test(jk.slug)
        )
          format = 'MOVIE';
        else if (
          /\b(ova|ona|special|kizuna|snow|annai|christmas)\b/i.test(jk.title) ||
          /(?:^|-)(ova|ona|special|kizuna|snow)(?:-|$)/i.test(jk.slug)
        )
          format = 'OVA';
        else format = 'TV';
      } else if (
        format === 'TV' &&
        (/\b(ova|ona|special|kizuna|snow|annai|christmas)\b/i.test(jk.title) ||
          /(?:^|-)(ova|ona|special|kizuna|snow)(?:-|$)/i.test(jk.slug))
      ) {
        format = 'OVA';
      }

      const category = this.categorizeFormat(format);
      let seasonNum = this.extractSeasonNumber(jk.title, jk.slug);
      if (seasonNum === undefined && category === 'season') {
        seasonNum = 1;
      }

      // Resolver fecha cronológica
      let year = matchedMedia?.startDate?.year || matchedMedia?.seasonYear;
      const month = matchedMedia?.startDate?.month || 1;
      const day = matchedMedia?.startDate?.day || 1;

      // Metadatos para entradas sin AniList directo (ej. Shin Henshuu-ban)
      if (!matchedMedia) {
        if (jk.slug.includes('shin-henshuuban')) {
          year = 2020;
        } else if (jk.slug === cleanSlug && localAnime?.aired) {
          const matchYear = localAnime.aired.match(/\b(19\d\d|20\d\d)\b/);
          if (matchYear && matchYear[1]) {
            year = parseInt(matchYear[1], 10);
          }
        }
      }

      const item: ValidatedFranchiseItem & { _sortKey?: number } = {
        anilistId: matchedMedia?.id || 0,
        jkanimeSlug: jk.slug,
        title: jk.title,
        format,
        category,
        seasonNumber: seasonNum,
        year,
        episodes: matchedMedia?.episodes,
        status: jk.status || matchedMedia?.status,
        coverUrl: matchedMedia?.coverImage?.large || jk.poster_url,
        _sortKey: (year || 9999) * 10000 + month * 100 + day,
      };

      if (!validatedItems.some((v) => v.jkanimeSlug === item.jkanimeSlug)) {
        validatedItems.push(item);
      }
    }

    // Asegurar que al menos el anime actual esté presente
    if (!validatedItems.some((v) => v.jkanimeSlug === cleanSlug)) {
      validatedItems.unshift({
        anilistId: 0,
        jkanimeSlug: cleanSlug,
        title: searchTitle,
        format: 'TV',
        category: 'season',
        seasonNumber: 1,
        coverUrl: localAnime?.posterUrl || '',
      });
    }

    // Ordenamiento cronológico estricto
    validatedItems.sort((a: any, b: any) => {
      const timeA = a._sortKey || (a.year || 9999) * 10000;
      const timeB = b._sortKey || (b.year || 9999) * 10000;
      if (timeA !== timeB) return timeA - timeB;
      return (a.seasonNumber || 1) - (b.seasonNumber || 1);
    });

    return validatedItems.map(({ _sortKey, ...rest }: any) => rest);
  }

  /**
   * Obtiene la franquicia completa de un anime, validando su disponibilidad real en JKAnime.
   * Utiliza caché en PostgreSQL si el anime está en la base de datos y los datos son íntegros.
   */
  public async getFranchise(slug: string, forceRefresh: boolean = false): Promise<FranchiseResult> {
    const clean_slug = slug.replace(/^\/+|\/+$/g, '');

    // 1. Verificar si existe en la base de datos local y tiene caché reciente e íntegra
    const localAnime = await prisma.anime.findUnique({
      where: { slug: clean_slug },
      include: {
        franchise: {
          include: {
            items: {
              orderBy: [{ year: 'asc' }, { seasonNumber: 'asc' }, { title: 'asc' }],
            },
          },
        },
      },
    });

    // Detectar si el caché previo sufre de colisión de carátulas o IDs repetidos para forzar refresco
    const cachedItems = localAnime?.franchise?.items || [];
    const hasCorruptedCache = cachedItems.some(
      (item, idx, arr) =>
        item.anilistId &&
        arr.some(
          (other, oIdx) =>
            oIdx !== idx && other.anilistId === item.anilistId && other.jkanimeSlug !== item.jkanimeSlug
        )
    );

    if (!forceRefresh && !hasCorruptedCache && localAnime?.franchise && cachedItems.length > 0) {
      const items: ValidatedFranchiseItem[] = cachedItems.map((i) => ({
        anilistId: i.anilistId || 0,
        jkanimeSlug: i.jkanimeSlug,
        title: i.title,
        format: i.format,
        category: i.category as any,
        seasonNumber: i.seasonNumber || undefined,
        year: i.year || undefined,
        episodes: i.episodes || undefined,
        status: i.status || undefined,
        coverUrl: i.coverUrl,
        localCoverUrl: i.localCoverUrl || undefined,
      }));

      return {
        franchiseName: localAnime.franchise.name,
        seasons: items.filter((i) => i.category === 'season'),
        movies: items.filter((i) => i.category === 'movie'),
        ovas: items.filter((i) => i.category === 'ova' || i.category === 'special'),
        all: items,
      };
    }

    // 2. Resolver título inicial (desde BD o scraping rápido)
    let searchTitle = localAnime?.title;
    if (!searchTitle) {
      const scraped = await jkanimeScraper.getAnimeDetails(clean_slug);
      searchTitle = scraped?.title || clean_slug.replace(/-/g, ' ');
    }

    const baseTitle = this.deriveBaseTitle(searchTitle);
    logger.info({ slug: clean_slug, searchTitle, baseTitle }, '[FranchiseService] Explorando franquicia en AniList');

    // 3. Petición 1: Consultar grafo de AniList con baseTitle
    let { searchResults } = await this.queryAniList(baseTitle);
    if (searchResults.length === 0 && baseTitle !== searchTitle) {
      const fallbackQuery = await this.queryAniList(searchTitle);
      searchResults = fallbackQuery.searchResults;
    }

    const mediaItems = this.collectMediaItems(searchResults, baseTitle);

    if (mediaItems.length === 0) {
      return {
        franchiseName: baseTitle,
        seasons: [],
        movies: [],
        ovas: [],
        all: [],
      };
    }

    // 4. Petición 2: Validar contra el inventario real de JKAnime con 1 sola búsqueda
    const cleanSearchToken = baseTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const { results: jkanimeResults } = await jkanimeScraper.searchAnime(cleanSearchToken);

    // Asegurar que el anime actual esté en los resultados de JKAnime para procesamiento uniforme
    if (!jkanimeResults.some((jk) => jk.slug === clean_slug)) {
      jkanimeResults.unshift({
        slug: clean_slug,
        title: searchTitle,
        poster_url: localAnime?.posterUrl || '',
        type: localAnime?.type || 'Serie',
        status: localAnime?.status || 'En emisión',
      });
    }

    // 5. Emparejamiento biyectivo 1-a-1 y ordenamiento cronológico
    const validatedItems = this.matchFranchiseItems(
      jkanimeResults,
      mediaItems,
      clean_slug,
      localAnime,
      searchTitle
    );

    // 6. Si el anime está en Watchlist o existe en BD, guardar/actualizar en PostgreSQL
    if (localAnime && localAnime.inWatchlist) {
      await this.persistFranchiseCache(baseTitle, clean_slug, validatedItems);
    }

    return {
      franchiseName: baseTitle,
      seasons: validatedItems.filter((i) => i.category === 'season'),
      movies: validatedItems.filter((i) => i.category === 'movie'),
      ovas: validatedItems.filter((i) => i.category === 'ova' || i.category === 'special'),
      all: validatedItems,
    };
  }

  /**
   * Guarda o actualiza la franquicia en la base de datos PostgreSQL.
   */
  public async persistFranchiseCache(
    baseTitle: string,
    rootSlug: string,
    items: ValidatedFranchiseItem[]
  ): Promise<void> {
    try {
      const franchise = await prisma.franchise.upsert({
        where: { name: baseTitle },
        update: {
          rootSlug,
          lastSyncedAt: new Date(),
        },
        create: {
          name: baseTitle,
          rootSlug,
          lastSyncedAt: new Date(),
        },
      });

      // Vincular el anime principal
      await prisma.anime.updateMany({
        where: { slug: rootSlug },
        data: { franchiseId: franchise.id },
      });

      // Upsert de cada elemento de la franquicia
      for (const item of items) {
        // Descarga de carátula local para animes de franquicia
        let localCover = item.localCoverUrl;
        if (!localCover && item.coverUrl) {
          try {
            localCover = (await storageService.saveAnimeCover(item.jkanimeSlug, item.coverUrl)) || undefined;
          } catch {
            // Ignorar fallo de cover opcional
          }
        }

        await prisma.franchiseItem.upsert({
          where: {
            franchiseId_jkanimeSlug: {
              franchiseId: franchise.id,
              jkanimeSlug: item.jkanimeSlug,
            },
          },
          update: {
            anilistId: item.anilistId || null,
            title: item.title,
            format: item.format,
            category: item.category,
            seasonNumber: item.seasonNumber,
            year: item.year,
            episodes: item.episodes,
            status: item.status,
            coverUrl: item.coverUrl,
            localCoverUrl: localCover,
          },
          create: {
            franchiseId: franchise.id,
            anilistId: item.anilistId || null,
            jkanimeSlug: item.jkanimeSlug,
            title: item.title,
            format: item.format,
            category: item.category,
            seasonNumber: item.seasonNumber,
            year: item.year,
            episodes: item.episodes,
            status: item.status,
            coverUrl: item.coverUrl,
            localCoverUrl: localCover,
          },
        });
      }

      logger.info({ franchise: baseTitle, count: items.length }, '[FranchiseService] Franquicia cacheada exitosamente');
    } catch (err) {
      logger.error({ error: err, baseTitle }, '[FranchiseService] Error persistiendo caché de franquicia');
    }
  }

  /**
   * Sincroniza todas las franquicias asociadas a animes en Watchlist (ejecutado a las 03:00 AM).
   */
  public async syncWatchlistFranchises(): Promise<void> {
    try {
      const watchlistAnimes = await prisma.anime.findMany({
        where: { inWatchlist: true },
        select: { slug: true, title: true },
      });

      logger.info({ count: watchlistAnimes.length }, '[FranchiseService] Sincronizando franquicias de watchlist...');
      for (const anime of watchlistAnimes) {
        await this.getFranchise(anime.slug, true);
        await new Promise((r) => setTimeout(r, 1000)); // Rate limit respetuoso
      }
    } catch (err) {
      logger.error({ error: err }, '[FranchiseService] Error en sincronización programada de franquicias');
    }
  }

  /**
   * Purga franquicias huérfanas si ningún anime de la franquicia está en watchlist ni tiene episodios descargados.
   */
  public async purgeOrphanFranchises(): Promise<number> {
    try {
      const franchises = await prisma.franchise.findMany({
        include: {
          animes: {
            include: {
              seasons: {
                include: {
                  episodes: true,
                },
              },
            },
          },
        },
      });

      let purged = 0;
      for (const f of franchises) {
        const hasActiveAnimes = f.animes.some(
          (a) =>
            a.inWatchlist ||
            a.seasons.some((s) => s.episodes.some((e) => e.downloadStatus === 'COMPLETED' || e.filePath))
        );

        if (!hasActiveAnimes) {
          await prisma.franchise.delete({ where: { id: f.id } });
          purged++;
        }
      }
      return purged;
    } catch (err) {
      logger.error({ error: err }, '[FranchiseService] Error purgando franquicias huérfanas');
      return 0;
    }
  }
}

export default new FranchiseService();
