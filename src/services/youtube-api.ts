import { google, youtube_v3 } from 'googleapis';
import moment from 'moment';

export class YoutubeApi {
  public static getInstance(apiKey?: string): YoutubeApi {
    if (!YoutubeApi.instance) {
      if (!apiKey) throw new Error('API key required to make youtube API calls.');
      YoutubeApi.instance = new YoutubeApi(apiKey);
    }

    if (apiKey && YoutubeApi.instance.apiKey !== apiKey) {
      console.log('Switching to newly provide YouTube API key.');
      YoutubeApi.instance.apiKey = apiKey;
    }

    return YoutubeApi.instance;
  }

  private static instance: YoutubeApi;
  private readonly client: youtube_v3.Youtube;

  private constructor(private apiKey: string) {
    this.client = google.youtube({
      auth: this.apiKey,
      version: 'v3'
    });
  }

  public async getThumbnailUrl(videoId: string): Promise<string | void> {
    if (!videoId) throw new Error('Video ID required.');

    const response = await this.client.videos.list({
      hl: 'en',
      id: videoId,
      part: 'snippet'
    });

    const videos = response.data.items || [];
    if (videos.length > 0) {
      const snippet = videos[0].snippet;

      if (snippet && snippet.thumbnails) {
        const thumbnails = snippet.thumbnails;
        if (thumbnails.default) return Promise.resolve(thumbnails.default.url);
        if (thumbnails.medium) return Promise.resolve(thumbnails.medium.url);
        if (thumbnails.high) return Promise.resolve(thumbnails.high.url);
        if (thumbnails.standard) return Promise.resolve(thumbnails.standard.url);
        if (thumbnails.maxres) return Promise.resolve(thumbnails.maxres.url);
      }
    }

    return Promise.resolve();
  }

  public async get(videoId: string): Promise<VideoDetails | void> {
    if (!videoId) throw new Error('Video ID required.');

    const response = await this.client.videos.list({
      hl: 'en',
      id: videoId,
      part: 'snippet,contentDetails'
    });

    const videos = response.data.items || [];
    if (videos.length > 0) {
      const id = videos[0].id;
      const snippet = videos[0].snippet;
      const contentDetails = videos[0].contentDetails || {};

      if (id && snippet && snippet.title)
        return Promise.resolve({
          description: snippet.description,
          duration: moment.duration(contentDetails.duration).asSeconds(),
          id,
          title: snippet.title
        });
    }

    return Promise.resolve();
  }

  public async search(query: string, maxResults?: number): Promise<Video[]> {
    if (!query) throw new Error('Search string required.');

    const response = await this.client.search.list({
      maxResults: maxResults || 5,
      part: 'id,snippet',
      q: query,
      type: 'video'
    });

    const videos = new Array<Video>();
    if (response.data.items) {
      const items = response.data.items;
      for (const item of items) {
        const itemId = item.id;
        const snippet = item.snippet;
        if (itemId && itemId.videoId && snippet && snippet.title)
          videos.push({
            description: snippet.description,
            id: itemId.videoId,
            title: snippet.title
          });
      }
    }

    return Promise.resolve(videos);
  }
}

export type Video = {
  id: string;
  title: string;
  description?: string;
};

export type VideoDetails = {
  id: string;
  title: string;
  duration: number;
  description?: string;
};
