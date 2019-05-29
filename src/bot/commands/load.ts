import { Message } from 'discord.js';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class LoadCommand extends Command {
  constructor(bot: MaiBot) {
    super(bot);
  }

  public arguments(): string {
    return '[default]';
  }

  public description(): string {
    return 'Load your personal playlist if one exists otherwise create a personal playlist.';
  }

  public run(message: Message, args: string): Promise<Message | Message[]> {
    const blockedMessage = this.checkPermissions(message);
    if (blockedMessage) return blockedMessage;

    if (args && args.toLowerCase() !== 'default')
      return this.onBlock(message, BlockReason.InvalidArgs);

    const err = this.bot.player.load(message, args !== 'default' ? message.member.id : undefined);

    if (err) return message.channel.send(`:x: ${err.message}`);

    return message.channel.send(
      `:ballot_box_with_check: Loaded \`${args === 'default' ? message.guild.name : message.member.displayName}'s Playlist\`.`
    );
  }
}
