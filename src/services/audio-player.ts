import { Guild, GuildMember, Message, Snowflake, TextChannel, VoiceConnection } from 'discord.js';
import moment from 'moment';
import { Readable } from 'stream';
import ytdl, { videoFormat, videoInfo } from 'ytdl-core';
import { MaiBot } from '../bot/mai-bot';
import { PlayListEntry, PlayListRepository, QueueInfo } from './play-list-repository';
import { SettingsRespository, SettingType } from './settings-repository';
import { VideoDetails } from './youtube-api';

type PlayerInfo = {
  player: AudioPlayer;
  entry: PlayListEntry;
  connection: VoiceConnection;
  playMessage?: Message;
  stream?: Readable;
  ytdlInfo?: videoInfo;
  ytdlFormat?: videoFormat;
};

type CurrentSongInfo = {
  song: VideoDetails;
  requestedBy?: Snowflake;
  songNumber: number;
};

enum VoiceStatus {
  CONNECTED = 0,
  CONNECTING = 1,
  AUTHENTICATING = 2,
  RECONNECTING = 3,
  DISCONNECTED = 4
}

export class AudioPlayer {
  private playing: Map<Snowflake, PlayerInfo>;
  private settings: SettingsRespository;
  private order: Map<Snowflake, number[]>;
  private playlist: PlayListRepository;

  constructor(private bot: MaiBot) {
    this.settings = this.bot.settings;
    this.playlist = new PlayListRepository(this.bot.database);
    this.playing = new Map<Snowflake, PlayerInfo>();
    this.order = new Map<Snowflake, number[]>();
  }

  public play(message: Message): boolean {
    const guild = message.guild.id;
    const playlistId = this.settings.get(guild, SettingType.PlaylistId, guild);

    if (this.isPlaying(guild) || this.isPaused(guild) || !this.playlist.hasSongs(playlistId)) return false;

    let info = this.playing.get(guild);
    if (!info) {
      const songIndex = this.settings.get(guild, SettingType.SongIndex, 0);
      const song = this.playlist.getSongAtIndex(playlistId, songIndex);
      if (!song) return false;

      info = { player: this, entry: song, connection: message.guild.voiceConnection };
      this.playing.set(guild, info);
    }

    this.connect(message, info);
    return true;
  }

  public addSong(message: Message, song: VideoDetails): number {
    const guild = message.guild.id;
    const user = message.author.id;
    const playlistId = this.settings.get(guild, SettingType.PlaylistId, guild);

    this.playlist.addSong(playlistId, user, song);
    if (!this.isPlaying(guild) && !this.isPaused(guild)) this.play(message);

    return this.playlist.length(playlistId);
  }

  public removeSong(guild: Snowflake, songNumber: number): PlayListEntry | undefined {
    const playlistId = this.settings.get(guild, SettingType.PlaylistId, guild);
    const info = this.playing.get(guild);
    if (info) {
      const index = this.playlist.index(playlistId, info.entry);
      if (songNumber === index + 1 || songNumber === 0) {
        this.skip(guild);
        return this.playlist.removeSong(playlistId, index);
      }
    }

    if (songNumber > 0) return this.playlist.removeSong(playlistId, songNumber - 1);
  }

  public pause(guild: Snowflake): void {
    const info = this.playing.get(guild);

    if (info && info.connection) info.connection.dispatcher.pause();
  }

  public resume(guild: Snowflake): void {
    const info = this.playing.get(guild);

    if (info && info.connection) info.connection.dispatcher.resume();
  }

  public stop(guild: Snowflake): void {
    const info = this.playing.get(guild);

    if (info) {
      this.playing.delete(guild);

      if (info.connection) {
        info.connection.dispatcher.removeAllListeners();
        info.connection.dispatcher.end();
        info.connection.removeAllListeners();
      }
      if (info.playMessage) info.playMessage.delete();
      if (info.stream) info.stream.destroy();
    }
  }

  public skip(guild: Snowflake, songNumber?: number): boolean {
    const playlistId = this.settings.get(guild, SettingType.PlaylistId, guild);
    const info = this.playing.get(guild);

    if (!info || !info.connection || !info.connection.dispatcher) return false;
    if (songNumber === undefined || songNumber === null) songNumber = 0;
    if (songNumber < 0 || songNumber > this.playlist.length(playlistId)) return false;

    const index = this.playlist.index(playlistId, info.entry);
    if (songNumber === index + 1) return false;
    if (songNumber > 0 && songNumber !== index + 2) {
      info.connection.dispatcher.removeAllListeners();
      info.connection.dispatcher.end();

      const entry = this.playlist.getSongAtIndex(playlistId, songNumber - 1);
      if (entry) info.entry = entry;

      this.voiceConnected.apply(info, [info.connection]);
    } else info.connection.dispatcher.end();

    return true;
  }

  public isPlaying(guild: Snowflake): boolean {
    const info = this.playing.get(guild);
    return !!(info && info.connection && info.connection.dispatcher && !info.connection.dispatcher.destroyed);
  }

  public isPaused(guild: Snowflake): boolean {
    const info = this.playing.get(guild);
    return !!(info && info.connection && info.connection.dispatcher && info.connection.dispatcher.paused);
  }

  public isInRange(guild: Snowflake, songNumber: number): boolean {
    const playlistId = this.settings.get(guild, SettingType.PlaylistId, guild);
    const songIndex = songNumber - 1;
    return songIndex >= 0 && songIndex < this.playlist.length(playlistId);
  }

  public getQueue(message: Message, pageNumber: number): QueueInfo | undefined {
    const guild = message.guild.id;
    const playlistId = this.settings.get(guild, SettingType.PlaylistId, guild);
    const info = this.playing.get(guild);
    if (!info) return;

    return this.playlist.getQueue(playlistId, info.entry, pageNumber);

    // const entry = this.playlist.getSongAtIndex(guild, 25) as PlayListEntry;
    // return this.playlist.getQueue(guild, entry, pageNumber);
  }

  public getCurrent(guild: Snowflake): CurrentSongInfo | undefined {
    const playlistId = this.settings.get(guild, SettingType.PlaylistId, guild);
    const info = this.playing.get(guild);

    if (!info) return;

    return {
      requestedBy: info.entry.requestedBy,
      song: info.entry.song,
      songNumber: this.playlist.index(playlistId, info.entry) + 1
    };

    // const entry = this.playlist.getSongAtIndex(guild, 0) as PlayListEntry;
    // return {song: entry.song, requestedBy: entry.requestedBy, songNumber: this.playlist.index(guild, entry) + 1}
  }

  public getTime(guild: Snowflake): number {
    const info = this.playing.get(guild);
    if (!info || !info.connection || !info.connection.dispatcher) return 0;

    return info.connection.dispatcher.time;
  }

  public save(guild: Snowflake, snowflake: Snowflake): Error | undefined {
    const playlistId = this.settings.get(guild, SettingType.PlaylistId, guild);
    if (playlistId === snowflake) return new Error("Can't over-write playlist with itself!");

    const err = this.playlist.save(playlistId, snowflake);
    if (err) return err;

    this.settings.set(guild, SettingType.PlaylistId, snowflake);
  }

  public load(message: Message, snowflake?: Snowflake | undefined): Error | undefined {
    const guild = message.guild.id;
    const playlistId = this.settings.get(guild, SettingType.PlaylistId, guild);
    const idToLoad = snowflake ? snowflake : guild;

    if (playlistId === idToLoad) return new Error('Playlist already loaded!');

    const err = this.playlist.load(playlistId, idToLoad);
    if (err) return err;

    this.settings.set(guild, SettingType.PlaylistId, idToLoad);
    this.settings.set(guild, SettingType.SongIndex, 0);
    this.stop(guild);
    this.play(message);
  }

  public clear(guild: Snowflake): Error | undefined {
    const playlistId = this.settings.get(guild, SettingType.PlaylistId, guild);
    const err = this.playlist.clear(playlistId);

    if (err) return err;

    this.stop(guild);
    this.settings.set(guild, SettingType.SongIndex, 0);
  }

  private connect(message: Message, info: PlayerInfo) {
    const connection = message.guild.voiceConnection;
    if (!connection || connection.status === VoiceStatus.DISCONNECTED) {
      console.log('No voice connection, joining voice channel....');
      const voiceConnected = this.voiceConnected.bind(info);
      message.member.voiceChannel.join().then(voiceConnected);
    } else {
      console.log('Using existing voice connection....');
      this.voiceConnected.apply(info, [connection]);
    }
  }

  private voiceConnected(this: PlayerInfo, connection: VoiceConnection): void {
    if (connection.status !== VoiceStatus.CONNECTED) {
      console.log(`Voice connection not in connected state. Status: ${connection.status}`);
      return;
    }

    const guild = connection.channel.guild.id;
    const player = this.player;
    const info = player.playing.get(guild);
    if (!info || !info.entry) return;

    if (info.connection !== connection) {
      info.connection = connection;
      connection.once('disconnect', (err: Error) => {
        console.log('Voice connection disconnected.');
        if (err) {
          console.log('Disconnect was not requested!');
          console.log(err);
        }
      });
    }

    if (player.bot.debug)
      console.log(`Started downloading: ${info.entry.song.title}`);
    info.stream = ytdl(info.entry.song.id, { filter: 'audioonly', highWaterMark: 0x100000 /* 1 MB */ });
    info.stream.once('info', player.streamInfo.bind(info));
    info.stream.once('error', player.streamError.bind(info));
    if (player.bot.debug)
        info.stream.on('progress', player.streamProgress);
    info.stream.once('response', () => {
      const dispatcher = connection.playStream(info.stream as Readable);
      dispatcher.once('start', player.dispatcherStarted.bind(info));
      dispatcher.once('error', player.dispatcherError);
      dispatcher.on('debug', player.dispatcherDebug);
      dispatcher.on('end', player.dispatcherEnded.bind(info));
    });
  }

  private streamInfo(this: PlayerInfo, info: videoInfo, format: videoFormat): void {
    this.ytdlInfo = info;
    this.ytdlFormat = format;
  }

  private streamError(this: PlayerInfo, error: Error): void {
    console.log('Error occurred in youtube stream!');
    console.log(error);

    this.player.dispatcherEnded.apply(this, [`${error.message}`]);
  }

  private streamProgress(chunkLength: number, downloaded: number, size: number): void {
    console.log(`Downloaded: ${downloaded}/${size}`);
  }

  private dispatcherStarted(this: PlayerInfo): void {
    const guild = this.connection.channel.guild;
    const settings = this.player.settings;
    const npm = settings.get(guild, SettingType.ShowPlayingMessage, false);
    const tcId = settings.get(guild, SettingType.TextChannel, undefined);
    const tc = guild.channels.find(c => c.type === 'text' && c.id === tcId) as TextChannel;

    console.log(`Now playing ${this.entry.song.title}`);
    this.player.bot.setActivity(this.entry.song.title, { type: 'LISTENING' });
    if (npm && tc) {
      let promise: Promise<any> = Promise.resolve();
      if (this.playMessage) {
        promise = this.playMessage.delete();
        this.playMessage = undefined;
      }

      promise.then(() => {
        tc.send(
          `:musical_note: **Now playing** \`${this.entry.song.title} (${moment()
            .startOf('day')
            .seconds(this.entry.song.duration)
            .format('HH:mm:ss')})\``
        ).then((message: Message | Message[]) => {
          this.playMessage = Array.isArray(message) ? message[0] : message;
        }); // Add song run time
      });
    }
  }

  private dispatcherError(error: Error): void {
    console.log('Error occurred in dispatcher!');
    console.log(error);
  }

  private dispatcherDebug(information: string): void {
    console.log(`Dispatcher debug: ${information}`);
  }

  private dispatcherEnded(this: PlayerInfo, reason: string) {
    console.log(`Finished playing ${this.entry.song.title}`);
    if ((reason && !reason.startsWith('Stream is not generating quickly enough.') && !reason.startsWith('user')) || this.player.bot.debug)
      console.log(`Dispatcher ended with reason: ${reason}`);

    if (this.stream) {
      this.stream.removeListener('progress', this.player.streamProgress);
      this.stream.destroy();
      this.stream = undefined;
    }

    if (this.connection && this.connection.status === VoiceStatus.CONNECTED) {
      const guild = this.connection.channel.guild.id;
      const player = this.player;
      const playlist = player.playlist;

      const repeat = player.settings.get(guild, SettingType.Repeat, false);
      const playlistId = player.settings.get(guild, SettingType.PlaylistId, guild);
      const length = playlist.length(playlistId);
      const index = playlist.index(playlistId, this.entry);
      const hasNext = index + 1 < length;
      if (hasNext || repeat) {
        const songIndex = hasNext ? index + 1 : 0;
        this.entry = playlist.getSongAtIndex(playlistId, songIndex) as PlayListEntry;

        player.settings.set(guild, SettingType.SongIndex, songIndex);
        setTimeout(player.voiceConnected.bind(this), 0, this.connection);
      } else player.settings.reset(guild, SettingType.SongIndex);
    } else {
      console.log('The connection undefined for the player info upon dispatcher ending!');
      console.log('Something must have when seriously wrong.');
    }
  }
}
