import { Message } from 'discord.js';
import { SettingType } from '../../services/settings-repository';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class VolumeCommand extends Command {
  constructor(bot: MaiBot) {
    super(bot);
  }

  public arguments(): string {
    return '<volume percentage>';
  }

  public description(): string {
    return 'Sets the volume for the stream. Only values between 50-250 are accepted.';
  }

  public run(message: Message, args: string): Promise<Message | Message[]> {
    const blockedMessage = this.checkPermissions(message);
    if (blockedMessage) return blockedMessage;
    if (!args) return this.onBlock(message, BlockReason.MissingArgs);

    const guild = message.guild.id;
    const volume = parseInt(args.trim(), 10);
    if (isNaN(volume) || volume < 50 || volume > 250) return this.onBlock(message, BlockReason.InvalidArgs);

    this.bot.settings.set(guild, SettingType.Volume, volume);
    if (this.bot.player.isPlaying(guild))
      this.bot.player.setVolume(guild, volume);

    return Promise.resolve(message);
  }
}
