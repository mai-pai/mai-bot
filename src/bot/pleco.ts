import { Attachment, Client, GuildMember, Message, RichEmbed, TextChannel, User } from 'discord.js';
import { BotConfig, PlecoConfig } from 'json-types';
import miniget = require('miniget');
import moment = require('moment');

export class PlecoFish {
  // private static readonly MAX_IMAGE_WIDTH = 400.0;
  // private static readonly MAX_IMAGE_HEIGHT = 300.0;

  private config: PlecoConfig;
  private previousCount: number = 0;

  constructor(private client: Client, config: BotConfig) {
    this.config = config.pleco;

    // tslint:disable-next-line: curly
    if (this.config.enabled) {
      if (this.client.readyTimestamp && this.client.readyTimestamp < Date.now()) this.initialize();
      else
        this.client.once('ready', () => {
          this.initialize();
        });
    }
  }

  private async initialize(): Promise<void> {
    const guild = this.client.guilds.get(this.config.guild);
    if (guild) {
      if (!guild.me.hasPermission('MANAGE_ROLES')) {
        console.log(`${this.client.user.tag} doesn't have MANAGE_ROLES permissions.`);
        return;
      }

      const pleco = await guild.fetchMember(this.config.member).catch(reason => undefined);
      if (pleco) {
        this.client.on('presenceUpdate', this.presenceUpdated);
        if (pleco.presence.status === 'offline') {
          console.log('Pleco fish is offline, enabling pleco fish clone.');
          this.enable();
        } else console.log('Pleco is online!');
      }
    }
  }

  private enable(): void {
    this.previousCount = 0;
    this.client.on('guildMemberAdd', this.memberAdded);
    this.client.on('guildMemberUpdate', this.memberUpdated);
    this.client.on('guildMemberRemove', this.memberRemoved);
    this.client.on('messageDelete', this.messageDeleted);
  }

  private disable(): void {
    this.client.off('guildMemberAdd', this.memberAdded);
    this.client.off('guildMemberUpdate', this.memberUpdated);
    this.client.off('guildMemberRemove', this.memberRemoved);
    this.client.off('messageDelete', this.messageDeleted);
  }

  private outcastRoleExists(member: GuildMember): boolean {
    if (!member.guild.roles.has(this.config.role)) {
      console.log(`Unable to find outcast role with id: ${this.config.role}!`);
      return false;
    }

    return true;
  }

  private presenceUpdated = (oldMember: GuildMember, newMember: GuildMember) => {
    if (newMember.id !== this.config.member) return;

    if (newMember.presence.status === 'offline') {
      console.log('Pleco fish went offline, enabling pleco fish clone.');
      this.enable();
    } else if (newMember.presence.status === 'online') {
      console.log('Pleco fish back online, disabling pleco fish clone.');
      this.disable();
    }
  };

  private memberAdded = (member: GuildMember) => {
    if (member.user.bot || !this.outcastRoleExists(member)) return;

    member.addRole(this.config.role);
  };

  private memberUpdated = (oldMember: GuildMember, newMember: GuildMember) => {
    if (newMember.user.bot || !this.outcastRoleExists(newMember)) return;

    if (newMember.roles.has(this.config.role)) {
      const roles = newMember.roles.filter(
        r => r.hasPermission('ATTACH_FILES') && r.hasPermission('EMBED_LINKS') && !r.managed
      );
      if (roles.size > 0) newMember.removeRole(this.config.role);
    }
  };

  private memberRemoved = async (member: GuildMember) => {
    const logs = member.guild.channels.get(this.config.channel) as TextChannel | undefined;
    if (!logs) {
      console.log(`The logs channel for '${member.guild.name}' with id '${this.config.channel}' was not found.`);
      return;
    }

    let title = 'Member Left';
    let description = 'This member has left the server.';

    const banInfo = await member.guild.fetchBan(member.id).catch(reason => undefined); // make promise rejections return undefined.
    if (!banInfo) {
      const audits = await member.guild.fetchAuditLogs({ type: 'MEMBER_KICK', limit: 3 });
      if (audits && audits.entries.size > 0) {
        const audit = audits.entries.find(a => {
          const user = a.target as User;
          return user.id === member.id;
        });

        if (audit && Date.now() - audit.createdTimestamp < 1000) {
          title = 'Member Kicked';
          description = 'This member has been kicked from the server.';
        }
      }
    } else {
      title = 'Member Banned';
      description = 'This member has been banned from the server.';
    }

    const embed = new RichEmbed()
      .setAuthor(`${member.user.tag}`, member.user.displayAvatarURL)
      .setColor(0xf84802)
      .setTitle(title)
      .setDescription(description);

    logs.send(embed);
  };

  private messageDeleted = async (message: Message) => {
    if (message.author.bot) return;

    const logs = message.guild.channels.get(this.config.channel) as TextChannel | undefined;
    if (!logs) {
      console.log(`The logs channel for '${message.guild.name}' with id '${this.config.channel}' was not found.`);
      return;
    }

    const audits = await message.guild.fetchAuditLogs({ type: 'MESSAGE_DELETE', limit: 1 }).catch(reason => undefined);
    if (!audits) return; // An error occurred fetching audit logs, return here since

    const audit = audits.entries.first();
    const count = parseInt((audit.extra as any).count, 10);

    let executor = message.author;
    if (
      (audit.executor.id === message.author.id && count >= 1) ||
      ((audit.target as User).id === message.author.id &&
        (count === this.previousCount + 1 || (count === 1 && Date.now() - audit.createdTimestamp <= 1000)))
    )
      executor = audit.executor;

    this.previousCount = count;
    const embed = new RichEmbed()
      .setColor(0xf84802)
      .setAuthor(`${message.author.tag}`, message.author.displayAvatarURL)
      .addField('Channel: ', message.channel, true)
      .addField(
        'Posted: ',
        moment.utc(message.createdTimestamp).format('YYYY-MM-DD[T]HH:mm:ss[Z]'),
        // moment()
        //   .startOf('day')
        //   .milliseconds(Date.now() - message.createdTimestamp)
        //   .format('HH:mm:ss'),
        true
      )
      .setFooter(`${executor.username}#${executor.discriminator} deleted it`, executor.displayAvatarURL)
      .setTimestamp();

    if (message.attachments.size > 0) {
      const images = message.attachments.filter(a => !!a.height && !!a.width && !!a.proxyURL);
      embed.setTitle('Deleted Embed(Image/Video/File)');

      if (message.content.trim() !== '') embed.addField('Text Content: ', ` ${message.content}`);
      if (images.size > 0) {
        const image = images.first(); // RichEmbeds only has support for a single image, so just using first image.
        const filename = image.filename;
        // let height = image.height;
        // let width = image.width;

        // We don't need the full image, so reduce image size while keeping aspect ratio.
        // if (height >= width && height > PlecoFish.MAX_IMAGE_HEIGHT) {
        //   width = Math.round((PlecoFish.MAX_IMAGE_HEIGHT / height) * width);
        //   height = PlecoFish.MAX_IMAGE_HEIGHT;
        // } else if (width > height && width > PlecoFish.MAX_IMAGE_WIDTH) {
        //   height = Math.round((PlecoFish.MAX_IMAGE_WIDTH / width) * height);
        //   width = PlecoFish.MAX_IMAGE_WIDTH;
        // }

        // const imageBuffer: Buffer | undefined = await this.getImageData(`${image.proxyURL}?width=${width}&height=${height}`).catch(reason => undefined);
        const imageBuffer: Buffer | undefined = await this.getImageData(`${image.proxyURL}`).catch(reason => undefined);
        if (imageBuffer) {
          const attachment = new Attachment(imageBuffer, filename);
          embed.attachFile(attachment).setImage(`attachment://${filename}`);
        }
      }
    } else embed.setTitle('Deleted Message').addField('Textual Content: ', ` ${message.content}`);

    logs.send(embed);
  };

  private getImageData(url: string): Promise<Buffer> {
    const stream = miniget(url);
    const chunks: Uint8Array[] = [];

    stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    return new Promise((resolve, reject) => {
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      });

      stream.on('error', error => {
        console.log(`An error occurred trying to retrieving: ${url}`);
        reject(error);
      });
    });
  }
}
