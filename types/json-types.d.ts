import { Snowflake } from "discord.js";

export interface BotConfig {
  token: string,
  ytkey: string,
  owner: Snowflake,
  dbPath: string,
  allowNickname: boolean,
  pleco: PlecoConfig,
  translate: TranslateConfig
}

export interface PlecoConfig {
  enabled: boolean,
  manage: boolean,
  channel: Snowflake,
  guild: Snowflake,
  member: Snowflake
  role: Snowflake,
}

export interface TranslateConfig {
  enabled: boolean,
  author: Snowflake
}
