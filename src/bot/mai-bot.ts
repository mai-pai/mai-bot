import SQLite3, { Database } from 'better-sqlite3';
import { ActivityType, Client, Guild, GuildChannel, GuildMember, Message, Presence, RichEmbed, Snowflake } from 'discord.js';
import { BotConfig } from 'json-types';
import { AudioPlayer } from '../services/audio-player';
import { SettingsRespository, SettingType } from '../services/settings-repository';
import { YoutubeApi } from '../services/youtube-api';
import * as Commands from './commands';
import { Command } from './commands/base';
import { DebugCommand } from './commands/debug';
import { HelpCommand } from './commands/help';

interface ICommand {
  args: string;
  name: string;
  run: (message: Message, args: string, name?: string) => Promise<Message | Message[]>;
}

export class MaiBot {
  public database: Database;
  public player: AudioPlayer;
  public settings: SettingsRespository;
  public debug: boolean;

  private awaiting: Set<string>;
  private commands: Map<string, Command>;
  private commandPatterns: Map<string, RegExp>;
  private commandHelp: Map<any, { [index: string]: any }>;
  private helpCommand: HelpCommand;
  private debugCommand: DebugCommand;
  private timeouts: Map<Snowflake, NodeJS.Timeout>;

  constructor(private client: Client, private config: BotConfig) {
    this.debug = false;
    this.database = new SQLite3(this.config.dbPath);
    this.database.pragma('journal_mode = WAL');

    this.settings = new SettingsRespository(this.database);
    this.awaiting = new Set<string>();
    this.commands = new Map<string, Command>();
    this.commandPatterns = new Map<string, RegExp>();
    this.player = new AudioPlayer(this);
    this.helpCommand = new HelpCommand(this);
    this.debugCommand = new DebugCommand(this);
    this.timeouts = new Map<Snowflake, NodeJS.Timeout>();

    // Setup Youtube API client
    YoutubeApi.getInstance(config.ytkey);

    this.commandHelp = new Map<any, { [index: string]: any }>();
    for (const typeName of Object.keys(Commands)) {
      const commandName = typeName.toLowerCase().replace(/command$/, '');
      const command = (Commands as any)[typeName];
      let commandDefinition = this.commandHelp.get(command);

      if (!commandDefinition) {
        commandDefinition = { names: [commandName], instance: new command(this) };
        this.commandHelp.set(command, commandDefinition);
      } else commandDefinition.names.push(commandName);

      this.commands.set(commandName, commandDefinition.instance);
    }
  }

  public start(): void {
    this.client.once('ready', async () => {
      console.log(`Logged in as ${this.client.user.tag}.`);
    });

    // this.client.on('raw', (event: any) => {
    //   console.log('\nRaw event data:\n', event);
    // });

    this.client.on('message', (message: Message) => {
      // TODO: Handle messages
      if (!this.shouldHanleMessage(message)) return;

      const command = this.parseCommand(message);
      if (!command) return; // If no command was given, ignore message

      command.run(message, command.args, command.name);
    });

    this.client.on('guildMemberUpdate', async (oldMember: GuildMember, newMember: GuildMember) => {
        if (!this.config.allowNickname && newMember.user.bot && newMember.user === this.client.user) {
            if (newMember.displayName !== this.client.user.username) {

                const audits = await newMember.guild.fetchAuditLogs({type: 'MEMBER_UPDATE', limit: 3}).catch(reason => console.log(reason));

                if (!audits) return;


                const entry = audits.entries.find(a => a.target === this.client.user && a.changes[0].key === 'nick' && a.changes[0].new !== this.client.user.username);
                if (!this.isOwner(entry.executor.id)) {
                    newMember.setNickname('').catch(console.log);

                    // @ts-ignore
                    const channel = newMember.guild.channels.get('587304370601852928') as TextChannel;
                    //const channel = this.client.guilds.get('455456686732345365').channels.get('469854278589218826') as TextChannel;
                    if (channel) {
                        channel.send(`<@${entry.executor.id}> don't go changing my name <a:YuukiFukYou:601985792352583710>`);
                    }
                }
            }
        }
    });

    // this.client.on('messageUpdate', (oldMessage: Message, newMessage: Message) => {

    // });

    this.client.on('voiceStateUpdate', (oldMember: GuildMember, newMember: GuildMember) => {
      const oldVoiceChannel = oldMember.voiceChannel;
      const newVoiceChannel = newMember.voiceChannel;
      const connection = oldMember.voiceChannel
        ? this.client.voiceConnections.find(c => c.channel.id === oldMember.voiceChannelID)
        : undefined;
      if (
        connection &&
        connection.channel.members.size === 1 &&
        connection.channel.members.first().id === this.client.user.id
      ) {
        console.log(`Last member left ${connection.channel.name}.`);

        const timeout = setTimeout(() => {
          this.player.stop(connection.channel.guild.id);
          connection.disconnect();
        }, 60000); // If another member doesn't join the channel in 1 minute the bot stops stream and disconnects.
        this.timeouts.set(connection.channel.guild.id, timeout);
      } else {
        const newConnection = this.client.voiceConnections.find(c => c.channel.id === newMember.voiceChannelID);
        if (newConnection) {
          const members = newConnection.channel.members;
          if (members.size > 1 && members.get(this.client.user.id)) {
            const guild = newConnection.channel.guild.id;
            const timeout = this.timeouts.get(guild);
            if (timeout) {
              console.log('New member joined, clearing idle timeout.');
              clearTimeout(timeout);
              this.timeouts.delete(guild);
            }
          }
        }
      }

      console.log(
        `${newMember.displayName}: ${oldVoiceChannel ? oldVoiceChannel.name : 'None'} => ${
          newVoiceChannel ? newVoiceChannel.name : 'None'
        }`
      );
    });

    process.on('exit', () => {
      // TODO: Add logging
      this.client.destroy();
    });

    process.on('uncaughtException', (err: Error) => {
      // TODO: Add error logging
      console.log('Uncaught exception occurred:');
      console.log(err);
    });

    (process as NodeJS.EventEmitter).on('unhandledRejection', (err: Error) => {
      // TODO: Add error logging for unhandled promise rejections
      console.log('Uncaught rejection occurred:');
      console.log(err);
    });

    this.client.login(this.config.token);
  }

  public isOwner(ownerId: Snowflake): boolean {
    if (!ownerId) return false;

    return this.config.owner === ownerId;
  }

  public getHelpEmbed(message: Message): RichEmbed {
    const prefix = this.settings.get(message.guild, SettingType.Prefix, SettingsRespository.DefaultPrefix);
    const embed = new RichEmbed().setColor(0x3498db);
    this.commandHelp.forEach((value: { [index: string]: any }, key: any) => {
      const alias: string[] = [];
      value.names.forEach((name: string) => {
        alias.push(`${prefix}${name}`);
      });

      const command = value.instance as Command;
      const args = command.arguments();
      const fieldName = `\`${alias.join('|')}${args ? ` ${args}` : ''}\``;
      embed.addField(fieldName, command.description());
    });

    return embed;
  }

  public setActivity(name: string, options: { url?: string; type?: ActivityType | number }): Promise<Presence> {
    return this.client.user.setActivity(name, options);
  }

  public getAvatarUrl(): string {
    return this.client.user.avatarURL;
  }

  private parseCommand(message: Message): ICommand | null {
    const guild = message.guild.id;
    const prefix = this.settings.get(guild, SettingType.Prefix, SettingsRespository.DefaultPrefix);
    const escapedPrefix = this.escapeRegex(prefix);
    let pattern: RegExp | undefined = this.commandPatterns.get(prefix);

    if (!pattern) {
      pattern = new RegExp(
        `^(<@!?${this.client.user.id}>\\s+(?:${escapedPrefix}\\s*)?|${escapedPrefix}\\s*)([^\\s]+)`,
        'i'
      );
      this.commandPatterns.set(prefix, pattern);
    }

    const matches = pattern.exec(message.content);
    if (!matches || matches[2].length === 0) return null;

    console.log(`Command Received: ${message.content}`);
    const commandName = matches[2].trim();
    let command = this.commands.get(commandName);
    // tslint:disable-next-line: curly
    if (!command) {
      if (commandName === 'help' || commandName === 'h') command = this.helpCommand;
      else if (commandName === 'debug') command = this.debugCommand;
      else return null;
    }

    const argString = message.content.substring(matches[1].length + matches[2].length).trim();

    return { run: command.run.bind(command), args: argString, name: commandName };
  }

  private shouldHanleMessage(message: Message, oldMessage?: Message): boolean {
    if (message.author.bot) return false;
    // Ignore message from other bots
    else if (message.author.id === this.client.user.id) return false; // Ignore message own messages

    if (this.awaiting.has(`${message.author.id}${message.channel.id}`)) return false;

    if (oldMessage && message.content === oldMessage.content) return false;

    return true;
  }

  private escapeRegex(prefix: string): string {
    return prefix.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
  }
}
