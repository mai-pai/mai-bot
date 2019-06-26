import { Message } from 'discord.js';
import { SettingsRespository, SettingType } from '../../services/settings-repository';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class DebugCommand extends Command {
  constructor(bot: MaiBot) {
    super(bot);
  }

  public description(): string {
    return `Toggles the \`debug\` state.`;
  }

  public run(message: Message, args: string): Promise<Message | Message[]> {
    if (!this.bot.isOwner(message.member.id)) return this.onBlock(message, BlockReason.Permission);

    this.bot.debug = !this.bot.debug;
    return message.channel.send(`:ballot_box_with_check: Debugging ${this.bot.debug ? "Enabled" : "Disabled"}`);
  }
}
