import { Message } from 'discord.js';
import { SettingsRespository, SettingType } from '../../services/settings-repository';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class LoopCommand extends Command {
  constructor(bot: MaiBot) {
    super(bot);
  }

  public description(): string {
    return `Toggles the \`repeat\` state.`;
  }

  public run(message: Message, args: string): Promise<Message | Message[]> {
    if (args) return this.onBlock(message, BlockReason.NoArgsNeeded);

    const guild = message.guild.id;
    const blockedMessage = this.checkPermissions(message);
    if (blockedMessage) return blockedMessage;

    if (this.bot.player.isPlaying(guild)) {
      const repeat = !this.bot.settings.get(guild, SettingType.Repeat, false);
      this.bot.settings.set(guild, SettingType.Repeat, repeat);
      return message.channel.send(`:ballot_box_with_check: The repeat state has been set to \`${repeat}\``);
    }

    return this.onBlock(message, BlockReason.NotPlaying);
  }
}
