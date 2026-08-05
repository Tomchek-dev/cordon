import { Injectable, Logger } from '@nestjs/common';

export interface GifResult {
  id: string;
  previewUrl: string;
  url: string;
  description: string;
}

interface TenorSearchResponse {
  results: {
    id: string;
    content_description: string;
    media_formats: {
      gif: { url: string };
      tinygif: { url: string };
    };
  }[];
}

@Injectable()
export class GifsService {
  private readonly logger = new Logger(GifsService.name);

  isEnabled(): boolean {
    return !!process.env.TENOR_API_KEY;
  }

  async search(query: string): Promise<GifResult[]> {
    const key = process.env.TENOR_API_KEY;
    if (!key) return [];

    const params = new URLSearchParams({
      q: query,
      key,
      client_key: 'cordon',
      limit: '20',
      media_filter: 'gif',
    });

    const res = await fetch(`https://tenor.googleapis.com/v2/search?${params.toString()}`);
    if (!res.ok) {
      this.logger.warn(`Tenor search failed: ${res.status}`);
      return [];
    }

    const body = (await res.json()) as TenorSearchResponse;
    return body.results.map((r) => ({
      id: r.id,
      previewUrl: r.media_formats.tinygif.url,
      url: r.media_formats.gif.url,
      description: r.content_description,
    }));
  }
}
