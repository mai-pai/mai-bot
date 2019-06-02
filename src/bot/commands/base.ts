import { Message } from 'discord.js';
import { SettingType } from '../../services/settings-repository';
import { MaiBot } from '../mai-bot';

export enum BlockReason {
  Permission,
  RoleOnly,
  MissingArgs,
  InvalidArgs,
  NotPlaying,
  NoArgsNeeded,
  VoiceChannel
}

export abstract class Command {
  constructor(protected bot: MaiBot) {}

  public arguments(): string | undefined {
    return;
  }

  public description(): string {
    return 'Function not yet implemented.';
  }

  public abstract run(message: Message, args: string): Promise<Message | Message[]>;

  /**
   * Called to check permissions for the command. A message promise is returned
   * if the command is blocked.
   * @param {Message} message - The message that requested teh command to run.
   * @returns {Promise<?Message|?Array<Message>> | undefined}
   */
  protected checkPermissions(message: Message): Promise<Message | Message[]> | undefined {
    const guild = message.guild.id;
    const role = this.bot.settings.get(guild, SettingType.Role, undefined);
    const isAdmin = message.member.hasPermission('ADMINISTRATOR');
    const isOwner = this.bot.isOwner(message.member.id);
    const isDJ = role ? message.member.roles.has(role) : false;

    if (!isAdmin && !isOwner && !isDJ) return this.onBlock(message, BlockReason.RoleOnly);
    if (!message.member.voiceChannel) return this.onBlock(message, BlockReason.VoiceChannel);
  }

  /**
   * Called when the command is prevented from running.
   * @param {Message} message - The message that requested the command to run.
   * @param {string} reason - The reason the command was blocked.
   * @returns {Promise<?Message|?Array<Message>>}
   */
  protected onBlock(message: Message, reason: BlockReason): Promise<Message | Message[]> {
    switch (reason) {
      case BlockReason.Permission:
        return message.channel.send(':x: You do not have permission to use this command.');
      case BlockReason.RoleOnly:
        return message.channel.send(':x: You must have the DJ role or an administrator to use this command.');
      case BlockReason.MissingArgs:
        return message.channel.send(':x: Required arguments are missing for this command.');
      case BlockReason.InvalidArgs:
        return message.channel.send(':x: A bad argument was passed, please check if your arguments are correct!');
      case BlockReason.NotPlaying:
        return message.channel.send(':x: The bot must be playing to use this command.');
      case BlockReason.NoArgsNeeded:
        return message.channel.send(':x: This command does not take any parameters.');
      case BlockReason.VoiceChannel:
        return message.channel.send(':x: You must be in a voice channel to use this command!');
      default:
        console.log(`Unknow reason used for blocking command: ${reason}`);
        return Promise.reject(); // TODO: Add rejection reason
    }
  }
}
