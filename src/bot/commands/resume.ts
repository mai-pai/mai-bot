import { Message } from 'discord.js';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class ResumeCommand extends Command {
  constructor(bot: MaiBot) {
    super(bot);
  }

  public description(): string {
    return 'Resume the current paused song.';
  }

  public run(message: Message, args: string): Promise<Message | Message[]> {
    if (args) return this.onBlock(message, BlockReason.NoArgsNeeded);

    const guild = message.guild.id;
    const blockedMessage = this.checkPermissions(message);
    if (blockedMessage) return blockedMessage;

    if (this.bot.player.isPlaying(guild)) {
      if (!this.bot.player.isPaused(guild)) return message.channel.send(':x: The player is not paused!');

      this.bot.player.resume(guild);
      return message.channel.send(':ballot_box_with_check: The player has been resumed.');
    }

    return this.onBlock(message, BlockReason.NotPlaying);
  }
}
