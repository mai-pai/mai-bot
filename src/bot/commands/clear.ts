import { Message } from 'discord.js';
import { SettingType } from '../../services/settings-repository';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class ClearCommand extends Command {
  constructor(bot: MaiBot) {
    super(bot);
  }

  public description(): string {
    return 'Stops the current song and clear the current playlist.';
  }

  public run(message: Message, args: string): Promise<Message | Message[]> {
    const blockedMessage = this.checkPermissions(message);
    if (blockedMessage) return blockedMessage;

    const guild = message.guild.id;
    if (args) return this.onBlock(message, BlockReason.NoArgsNeeded);

    const playlistId = this.bot.settings.get(guild, SettingType.PlaylistId, guild);
    if (playlistId !== guild && playlistId !== message.member.id) {
      const isAdmin = message.member.hasPermission('ADMINISTRATOR');
      const isOwner = this.bot.isOwner(message.member.id);

      if (!isAdmin && !isOwner)
        return message.channel.send(`:x: Playlist(s) can only be cleared by their owner!`);
    }

    const err = this.bot.player.clear(guild);

    if (err) return message.channel.send(`:x: ${err.message}`);

    return message.channel.send(
      `:ballot_box_with_check: \`${
        args === 'default' ? message.guild.name : message.member.displayName
      }'s Playlist\` has been cleared.`
    );
  }
}
