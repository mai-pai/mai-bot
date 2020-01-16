import { Message } from 'discord.js';
import ytdl from 'ytdl-core';
import { SettingsRespository, SettingType } from '../../services/settings-repository';
import { VideoDetails, YoutubeApi } from '../../services/youtube-api';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class PlayCommand extends Command {
  private ytapi: YoutubeApi;

  constructor(bot: MaiBot) {
    super(bot);

    this.ytapi = YoutubeApi.getInstance();
  }

  public arguments(): string {
    return '[song name | youtube link]';
  }

  public description(): string {
    return 'Plays a song with the given name or youtube link.  If no name/link is given, will start playing from previous playlist if one exists.';
  }

  public async run(message: Message, args: string): Promise<Message | Message[]> {
    const blockedMessage = this.checkPermissions(message);
    if (blockedMessage) return blockedMessage;

    if (!args) {
      if (!this.bot.player.play(message)) return this.onBlock(message, BlockReason.MissingArgs);
      return message.channel.send(':musical_note: Playing from last playlist.');
    }

    const guildId = message.guild.id;
    const vcId = this.bot.settings.get(guildId, SettingType.VoiceChannel, undefined);
    const tcId = this.bot.settings.get(guildId, SettingType.TextChannel, undefined);
    const prefix = this.bot.settings.get(guildId, SettingType.Prefix, SettingsRespository.DefaultPrefix);

    if (tcId) {
      const tc = message.guild.channels.find(c => c.id === tcId && c.type === 'text');
      if (tc && message.channel.id !== tc.id)
        return message.channel.send(`:x: You must be in <#${tc.id}> to use this command!`);
    }

    if (!message.member.voiceChannel)
      return message.channel.send(`:x: You must be in a voice channel to use this command!`);

    if (!vcId)
      return message.channel.send(
        `:x: No voice channel is currently set. Use \`${prefix}settings vc [voice channel]\` to set one up first.`
      );

    const vc = message.guild.channels.find(c => c.id === vcId && c.type === 'voice');
    if (!vc) {
      this.bot.settings.reset(guildId, SettingType.VoiceChannel);
      return message.channel.send(
        `:x: The previously set voice channel no longer exists. Please set a new one before continuing.`
      );
    }

    if (vc !== message.member.voiceChannel)
      return message.channel.send(`:x: You must be listening in \`${vc.name}\` to use this command!`);

    const videoId = ytdl.getVideoID(args);
    let videoInfo: VideoDetails | null | undefined;
    if (videoId instanceof Error) {
      const videos = await this.ytapi.search(args, 1);
      if (videos && videos.length > 0) videoInfo = await this.ytapi.get(videos[0].id);
    } else videoInfo = await this.ytapi.get(videoId);

    if (!videoInfo) return message.channel.send(':x: No results found!');

    const position = this.bot.player.addSong(message, videoInfo);
    const positionMsg = position > 1 ? `to position: \`${position}\`` : 'to be played now';

    return message.channel.send(`:musical_note: **Added** \`${videoInfo.title}\` ${positionMsg}`);
  }
}
