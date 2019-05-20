import { Message } from 'discord.js';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class PauseCommand extends Command {
  constructor(bot: MaiBot) {
    super(bot);
  }

  public description(): string {
    return 'Pauses the current song.';
  }

  public run(message: Message, args: string): Promise<Message | Message[]> {
    if (args) return this.onBlock(message, BlockReason.NoArgsNeeded);

    const guild = message.guild.id;
    const blockedMessage = this.checkPermissions(message);
    if (blockedMessage) return blockedMessage;

    if (this.bot.player.isPlaying(guild)) {
      if (this.bot.player.isPaused(guild)) return message.channel.send(':x: The player is already paused!');

      this.bot.player.pause(guild);
      return message.channel.send(':ballot_box_with_check: The player has been paused.');
    }

    return this.onBlock(message, BlockReason.NotPlaying);
  }
}
