import { Snowflake } from "discord.js";

export interface PlecoConfig {
  channel: Snowflake,
  guild: Snowflake,
  member: Snowflake
  role: Snowflake,
}

export interface BotConfig {
  token: string,
  ytkey: string,
  owner: Snowflake,
  dbPath: string,
  pleco: PlecoConfig
}