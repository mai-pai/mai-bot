import { Stream } from "stream";

export = miniget;

interface MiniGetOptions {
  maxRedirect?: number,
  maxRetries?: number,
  maxReconnects?: number,
  highWaterMark?: number
}

declare function miniget(url: string, options?: MiniGetOptions): Stream;
