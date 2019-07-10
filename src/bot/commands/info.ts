import { Message, RichEmbed } from 'discord.js';
import moment = require('moment');
import { YoutubeApi } from '../../services/youtube-api';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class InfoCommand extends Command {
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
      let songNumber = 0;
      if (args) {
        songNumber = parseInt(args.trim(), 10);
        if (isNaN(songNumber) || songNumber < 1) return this.onBlock(message, BlockReason.InvalidArgs);
        if (!this.bot.player.isInRange(guild, songNumber))
          return message.channel.send(':x: The specified position is outside of the queue length!');
      }

      const info = this.bot.player.getCurrentOrSongNumber(guild, songNumber);

      if (!info) return message.channel.send(':x: Unable to get retrieve song info!');

      const thumbnailUrl = await this.ytapi.getThumbnailUrl(info.song.id);
      const embed = new RichEmbed().setColor(0x3498db);
      let iconUrl = '';

      if (info.requestedBy) {
        const member = message.guild.members.get(info.requestedBy);
        if (member && member.user && member.user.avatarURL) iconUrl = member.user.avatarURL;
      } else iconUrl = this.bot.getAvatarUrl();


      let requester = 'Unknown';
      if (info.requestedBy) {
        const member = message.guild.members.get(info.requestedBy);
        if (member && member.displayName) requester = member.displayName;
      }
      embed
        .setAuthor('Now Playing', iconUrl, undefined)
        .setDescription(
          `[**${info.songNumber}.** ${info.song.title}](https://www.youtube.com/watch?v=${info.song.id})`
        )
        .addField('Requested By', requester, true)

      if (info.isCurrent) {
        const currentTime = this.bot.player.getTime(guild);
        const progress = `${moment()
          .startOf('day')
          .milliseconds(currentTime)
          .format('HH:mm:ss')}/${moment()
          .startOf('day')
          .seconds(info.song.duration)
          .format('HH:mm:ss')}`;
  
        embed.addField('Progress', progress, true);
      }

      if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

      return message.channel.send(embed);
    }

    return this.onBlock(message, BlockReason.NotPlaying);
  }
}
