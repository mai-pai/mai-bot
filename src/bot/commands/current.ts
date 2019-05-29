import { Message, RichEmbed } from 'discord.js';
import moment = require('moment');
import { YoutubeApi } from '../../services/youtube-api';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class CurrentCommand extends Command {
  private ytapi: YoutubeApi;

  constructor(bot: MaiBot) {
    super(bot);

    this.ytapi = YoutubeApi.getInstance();
  }

  public description(): string {
    return 'Displays the information about the current song.';
  }

  public async run(message: Message, args: string): Promise<Message | Message[]> {
    const blockedMessage = this.checkPermissions(message);
    if (blockedMessage) return blockedMessage;

    const guild = message.guild.id;
    if (this.bot.player.isPlaying(guild)) {
      if (args) return this.onBlock(message, BlockReason.NoArgsNeeded);

      const current = this.bot.player.getCurrent(guild);

      if (!current) return message.channel.send(':x: No current song playing!');

      const thumbnailUrl = await this.ytapi.getThumbnailUrl(current.song.id);
      const embed = new RichEmbed().setColor(0x3498db);
      let iconUrl = '';

      if (current.requestedBy) {
        const member = message.guild.members.find('id', current.requestedBy);
        if (member && member.user && member.user.avatarURL) iconUrl = member.user.avatarURL;
      } else iconUrl = this.bot.getAvatarUrl();

      const currentTime = this.bot.player.getTime(guild);
      const progress = `${moment()
        .startOf('day')
        .milliseconds(currentTime)
        .format('HH:mm:ss')}/${moment()
        .startOf('day')
        .seconds(current.song.duration)
        .format('HH:mm:ss')}`;

      let requester = 'Unknown';
      if (current.requestedBy) {
        const member = message.guild.members.find('id', current.requestedBy);
        if (member && member.displayName) requester = member.displayName;
      }
      embed
        .setAuthor('Now Playing', iconUrl, undefined)
        .setDescription(
          `[**${current.songNumber}.** ${current.song.title}](https://www.youtube.com/watch?v=${current.song.id})`
        )
        .addField('Requested By', requester, true)
        .addField('Progress', progress, true);

      if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

      return message.channel.send(embed);
    }

    return this.onBlock(message, BlockReason.NotPlaying);
  }
}
