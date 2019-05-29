import { Database, Statement } from 'better-sqlite3';
import { Guild, Snowflake } from 'discord.js';

export enum SettingType {
  Role = 'role',
  TextChannel = 'textChannel',
  VoiceChannel = 'voiceChannel',
  Repeat = 'repeat',
  ShowPlayingMessage = 'showPlayingMessage',
  Prefix = 'prefix',
  SongIndex = 'songIndex',
  PlaylistId = 'playlistId'
}

type Settings = { [index in SettingType]?: any };

export class SettingsRespository {
  public static readonly DefaultPrefix: string = '>';

  private insertOrReplaceStmt!: Statement;
  private deleteStmt!: Statement;
  private settings!: Map<Snowflake, Settings>;

  constructor(private database: Database) {
    this.database.prepare('CREATE TABLE IF NOT EXISTS settings (guild INTEGER PRIMARY KEY, settings TEXT)').run();
    this.insertOrReplaceStmt = this.database.prepare('INSERT OR REPLACE INTO settings VALUES(?, ?)');
    this.deleteStmt = this.database.prepare('DELETE FROM settings WHERE guild = ?');
    this.settings = new Map<Snowflake, any>();

    const rows = this.database.prepare('SELECT CAST(guild as TEXT) as guild, settings FROM settings').all();
    for (const row of rows) {
      let settings;
      try {
        settings = JSON.parse(row.settings);
      } catch (err) {
        console.log(`Settings repository couldn't parse the settings stored for guild ${row.guild}.`);
        continue;
      }

      this.setGuildSettings(row.guild, settings);
    }
  }

  public get(guild: Snowflake | Guild, key: SettingType, defaultValue: any): any {
    const settings = this.getGuildSettings(guild);
    return settings ? (typeof settings[key] !== 'undefined' ? settings[key] : defaultValue) : defaultValue;
  }

  public set(guild: Snowflake | Guild, key: SettingType, value: any): any {
    let settings: Settings | undefined = this.getGuildSettings(guild);

    if (!settings) {
      settings = {};
      this.setGuildSettings(guild, settings);
    }

    settings[key] = value;
    this.insertOrReplaceStmt.run(guild, JSON.stringify(settings));

    return value;
  }

  public reset(guild: Snowflake | Guild, key: SettingType): any {
    const settings = this.getGuildSettings(guild);
    if (!settings || typeof settings[key] === 'undefined') return undefined;

    const value = settings[key];
    settings[key] = undefined;
    this.insertOrReplaceStmt.run(guild, JSON.stringify(settings));

    return value;
  }

  public delete(guild: Snowflake | Guild): void {
    const snowflake = guild instanceof Guild ? guild.id : guild;
    if (!this.settings.has(snowflake)) return;

    this.settings.delete(snowflake);
    this.deleteStmt.run(snowflake);
  }

  private getGuildSettings(guild: Snowflake | Guild): Settings | undefined {
    if (guild instanceof Guild) return this.settings.get(guild.id);
    return this.settings.get(guild);
  }

  private setGuildSettings(guild: Snowflake | Guild, settings: Settings): void {
    if (guild instanceof Guild) this.settings.set(guild.id, settings);
    else this.settings.set(guild, settings);
  }
}
