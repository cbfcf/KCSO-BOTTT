const {
  Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, ChannelType, EmbedBuilder, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
  MessageFlags, Events
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID environment variable.");
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "guild-config.json");
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = {};
try { db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { db = {}; }
function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
function cfgFor(guildId) {
  db[guildId] ??= {
    infractionChannel: null, promotionChannel: null, ticketLogChannel: null,
    ticketCategory: null, closedCategory: null, supportRole: null, ticketPingRole: null,
    ticketPanelChannel: null, ticketCounter: 0, infractionCounter: 0, accessRoles: {}, modules: {}
  };
  return db[guildId];
}
function clean(s) { return String(s ?? "").replace(/[`@]/g, "").slice(0, 1000); }
function v2(title, body, row = null) {
  const c = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${title}\n${body}`)
  );
  if (row) c.addActionRowComponents(row);
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}
function hasRole(member, roleId) {
  return Boolean(roleId && member.roles?.cache?.has(roleId));
}
function canUse(interaction, key) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roles = cfgFor(interaction.guildId).accessRoles?.[key] || [];
  return roles.length > 0 ? roles.some(id => hasRole(interaction.member, id)) : false;
}
function deny(interaction) {
  return interaction.reply({ ...v2("Access denied", "You do not have permission to use this command."), ephemeral: true });
}
function commandAccess(interaction, key) {
  return canUse(interaction, key) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}
function makeCommands() {
  const cmds = [];
  cmds.push(new SlashCommandBuilder().setName("configure").setDescription("Open the department bot configuration menu"));
  cmds.push(new SlashCommandBuilder().setName("infraction").setDescription("Record a member infraction")
    .addUserOption(o=>o.setName("member").setDescription("Member receiving the infraction").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason for the infraction").setRequired(true).setMaxLength(900))
    .addStringOption(o=>o.setName("punishment").setDescription("Punishment issued").setRequired(true).setMaxLength(200)));
  cmds.push(new SlashCommandBuilder().setName("promote").setDescription("Record a member promotion")
    .addUserOption(o=>o.setName("member").setDescription("Member being promoted").setRequired(true))
    .addStringOption(o=>o.setName("rank").setDescription("New rank").setRequired(true).setMaxLength(100))
    .addStringOption(o=>o.setName("reason").setDescription("Reason for promotion").setRequired(true).setMaxLength(900)));
  const ticket = new SlashCommandBuilder().setName("ticket").setDescription("Manage the ticket system")
    .addSubcommand(s=>s.setName("panel").setDescription("Post the ticket opening panel").addChannelOption(o=>o.setName("channel").setDescription("Where to post the panel").addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s=>s.setName("claim").setDescription("Claim this ticket"))
    .addSubcommand(s=>s.setName("close").setDescription("Close this ticket"))
    .addSubcommand(s=>s.setName("reopen").setDescription("Reopen this ticket"))
    .addSubcommand(s=>s.setName("delete").setDescription("Delete this ticket"))
    .addSubcommand(s=>s.setName("add").setDescription("Add a member to this ticket").addUserOption(o=>o.setName("member").setDescription("Member to add").setRequired(true)))
    .addSubcommand(s=>s.setName("remove").setDescription("Remove a member from this ticket").addUserOption(o=>o.setName("member").setDescription("Member to remove").setRequired(true)));
  cmds.push(ticket);
  cmds.push(new SlashCommandBuilder().setName("ban").setDescription("Ban a member").addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(false)));
  cmds.push(new SlashCommandBuilder().setName("kick").setDescription("Kick a member").addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(false)));
  cmds.push(new SlashCommandBuilder().setName("timeout").setDescription("Timeout a member").addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true)).addIntegerOption(o=>o.setName("minutes").setDescription("Duration in minutes (1-40320)").setRequired(true).setMinValue(1).setMaxValue(40320)).addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(false)));
  cmds.push(new SlashCommandBuilder().setName("untimeout").setDescription("Remove a member timeout").addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true)));
  cmds.push(new SlashCommandBuilder().setName("warn").setDescription("Warn a member").addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(true)));
  cmds.push(new SlashCommandBuilder().setName("purge").setDescription("Delete recent messages").addIntegerOption(o=>o.setName("amount").setDescription("Number of messages (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)));
  cmds.push(new SlashCommandBuilder().setName("slowmode").setDescription("Set channel slowmode").addIntegerOption(o=>o.setName("seconds").setDescription("Seconds (0-21600)").setRequired(true).setMinValue(0).setMaxValue(21600)));
  cmds.push(new SlashCommandBuilder().setName("lock").setDescription("Lock this channel"));
  cmds.push(new SlashCommandBuilder().setName("unlock").setDescription("Unlock this channel"));
  cmds.push(new SlashCommandBuilder().setName("nickname").setDescription("Change a member nickname").addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true)).addStringOption(o=>o.setName("nickname").setDescription("New nickname").setRequired(true).setMaxLength(32)));
  cmds.push(new SlashCommandBuilder().setName("embed").setDescription("Create a clean Components V2 message")
    .addStringOption(o=>o.setName("title").setDescription("Title").setRequired(true).setMaxLength(150))
    .addStringOption(o=>o.setName("description").setDescription("Message body").setRequired(true).setMaxLength(3500))
    .addChannelOption(o=>o.setName("channel").setDescription("Channel to send to").addChannelTypes(ChannelType.GuildText)));
  cmds.push(new SlashCommandBuilder().setName("role").setDescription("Give or remove a role")
    .addSubcommand(s=>s.setName("give").setDescription("Give a role").addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true)).addRoleOption(o=>o.setName("role").setDescription("Role").setRequired(true)))
    .addSubcommand(s=>s.setName("remove").setDescription("Remove a role").addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true)).addRoleOption(o=>o.setName("role").setDescription("Role").setRequired(true))));
  return cmds.map(c=>c.toJSON());
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], partials: [Partials.Channel] });
async function sendLog(guild, channelId, title, body) {
  if (!channelId) return false;
  const ch = await guild.channels.fetch(channelId).catch(()=>null);
  if (!ch?.isTextBased()) return false;
  await ch.send(v2(title, body));
  return true;
}
function ticketInfo(channelId) {
  for (const [gid, g] of Object.entries(db)) {
    const rec = g.tickets?.[channelId];
    if (rec) return { guildId: gid, config: g, record: rec };
  }
  return null;
}
async function createTicket(interaction) {
  const cfg = cfgFor(interaction.guildId);
  if (!cfg.ticketCategory) return interaction.reply({ ...v2("Ticket setup needed", "An administrator must set the ticket category and support role in `/configure` first."), ephemeral: true });
  const existing = interaction.guild.channels.cache.find(c=>c.type===ChannelType.GuildText && c.topic?.includes(`ticket-owner:${interaction.user.id}`));
  if (existing) return interaction.reply({ ...v2("Ticket already open", `You already have an open ticket: ${existing}`), ephemeral: true });
  cfg.ticketCounter = (cfg.ticketCounter || 0) + 1;
  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }
  ];
  if (cfg.supportRole) overwrites.push({ id: cfg.supportRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
  if (cfg.ticketPingRole && !overwrites.some(x=>x.id===cfg.ticketPingRole)) overwrites.push({ id: cfg.ticketPingRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  const channel = await interaction.guild.channels.create({
    name: `ticket-${String(cfg.ticketCounter).padStart(4,"0")}`,
    type: ChannelType.GuildText, parent: cfg.ticketCategory,
    topic: `ticket-owner:${interaction.user.id}`,
    permissionOverwrites: overwrites
  });
  cfg.tickets ??= {};
  cfg.tickets[channel.id] = { userId: interaction.user.id, openedAt: Date.now(), claimedBy: null, closed: false };
  save();
  const ping = cfg.ticketPingRole ? `<@&${cfg.ticketPingRole}>` : "";
  await channel.send({ ...v2("Support ticket", `Hello ${interaction.user}, your ticket is open. Please explain what you need help with.\n\nA staff member will assist you shortly.`), allowedMentions: { users: [interaction.user.id], roles: cfg.ticketPingRole ? [cfg.ticketPingRole] : [] } });
  if (ping) await channel.send({ content: ping, allowedMentions: { roles: [cfg.ticketPingRole] } });
  await sendLog(interaction.guild, cfg.ticketLogChannel, "Ticket opened", `**Channel:** ${channel}\n**Opened by:** ${interaction.user}\n**Ticket:** ${channel.name}`);
  return interaction.reply({ ...v2("Ticket created", `Your ticket is ready: ${channel}`), ephemeral: true });
}
async function configureStart(interaction) {
  const options = [
    ["infractionChannel","Infraction log channel"],["promotionChannel","Promotion log channel"],
    ["ticketLogChannel","Ticket log channel"],["ticketPanelChannel","Ticket panel channel"],
    ["ticketCategory","Open ticket category"],["closedCategory","Closed ticket category"],
    ["supportRole","Support staff role"],["ticketPingRole","Role pinged when a ticket opens"]
  ];
  const menu = new StringSelectMenuBuilder().setCustomId("cfg_pick").setPlaceholder("Choose a setting to configure").addOptions(options.map(([v,n])=>({label:n,value:v})));
  const cfg = cfgFor(interaction.guildId);
  return interaction.reply({ ...v2("Department configuration", "Select a setting below. Each channel and role can be configured separately.\n\n"+
    `Infraction logs: ${cfg.infractionChannel ? `<#${cfg.infractionChannel}>` : "Not set"}\n`+
    `Promotion logs: ${cfg.promotionChannel ? `<#${cfg.promotionChannel}>` : "Not set"}\n`+
    `Ticket ping role: ${cfg.ticketPingRole ? `<@&${cfg.ticketPingRole}>` : "Not set"}`, new ActionRowBuilder().addComponents(menu)), ephemeral: true });
}
async function handleConfigSelect(interaction) {
  const key = interaction.values[0];
  const roleKeys = ["supportRole","ticketPingRole"];
  const categoryKeys = ["ticketCategory","closedCategory"];
  const select = roleKeys.includes(key)
    ? new RoleSelectMenuBuilder().setCustomId(`cfg_role:${key}`).setPlaceholder("Select a role").setMinValues(1).setMaxValues(1)
    : new ChannelSelectMenuBuilder().setCustomId(`cfg_channel:${key}`).setPlaceholder("Select a channel").setChannelTypes(categoryKeys.includes(key) ? [ChannelType.GuildCategory] : [ChannelType.GuildText]).setMinValues(1).setMaxValues(1);
  await interaction.update(v2("Choose configuration value", `Select the new value for **${keyLabel(key)}** below.`, new ActionRowBuilder().addComponents(select)));
}
function keyLabel(k) {
  return ({infractionChannel:"Infraction log channel",promotionChannel:"Promotion log channel",ticketLogChannel:"Ticket log channel",ticketPanelChannel:"Ticket panel channel",ticketCategory:"Open ticket category",closedCategory:"Closed ticket category",supportRole:"Support staff role",ticketPingRole:"Ticket notification role"})[k] || k;
}
async function handleConfigValue(interaction, key, value) {
  const cfg = cfgFor(interaction.guildId);
  cfg[key] = value;
  save();

  // Keep the Components V2 text container from v2(); replacing its components
  // with [] produces an empty interaction update, which Discord rejects.
  const selectedValue = key.endsWith("Role") ? `<@&${value}>` : `<#${value}>`;
  const response = v2(
    "Configuration saved",
    `**${keyLabel(key)}** has been set to ${selectedValue}.`
  );
  await interaction.update(response);
}
async function ticketCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const cfg = cfgFor(interaction.guildId);
  if (sub === "panel") {
    if (!commandAccess(interaction,"ticket")) return deny(interaction);
    const ch = interaction.options.getChannel("channel") || (cfg.ticketPanelChannel && await interaction.guild.channels.fetch(cfg.ticketPanelChannel).catch(()=>null)) || interaction.channel;
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket_open").setLabel("Open a ticket").setStyle(ButtonStyle.Secondary));
    await ch.send(v2("Department support", "Need assistance from the department team? Select the button below to open a private support ticket.", row));
    return interaction.reply({ ...v2("Panel posted", `The ticket panel was posted in ${ch}.`), ephemeral: true });
  }
  const rec = cfg.tickets?.[interaction.channelId];
  if (!rec) return interaction.reply({ ...v2("Not a ticket", "This command can only be used inside a ticket channel."), ephemeral: true });
  const staff = commandAccess(interaction,"ticket") || hasRole(interaction.member,cfg.supportRole);
  if (["claim","close","reopen","delete"].includes(sub) && !staff && rec.userId !== interaction.user.id) return deny(interaction);
  if (sub === "claim") {
    if (!staff) return deny(interaction);
    rec.claimedBy = interaction.user.id; save();
    return interaction.reply(v2("Ticket claimed", `This ticket has been claimed by ${interaction.user}.`));
  }
  if (sub === "add" || sub === "remove") {
    if (!staff) return deny(interaction);
    const user = interaction.options.getUser("member");
    await interaction.channel.permissionOverwrites.edit(user.id, sub==="add" ? { ViewChannel:true, SendMessages:true, ReadMessageHistory:true } : { ViewChannel:false });
    return interaction.reply(v2(sub==="add" ? "Member added" : "Member removed", `${user} has been ${sub==="add" ? "added to" : "removed from"} this ticket.`));
  }
  if (sub === "close") {
    if (rec.closed) return interaction.reply({ ...v2("Already closed","This ticket is already closed."),ephemeral:true });
    rec.closed = true; save();
    if (cfg.closedCategory) await interaction.channel.setParent(cfg.closedCategory).catch(()=>{});
    await interaction.channel.permissionOverwrites.edit(rec.userId,{SendMessages:false}).catch(()=>{});
    const msgs = await interaction.channel.messages.fetch({limit:100}).catch(()=>null);
    const lines = msgs ? [...msgs.values()].sort((a,b)=>a.createdTimestamp-b.createdTimestamp).map(m=>`[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content || "[attachment/embed]"}`) : [];
    const transcript = new AttachmentBuilder(Buffer.from(lines.join("\n") || "No messages available.","utf8"),{name:`${interaction.channel.name}-transcript.txt`});
    await sendLog(interaction.guild,cfg.ticketLogChannel,"Ticket closed",`**Channel:** ${interaction.channel.name}\n**Closed by:** ${interaction.user}\n**Opened by:** <@${rec.userId}>`);
    if (cfg.ticketLogChannel) {
      const log = await interaction.guild.channels.fetch(cfg.ticketLogChannel).catch(()=>null);
      if (log?.isTextBased()) await log.send({files:[transcript]});
    }
    return interaction.reply(v2("Ticket closed","This ticket has been closed. Staff can reopen or delete it."));
  }
  if (sub === "reopen") {
    if (!staff) return deny(interaction);
    rec.closed = false; save();
    await interaction.channel.permissionOverwrites.edit(rec.userId,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true}).catch(()=>{});
    if (cfg.ticketCategory) await interaction.channel.setParent(cfg.ticketCategory).catch(()=>{});
    return interaction.reply(v2("Ticket reopened","This ticket is open again."));
  }
  if (sub === "delete") {
    if (!staff) return deny(interaction);
    await interaction.reply(v2("Ticket deleting","This ticket will be deleted in a moment."));
    setTimeout(()=>interaction.channel.delete().catch(()=>{}),3000);
  }
}
client.once(Events.ClientReady, async c => {
  console.log(`Logged in as ${c.user.tag}`);
  try {
    const rest = new REST({version:"10"}).setToken(TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:makeCommands()});
    console.log("Guild slash commands registered.");
  } catch (e) { console.error("Command registration failed:",e); }
});
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton() && interaction.customId === "ticket_open") return createTicket(interaction);
    if (interaction.isStringSelectMenu() && interaction.customId === "cfg_pick") return handleConfigSelect(interaction);
    if (interaction.isRoleSelectMenu() && interaction.customId.startsWith("cfg_role:")) return handleConfigValue(interaction,interaction.customId.split(":")[1],interaction.values[0]);
    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith("cfg_channel:")) return handleConfigValue(interaction,interaction.customId.split(":")[1],interaction.values[0]);
    if (!interaction.isChatInputCommand()) return;
    const cmd = interaction.commandName;
    if (cmd === "configure") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) return deny(interaction);
      return configureStart(interaction);
    }
    if (cmd === "ticket") return ticketCommand(interaction);
    if (cmd === "infraction") {
      if (!commandAccess(interaction,"infraction")) return deny(interaction);

      const user = interaction.options.getUser("member");
      const reason = clean(interaction.options.getString("reason"));
      const punishment = clean(interaction.options.getString("punishment"));
      const cfg = cfgFor(interaction.guildId);
      const logChannel = cfg.infractionChannel
        ? await interaction.guild.channels.fetch(cfg.infractionChannel).catch(() => null)
        : null;

      if (!logChannel?.isTextBased()) {
        return interaction.reply({
          ...v2("Infraction log channel missing", "Set the infraction log channel in `/configure` before issuing an infraction."),
          ephemeral: true
        });
      }

      cfg.infractionCounter = (cfg.infractionCounter || 0) + 1;
      save();
      const infractionId = String(cfg.infractionCounter).padStart(4, "0");
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const serverIcon = interaction.guild.iconURL({ extension: "png", size: 256 });

      const infractionEmbed = new EmbedBuilder()
        .setColor(0x9A6324)
        .setAuthor({
          name: `Infraction issued by ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .setTitle("Employee Infraction")
        .setDescription(
          `Unfortunately, ${member?.displayName || user.username}, our administrative team has decided to issue an infraction due to your actions.`
        )
        .addFields(
          { name: "Member", value: `${user}`, inline: false },
          { name: "Punishment", value: punishment, inline: false },
          { name: "Infraction Reason", value: reason, inline: false },
          { name: "Appeal Status", value: "Not submitted", inline: false },
          { name: "Signed", value: `${interaction.user}`, inline: false }
        )
        .setFooter({ text: `Infraction ID: ${infractionId}` })
        .setTimestamp();

      if (serverIcon) infractionEmbed.setThumbnail(serverIcon);
      await logChannel.send({ embeds: [infractionEmbed] });

      return interaction.reply({
        ...v2("Infraction recorded", `The infraction for ${user} was posted to ${logChannel}.\n**Infraction ID:** ${infractionId}`),
        ephemeral: true
      });
    }
    if (cmd === "promote") {
      if (!commandAccess(interaction,"promote")) return deny(interaction);
      const user = interaction.options.getUser("member"), rank = clean(interaction.options.getString("rank")), reason = clean(interaction.options.getString("reason"));
      const ok = await sendLog(interaction.guild,cfgFor(interaction.guildId).promotionChannel,"Member promotion",`**Member:** ${user}\n**New rank:** ${rank}\n**Promoted by:** ${interaction.user}\n**Reason:** ${reason}`);
      return interaction.reply({ ...v2(ok ? "Promotion recorded" : "Promotion recorded — log channel missing",ok ? `The promotion for ${user} was sent to the promotion channel.` : "Set the promotion log channel in `/configure`."),ephemeral:true });
    }
    if (cmd === "embed") {
      if (!commandAccess(interaction,"embed")) return deny(interaction);
      const title=clean(interaction.options.getString("title")), desc=clean(interaction.options.getString("description"));
      const ch=interaction.options.getChannel("channel") || interaction.channel;
      await ch.send(v2(title,desc));
      return interaction.reply({ ...v2("Message sent",`Your Components V2 message was sent to ${ch}.`),ephemeral:true });
    }
    if (cmd === "role") {
      if (!commandAccess(interaction,"role")) return deny(interaction);
      const sub=interaction.options.getSubcommand(), user=interaction.options.getUser("member"), role=interaction.options.getRole("role"), member=await interaction.guild.members.fetch(user.id);
      if (role.position >= interaction.guild.members.me.roles.highest.position) return interaction.reply({ ...v2("Role hierarchy","I cannot manage a role that is equal to or higher than my highest role."),ephemeral:true });
      if (sub==="give") await member.roles.add(role); else await member.roles.remove(role);
      return interaction.reply(v2("Role updated",`${role} was ${sub==="give"?"given to":"removed from"} ${user}.`));
    }
    if (cmd === "ban" || cmd === "kick" || cmd === "timeout" || cmd === "untimeout" || cmd === "warn" || cmd === "nickname") {
      const key=cmd;
      if (!commandAccess(interaction,key)) return deny(interaction);
      const user=interaction.options.getUser("member"), member=await interaction.guild.members.fetch(user.id).catch(()=>null);
      if (!member && cmd!=="ban") return interaction.reply({ ...v2("Member not found","That user is not currently in this server."),ephemeral:true });
      if (member && interaction.member.roles.highest.position <= member.roles.highest.position && interaction.guild.ownerId!==interaction.user.id) return interaction.reply({ ...v2("Role hierarchy","You must have a higher role than the target member."),ephemeral:true });
      const reason=interaction.options.getString("reason") || `Action by ${interaction.user.tag}`;
      if (cmd==="ban") await interaction.guild.members.ban(user,{reason});
      if (cmd==="kick") await member.kick(reason);
      if (cmd==="timeout") await member.timeout(interaction.options.getInteger("minutes")*60000,reason);
      if (cmd==="untimeout") await member.timeout(null,`Timeout removed by ${interaction.user.tag}`);
      if (cmd==="warn") await user.send(`You have received a warning in **${interaction.guild.name}**.\nReason: ${reason}`).catch(()=>{});
      if (cmd==="nickname") await member.setNickname(interaction.options.getString("nickname"));
      return interaction.reply(v2("Moderation action completed",`${cmd} action completed for ${user}.`));
    }
    if (cmd==="purge" || cmd==="slowmode" || cmd==="lock" || cmd==="unlock") {
      if (!commandAccess(interaction,cmd)) return deny(interaction);
      if (cmd==="purge") { const n=interaction.options.getInteger("amount"); const deleted=await interaction.channel.bulkDelete(n,true); return interaction.reply({ ...v2("Messages deleted",`${deleted.size} messages were deleted.`),ephemeral:true }); }
      if (cmd==="slowmode") { const n=interaction.options.getInteger("seconds"); await interaction.channel.setRateLimitPerUser(n); return interaction.reply(v2("Slowmode updated",`Slowmode is now ${n} seconds.`)); }
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id,{SendMessages:cmd==="unlock" ? null : false});
      return interaction.reply(v2(cmd==="lock"?"Channel locked":"Channel unlocked",`This channel has been ${cmd==="lock"?"locked":"unlocked"}.`));
    }
  } catch (err) {
    console.error(err);
    const payload={ ...v2("Something went wrong","The command could not be completed. Check the bot console for details."),ephemeral:true };
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(()=>{});
      else await interaction.reply(payload).catch(()=>{});
    }
  }
});
client.login(TOKEN);
