import { CollectorFilter, Message, RichEmbed } from 'discord.js';
import moment from 'moment';
import { SettingType } from '../../services/settings-repository';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class QueueCommand extends Command {
  constructor(bot: MaiBot) {
    super(bot);
  }

  public arguments(): string {
    return '[page number]';
  }

  public description(): string {
    return 'Shows the list songs in the playlist.';
  }

  public async run(message: Message, args: string): Promise<Message | Message[]> {
    const blockedMessage = this.checkPermissions(message);
    if (blockedMessage) return blockedMessage;

    const guild = message.guild.id;
    if (!this.bot.player.isPlaying(guild)) return this.onBlock(message, BlockReason.NotPlaying);

    let pageNumber = 0;
    if (args) {
      pageNumber = parseInt(args.trim(), 10);
      if (isNaN(pageNumber) || pageNumber < 1) return this.onBlock(message, BlockReason.InvalidArgs);
    }

    let queue = this.bot.player.getQueue(message, pageNumber);
    if (queue) {
      if (pageNumber > queue.pageCount && queue.pageCount !== 0)
        return message.channel.send(':x: The specified page is outside the page count!');

      let queueMessage: Message | undefined;
      while (true) {
        const embed = new RichEmbed().setColor(0x3498db);
        const text: string[] = [];

        // tslint:disable-next-line
        if (queue.entries.length > 0) {
          for (let i = 0; i < queue.entries.length; ++i) {
            const songNumber = (queue.pageNumber - 1) * 10 + i + 1;
            const songEntry = `\`${songNumber}.\` ${queue.entries[i].song.title} \`${moment()
              .startOf('day')
              .seconds(queue.entries[i].song.duration)
              .format('HH:mm:ss')}\``;
            const highlight = queue.entries[i] === queue.current ? '**' : '';
            text.push(`${highlight}${songEntry}${highlight}`);
          }
        }

        // tslint:disable-next-line
        if (text.length > 0) {
          const playlistId = this.bot.settings.get(guild, SettingType.PlaylistId, guild);
          let playlistName = message.guild.name;
          if (playlistId !== guild) {
            const member = message.guild.members.find('id', playlistId);
            if (member && member.displayName) playlistName = member.displayName;
          }
          embed.addField(`:musical_note: ${playlistName}'s Playlist`, text.join('\n')).setFooter(
            `Page: ${queue.pageNumber}/${queue.pageCount} | Total duration: ${moment()
              .startOf('day')
              .seconds(queue.totalDuration)
              .format('HH:mm:ss')}`
          );
        }

        if (embed.fields && embed.fields.length > 0) {
          if (queueMessage) queueMessage = await queueMessage.edit(embed);
          else queueMessage = (await message.channel.send(embed)) as Message;

          if (queue.pageCount < 2) return queueMessage;

          const backReaction = queue.pageNumber > 1 ? await queueMessage.react('◀') : undefined;
          const forwardReaction =
            queue.pageNumber < queue.pageCount
              ? await (backReaction ? backReaction.message : queueMessage).react('▶')
              : undefined;

          const filter: CollectorFilter = (reaction, user) =>
            (reaction.emoji.name === '◀' || reaction.emoji.name === '▶') && !user.bot;

          try {
            const reaction = (await queueMessage.awaitReactions(filter, {
              errors: ['time'],
              max: 1,
              time: 15000
            })).first();

            if (reaction.emoji.name === '◀') pageNumber = queue.pageNumber - 1;
            else if (reaction.emoji.name === '▶') pageNumber = queue.pageNumber + 1;
            else break;

            queue = this.bot.player.getQueue(message, pageNumber);
            await queueMessage.clearReactions();
            if (!queue) break;
          } catch {
            console.log('No reaction was made, moving on...');
            return queueMessage.clearReactions();
          }
        } else break;
      }
    }

    return message.channel.send(':x: Something went horribly wrong, unable to retrieve queue information!');
  }
}
