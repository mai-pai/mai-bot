import { Database, Statement } from 'better-sqlite3';
import { Guild, GuildMember, Snowflake } from 'discord.js';
import { VideoDetails } from './youtube-api';

export type PlayListEntry = {
  id: number;
  song: VideoDetails;
  requestedBy?: Snowflake;
};

export type QueueInfo = {
  current: PlayListEntry;
  entries: PlayListEntry[];
  pageCount: number;
  pageNumber: number;
  pageSize: number;
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

  public hasSongs(playlistId: Snowflake | Guild | GuildMember): boolean {
    const id = this.initialize(playlistId);
    const playlist = this.playlists.get(id);

    return !!(playlist && playlist.length > 0);
  }

  public addSong(
    playlistId: Snowflake | Guild | GuildMember,
    requestedBy: Snowflake | GuildMember,
    song: VideoDetails
  ): PlayListEntry {
    const id = this.initialize(playlistId);
    const userId = this.getSnowflake(requestedBy) as Snowflake;
    const playlist = this.playlists.get(id) as PlayListEntry[];
    const entry = { id: Date.now(), song, requestedBy: userId };

    playlist.push(entry);
    this.upsertSongStmt.run(id, entry.id, JSON.stringify(entry));

    return entry;
  }

  public removeSong(playlistId: Snowflake | Guild | GuildMember, songIndex: number): PlayListEntry | undefined {
    const id = this.initialize(playlistId);
    const playlist = this.playlists.get(id) as PlayListEntry[];

    if (songIndex >= 0) {
      const removed = playlist.splice(songIndex, 1)[0];
      if (removed) {
        this.deleteSongStmt.run(id, removed.id);
        return removed;
      }
    }
  }

  public getSongAtIndex(playlistId: Snowflake | Guild | GuildMember, index: number): PlayListEntry | undefined {
    const id = this.initialize(playlistId);
    const playlist = this.playlists.get(id) as PlayListEntry[];

    if (index < 0 || index >= playlist.length) return;

    return playlist[index];
  }

  public getNextSong(playlistId: Snowflake | Guild | GuildMember, current: PlayListEntry): PlayListEntry | undefined {
    const id = this.initialize(playlistId);
    const playlist = this.playlists.get(id) as PlayListEntry[];

    if (playlist.length === 0) return;
    if (!current) return playlist[0];

    let index = playlist.findIndex(e => e.id === current.id);
    if (index < 0 || ++index === playlist.length) index = 0;

    return playlist[index];
  }

  public getPreviousSong(
    playlistId: Snowflake | Guild | GuildMember,
    current: PlayListEntry
  ): PlayListEntry | undefined {
    const id = this.initialize(playlistId);
    const playlist = this.playlists.get(id) as PlayListEntry[];
    const index = playlist.findIndex(e => e.id === current.id);

    return index > 0 ? playlist[index - 1] : undefined;
  }

  public getQueue(
    playlistId: Snowflake | Guild | GuildMember,
    current: PlayListEntry,
    page: number = 1,
    pageSize: number = 10
  ): QueueInfo | undefined {
    const id = this.initialize(playlistId);
    const playlist = this.playlists.get(id) as PlayListEntry[];
    const index = playlist.findIndex(e => e.id === current.id);

    if (playlist.length === 0 || index === -1) return;
    const pageCount = Math.ceil(playlist.length / pageSize);
    const pageNumber = page === 0 ? Math.floor(index / pageSize) + 1 : page > pageCount || page < 1 ? 1 : page;
    const queueStart = (pageNumber - 1) * pageSize;
    const queue = queueStart < playlist.length ? playlist.slice(queueStart, queueStart + pageSize) : [];

    // console.log(`# of Songs: ${playlist.length}, Page: ${pageNumber}`);
    let totalDuration = 0;
    for (const entry of playlist) totalDuration += entry.song.duration;

    return {
      current,
      entries: queue,
      pageCount,
      pageNumber,
      pageSize,
      totalDuration
    };
  }

  public length(playlistId: Snowflake | Guild | GuildMember): number {
    const id = this.initialize(playlistId);
    const playlist = this.playlists.get(id) as PlayListEntry[];

    return playlist.length;
  }

  public index(playlistId: Snowflake | Guild | GuildMember, entry: PlayListEntry): number {
    const id = this.initialize(playlistId);
    const playlist = this.playlists.get(id) as PlayListEntry[];

    return playlist.findIndex(e => e.id === entry.id);
  }

  public save(
    playlistId: Snowflake | Guild | GuildMember,
    snowflake: Snowflake | Guild | GuildMember
  ): Error | undefined {
    if (playlistId === snowflake) return new Error("Can't over-write playlist with itself!");

    const id = this.initialize(playlistId);
    const saveId = this.getSnowflake(snowflake);
    const playlist = this.playlists.get(id) as PlayListEntry[];

    if (playlist.length === 0) return new Error('There are no song(s) to save!');

    this.database.prepare('BEGIN').run();
    this.database.prepare('DELETE FROM playlist WHERE snowflake = ?').run(saveId);
    const insertStmt = this.database.prepare('INSERT INTO playlist VALUES(?, ?, ?)');
    for (const entry of playlist) insertStmt.run(saveId, entry.id, JSON.stringify(entry));

    this.playlists.delete(id);
    this.playlists.set(saveId, playlist);
    this.database.prepare('COMMIT').run();
  }

  public load(playlistId: Snowflake, snowflake: Snowflake): Error | undefined {
    if (playlistId === snowflake) return new Error('Playlist already loaded!');
    const id = this.getSnowflake(playlistId);
    this.initialize(snowflake);

    this.playlists.delete(id);
  }

  public clear(playlistId: Snowflake): Error | undefined {
    const id = this.getSnowflake(playlistId);

    if (!this.playlists.has(id)) return new Error('The playlist to clear does not exist.');

    this.playlists.delete(id);
    this.deletePlaylistStmt.run(id);
  }

  private getSnowflake(snowflake: Snowflake | Guild | GuildMember): Snowflake {
    return snowflake instanceof Guild || snowflake instanceof GuildMember ? snowflake.id : snowflake;
  }

  private initialize(snowflake: Snowflake | Guild | GuildMember): Snowflake {
    const id = this.getSnowflake(snowflake);

    if (!this.playlists.has(id)) {
      const rows = this.selectAllSongStmt.all(id);
      const playlist: PlayListEntry[] = [];

      // tslint:disable-next-line
      for (const row of rows) {
        try {
          const song = JSON.parse(row.info);
          if (song.title) playlist.push({ id: row.id, song });
          else playlist.push(song);
        } catch (err) {
          console.log(`Unable to parse song info: ${row.info}`);
        }
      }

      this.playlists.set(id, playlist);
    }

    return id;
  }
}
