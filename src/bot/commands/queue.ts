import { CollectorFilter, Message, RichEmbed } from 'discord.js';
import moment from 'moment';
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
    return 'Shows the remaining songs in the queue.';
  }

  public async run(message: Message, args: string): Promise<Message | Message[]> {
    const blockedMessage = this.checkPermissions(message);
    if (blockedMessage) return blockedMessage;

    const guild = message.guild.id;
    if (!this.bot.player.isPlaying(guild)) return this.onBlock(message, BlockReason.NotPlaying);

    let pageNumber = 1;
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

        if (queue.previous)
          embed.addField(
            'Previous Song:',
            `${queue.previous.song.title} \`${moment()
              .startOf('day')
              .seconds(queue.previous.song.duration)
              .format('HH:mm:ss')}\``
          );
        const text: string[] = [];
        if (queue.next)
          text.push(
            `\`1.\` ${queue.next.song.title} \`${moment()
              .startOf('day')
              .seconds(queue.next.song.duration)
              .format('HH:mm:ss')}\`\n`
          );

        // tslint:disable-next-line
        if (queue.entries.length > 0) {
          for (let i = 0; i < queue.entries.length; ++i) {
            if (queue.entries[i] === queue.next) continue;

            const songNumber = (queue.pageNumber - 1) * 10 + i + 1;
            text.push(
              `\`${songNumber}.\` ${queue.entries[i].song.title} \`${moment()
                .startOf('day')
                .seconds(queue.entries[i].song.duration)
                .format('HH:mm:ss')}\``
            );
          }
        }

        // tslint:disable-next-line
        if (text.length > 0) {
          embed.addField('Next Song:', text.join('\n')).setFooter(
            `Page: ${queue.pageNumber}/${queue.pageCount} | Total duration: ${moment()
              .startOf('day')
              .seconds(queue.totalDuration)
              .format('HH:mm:ss')}`
          );
        }

        if (embed.fields && embed.fields.length > 0) {
          const content = `:musical_note: ${message.guild.name}'s Playlist`;
          if (queueMessage) queueMessage = await queueMessage.edit(content, embed);
          else queueMessage = (await message.channel.send(content, embed)) as Message;

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
              time: 15000,
            })).first();

            if (reaction.emoji.name === '◀') pageNumber -= 1;
            else if (reaction.emoji.name === '▶') pageNumber += 1;
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
