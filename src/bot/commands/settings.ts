import { GuildChannel, Message, RichEmbed, Role } from 'discord.js';
import { SettingsRespository, SettingType } from '../../services/settings-repository';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class SettingsCommand extends Command {
  private readonly argumentPattern: RegExp = new RegExp('^\\s*([^\\s]+)\\s+([^\\s]+)\\s*$', 'i');
  private readonly rolePattern: RegExp = new RegExp('^<@&?([0-9]+)>$', 'i');
  private readonly channelPattern: RegExp = new RegExp('^<#([0-9]+)>$', 'i');
  private readonly booleanMap: { [index: string]: boolean | undefined } = { true: true, false: false };
  private settings: SettingsRespository;
  private nameMap: { [index: string]: SettingType | undefined };

  constructor(bot: MaiBot) {
    super(bot);
    this.settings = bot.settings;
    this.nameMap = {
      npm: SettingType.ShowPlayingMessage,
      prefix: SettingType.Prefix,
      repeat: SettingType.Repeat,
      role: SettingType.Role,
      tc: SettingType.TextChannel,
      vc: SettingType.VoiceChannel
    };
  }

  public arguments(): string {
    return '[[role | tc | vc | repeat | npm | prefix] value]';
  }

  public description(): string {
    return 'Shows the bot settings for the current server. You can change the settings given the right parameters.';
  }

  public run(message: Message, args: string): Promise<Message | Message[]> {
    args = args.trim();

    const guild = message.guild.id;
    const matches = this.argumentPattern.exec(args || '');
    const prefix = this.settings.get(guild, SettingType.Prefix, SettingsRespository.DefaultPrefix);

    if (!matches && args.length === 0) {
      const repeat = this.settings.get(guild, SettingType.Repeat, false);
      const playMsg = this.settings.get(guild, SettingType.ShowPlayingMessage, false);
      let role = this.settings.get(guild, SettingType.Role, undefined);
      let tc = this.settings.get(guild, SettingType.TextChannel, undefined);
      let vc = this.settings.get(guild, SettingType.VoiceChannel, undefined);

      if (role) {
        role = message.guild.roles.get(role);
        if (!role) this.settings.reset(guild, SettingType.Role);
        else role = role.name;
      }

      if (tc) {
        tc = message.guild.channels.find(c => c.id === tc && c.type === 'text');
        if (!tc) this.settings.reset(guild, SettingType.TextChannel);
        else tc = tc.name;
      }

      if (vc) {
        vc = message.guild.channels.find(c => c.id === vc && c.type === 'voice');
        if (!vc) this.settings.reset(guild, SettingType.VoiceChannel);
        else vc = vc.name;
      }

      const embed = new RichEmbed()
        .setColor(0x3498db)
        .setDescription(
          [
            `**DJ Role**:  *${role ? role : 'None'}*`,
            `**Text Channel**: *${tc ? tc : 'None'}*`,
            `**Voice Channel**: *${vc ? vc : 'None'}*`,
            `**Repeat**: *${repeat}*`,
            `**Now Playing Message**: *${playMsg}*`,
            `**Prefix**: *${prefix}*`
          ].join('\n')
        );
      return message.channel.send(`:tools: Settings for **${message.guild.name}**`, embed);
    } else if (!matches || this.nameMap[matches[1]] === undefined)
      return this.onBlock(message, BlockReason.InvalidArgs);

    // TODO: Add setting reset functionality
    const setting = this.nameMap[matches[1]];
    if (setting !== SettingType.Repeat) {
      const isAdmin = message.member.hasPermission('ADMINISTRATOR');
      const isOwner = this.bot.isOwner(message.member.id);

      if (!isAdmin && !isOwner) return this.onBlock(message, BlockReason.Permission);
    }

    switch (setting) {
      case SettingType.ShowPlayingMessage:
      case SettingType.Repeat:
        const value = matches[2].trim().toLowerCase();
        if (this.booleanMap[value] === undefined)
          return message.channel.send(
            `:x: Invalid argument give for **${matches[1]}** setting. Only **true** or **false** is accepted.`
          );

        this.settings.set(guild, setting, this.booleanMap[value]);
        const replyMsg =
          setting === SettingType.ShowPlayingMessage
            ? `:ballot_box_with_check: Now playing message will ${
                this.booleanMap[value] ? 'now' : 'no longer'
              } be sent when a song starts.`
            : `:ballot_box_with_check: The repeat state has been set to **${this.booleanMap[value]}**.`;
        return message.channel.send(replyMsg);
      case SettingType.Prefix:
        const newPrefix = matches[2].trim();
        if (newPrefix.length > 1) return message.channel.send(':x: Prefix setting must be a single character.');
        if (newPrefix === prefix) return Promise.resolve(message); // Prefix is the same, ignore the settings change
        this.settings.set(guild, setting, newPrefix);

        if (newPrefix === SettingsRespository.DefaultPrefix)
          return message.channel.send(
            `:ballot_box_with_check: The prefix has been reset to the default prefix: \`${
              SettingsRespository.DefaultPrefix
            }\``
          );

        return message.channel.send(`:ballot_box_with_check: The prefix has been changed to: \`${newPrefix}\``);
      case SettingType.Role:
        const roleMatches = this.rolePattern.exec(matches[2].trim());
        let property: keyof Role;
        let propertyValue: string;

        if (!roleMatches) {
          property = 'name';
          propertyValue = matches[2].trim();
        } else {
          property = 'id';
          propertyValue = roleMatches[1].trim();
        }

        const role = message.guild.roles.find(property, propertyValue);
        if (role) {
          this.settings.set(guild, setting, role.id);
          return message.channel.send(
            `:ballot_box_with_check: DJ commands can now only be used by people who have the **${role.name}** role.`
          );
        }

        return message.channel.send(`:x: The role **${propertyValue}** was not found.`);
      case SettingType.TextChannel:
      case SettingType.VoiceChannel:
        const channelType = setting === SettingType.TextChannel ? 'text' : 'voice';
        const channelMatches = this.channelPattern.exec(matches[2].trim());
        let channelExpr: any;
        let channelSearch: string;

        if (!channelMatches) {
          channelSearch = matches[2].trim();
          channelExpr = (x: GuildChannel) => x.name === channelSearch && x.type === channelType;
        } else {
          channelSearch = channelMatches[1].trim();
          channelExpr = (x: GuildChannel) => x.id === channelSearch && x.type === channelType;
        }

        const channel = message.guild.channels.find(channelExpr);
        if (channel) {
          this.settings.set(guild, setting, channel.id);

          if (setting === SettingType.TextChannel)
            return message.channel.send(
              `:ballot_box_with_check: Commands can now only be used in the **${channel.name}** text channel.`
            );
          return message.channel.send(
            `:ballot_box_with_check: Music can now only be played in the **${channel.name}** voice channel.`
          );
        }

        return message.channel.send(`:x: The channel **${channelSearch}** was not found.`);
      default:
        return message.channel.send(`:x: Don't know how you got here.`);
    }
  }
}
