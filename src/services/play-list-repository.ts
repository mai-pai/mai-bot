import { Database, Statement } from 'better-sqlite3';
import { Guild, GuildMember, Snowflake } from 'discord.js';
import { VideoDetails } from './youtube-api';

export type PlayListEntry = {
  id: number;
  song: VideoDetails;
};

export type QueueInfo = {
  current: PlayListEntry;
  entries: PlayListEntry[];
  next?: PlayListEntry;
  pageCount: number;
  pageNumber: number;
  previous?: PlayListEntry;
  totalDuration: number;
};

export class PlayListRepository {
  private upsertSongStmt: Statement;
  private deleteSongStmt: Statement;
  private deletePlaylistStmt: Statement;
  private deleteSeqStmt: Statement;
  private upsertSeqStmt: Statement;
  private selectAllSongStmt: Statement;
  private playlists: Map<Snowflake, PlayListEntry[]>;

  constructor(private database: Database) {
    this.database
      .prepare(
        'CREATE TABLE IF NOT EXISTS playlist (snowflake INTEGER, id INTEGER, info TEXT, PRIMARY KEY (snowflake, id))'
      )
      .run();
    this.selectAllSongStmt = this.database.prepare(
      'SELECT CAST(snowflake as TEXT) as snowflake, id, info FROM playlist WHERE snowflake = ? ORDER BY id ASC'
    );
    this.upsertSongStmt = this.database.prepare('INSERT OR REPLACE INTO playlist VALUES(?, ?, ?)');
    this.deleteSongStmt = this.database.prepare('DELETE FROM playlist WHERE snowflake = ? AND id = ?');
    this.deletePlaylistStmt = this.database.prepare('DELETE FROM playlist WHERE snowflake = ?');

    this.database.prepare('CREATE TABLE IF NOT EXISTS sequence (snowflake INTERGER PRIMARY KEY, sequence TEXT)').run();
    this.upsertSeqStmt = this.database.prepare('INSERT OR REPLACE INTO sequence VALUES(?, ?)');
    this.deleteSeqStmt = this.database.prepare('DELETE FROM sequence WHERE snowflake = ?');

    this.playlists = new Map<Snowflake, PlayListEntry[]>();
  }

  public hasSongs(snowflake: Snowflake | Guild | GuildMember): boolean {
    const id = this.getSnowflake(snowflake);
    const playlist = this.playlists.get(id);

    return !!(playlist && playlist.length > 0);
  }

  public addSong(snowflake: Snowflake | Guild | GuildMember, song: VideoDetails): PlayListEntry {
    const id = this.getSnowflake(snowflake);
    const playlist = this.playlists.get(id) as PlayListEntry[];
    const entry = { id: Date.now(), song };

    playlist.push(entry);
    this.upsertSongStmt.run(id, entry.id, JSON.stringify(song));

    return entry;
  }

  public removeSong(snowflake: Snowflake | Guild | GuildMember, songIndex: number): PlayListEntry | undefined {
    const id = this.getSnowflake(snowflake);
    const playlist = this.playlists.get(id) as PlayListEntry[];

    if (songIndex >= 0) {
      const removed = playlist.splice(songIndex, 1)[0];
      if (removed) {
        this.deleteSongStmt.run(id, removed.id);
        return removed;
      }
    }
  }

  public getSongAtIndex(snowflake: Snowflake | Guild | GuildMember, index: number): PlayListEntry | undefined {
    const id = this.getSnowflake(snowflake);
    const playlist = this.playlists.get(id) as PlayListEntry[];

    if (index < 0 || index >= playlist.length) return;

    return playlist[index];
  }

  public getNextSong(snowflake: Snowflake | Guild | GuildMember, current: PlayListEntry): PlayListEntry | undefined {
    const id = this.getSnowflake(snowflake);
    const playlist = this.playlists.get(id) as PlayListEntry[];

    if (playlist.length === 0) return;
    if (!current) return playlist[0];

    let index = playlist.findIndex(e => e.id === current.id);
    if (index < 0 || ++index === playlist.length) index = 0;

    return playlist[index];
  }

  public getPreviousSong(
    snowflake: Snowflake | Guild | GuildMember,
    current: PlayListEntry
  ): PlayListEntry | undefined {
    const id = this.getSnowflake(snowflake);
    const playlist = this.playlists.get(id) as PlayListEntry[];
    const index = playlist.findIndex(e => e.id === current.id);

    return index > 0 ? playlist[index - 1] : undefined;
  }

  public getQueue(
    snowflake: Snowflake | Guild | GuildMember,
    current: PlayListEntry,
    page: number = 1,
    pageSize: number = 10
  ): QueueInfo | undefined {
    const id = this.getSnowflake(snowflake);
    const playlist = this.playlists.get(id) as PlayListEntry[];
    const index = playlist.findIndex(e => e.id === current.id);

    if (playlist.length === 0 || index === -1) return;

    const songCount = playlist.length - index - 1; // Number of songs remaining, exclude the current song.
    const pageCount = Math.ceil(songCount / pageSize);
    const pageNumber = page > pageCount || page < 1 ? 1 : page;
    const queueStart = (pageNumber - 1) * pageSize + index + 1;
    const queue = queueStart < playlist.length ? playlist.slice(queueStart, queueStart + pageSize) : [];

    let totalDuration = 0;
    for (let i = queueStart; i < playlist.length; ++i) totalDuration += playlist[i].song.duration;

    return {
      current,
      entries: queue,
      next: index + 1 < playlist.length ? playlist[index + 1] : undefined,
      pageCount,
      pageNumber,
      previous: index > 0 ? playlist[index - 1] : undefined,
      totalDuration,
    };
  }

  public length(snowflake: Snowflake | Guild | GuildMember): number {
    const id = this.getSnowflake(snowflake);
    const playlist = this.playlists.get(id) as PlayListEntry[];

    return playlist.length;
  }

  public index(snowflake: Snowflake | Guild | GuildMember, entry: PlayListEntry): number {
    const id = this.getSnowflake(snowflake);
    const playlist = this.playlists.get(id) as PlayListEntry[];

    return playlist.findIndex(e => e.id === entry.id);
  }

  private getSnowflake(snowflake: Snowflake | Guild | GuildMember): Snowflake {
    let id: Snowflake | undefined;
    if (snowflake instanceof Guild || snowflake instanceof GuildMember) id = snowflake.id;
    else id = snowflake;

    if (!this.playlists.has(id)) {
      const rows = this.selectAllSongStmt.all(id);
      const playlist: PlayListEntry[] = [];

      // tslint:disable-next-line
      for (const row of rows) {
        try {
          const song = JSON.parse(row.info);
          playlist.push({ id: row.id, song });
        } catch (err) {
          console.log(`Unable to parse song info: ${row.info}`);
        }
      }

      this.playlists.set(id, playlist);
    }

    return id;
  }
}
