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
    ticketPanelChannel: null, serverLogChannel: null, ticketCounter: 0, infractionCounter: 0, accessRoles: {}, modules: {}
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

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates], partials: [Partials.Channel] });
async function sendLog(guild, channelId, title, body) {
  if (!channelId) return false;
  const ch = await guild.channels.fetch(channelId).catch(()=>null);
  if (!ch?.isTextBased()) return false;
  await ch.send(v2(title, body));
  return true;
}
async function sendServerActivityLog(guild, title, body) {
  const cfg = cfgFor(guild.id);
  if (!cfg.serverLogChannel) return false;
  const channel = await guild.channels.fetch(cfg.serverLogChannel).catch(() => null);
  if (!channel?.isTextBased()) return false;
  const card = new ContainerBuilder()
    .setAccentColor(0x9A6324)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Server:** ${guild.name}\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`));
  await channel.send({ components: [card], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  return true;
}
function ticketInfo(channelId) {
  for (const [gid, g] of Object.entries(db)) {
    const rec = g.tickets?.[channelId];
    if (rec) return { guildId: gid, config: g, record: rec };
  }
  return null;
}
const TICKET_TYPES = {
  general: {
    label: "General Support",
    description: "Questions, general assistance, or help with the department server.",
    channelPrefix: "support"
  },
  internal_affairs: {
    label: "Internal Affairs",
    description: "Submit a confidential concern or complaint involving department personnel or conduct. Please provide relevant details and evidence.",
    channelPrefix: "ia"
  },
  department_admin: {
    label: "Department Administration",
    description: "Department-level administrative matters, rank or role concerns, records corrections, and general management requests.",
    channelPrefix: "admin"
  }
};

async function createTicket(interaction, ticketType = "general") {
  const cfg = cfgFor(interaction.guildId);
  const type = TICKET_TYPES[ticketType] || TICKET_TYPES.general;
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
    name: `${type.channelPrefix}-${String(cfg.ticketCounter).padStart(4,"0")}`,
    type: ChannelType.GuildText, parent: cfg.ticketCategory,
    topic: `ticket-owner:${interaction.user.id}; ticket-type:${ticketType}`,
    permissionOverwrites: overwrites
  });
  cfg.tickets ??= {};
  cfg.tickets[channel.id] = { userId: interaction.user.id, openedAt: Date.now(), claimedBy: null, closed: false, type: ticketType, typeLabel: type.label };
  save();
  const ping = cfg.ticketPingRole ? `<@&${cfg.ticketPingRole}>` : "";
  await channel.send({ ...v2(type.label, `Hello ${interaction.user}. Your **${type.label}** ticket is open.\n\n${type.description}\n\nPlease explain your request clearly and include any relevant information. A staff member will assist you as soon as possible.`), allowedMentions: { users: [interaction.user.id], roles: cfg.ticketPingRole ? [cfg.ticketPingRole] : [] } });
  if (ping) await channel.send({ content: ping, allowedMentions: { roles: [cfg.ticketPingRole] } });
  await sendLog(interaction.guild, cfg.ticketLogChannel, "Ticket opened", `**Section:** ${type.label}\n**Channel:** ${channel}\n**Opened by:** ${interaction.user}\n**Ticket:** ${channel.name}`);
  return interaction.reply({ ...v2("Ticket created", `Your **${type.label}** ticket is ready: ${channel}`), ephemeral: true });
}
async function configureStart(interaction) {
  const options = [
    ["infractionChannel","Infraction log channel"],["promotionChannel","Promotion log channel"],
    ["ticketLogChannel","Ticket log channel"],["serverLogChannel","Server activity log channel"],["ticketPanelChannel","Ticket panel channel"],
    ["ticketCategory","Open ticket category"],["closedCategory","Closed ticket category"],
    ["supportRole","Support staff role"],["ticketPingRole","Role pinged when a ticket opens"]
  ];
  const menu = new StringSelectMenuBuilder().setCustomId("cfg_pick").setPlaceholder("Choose a setting to configure").addOptions(options.map(([v,n])=>({label:n,value:v})));
  const cfg = cfgFor(interaction.guildId);
  return interaction.reply({ ...v2("Department configuration", "Select a setting below. Each channel and role can be configured separately.\n\n"+
    `Infraction logs: ${cfg.infractionChannel ? `<#${cfg.infractionChannel}>` : "Not set"}\n`+
    `Promotion logs: ${cfg.promotionChannel ? `<#${cfg.promotionChannel}>` : "Not set"}\n`+
    `Server activity logs: ${cfg.serverLogChannel ? `<#${cfg.serverLogChannel}>` : "Not set"}\n`+
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
  return ({infractionChannel:"Infraction log channel",promotionChannel:"Promotion log channel",ticketLogChannel:"Ticket log channel",serverLogChannel:"Server activity log channel",ticketPanelChannel:"Ticket panel channel",ticketCategory:"Open ticket category",closedCategory:"Closed ticket category",supportRole:"Support staff role",ticketPingRole:"Ticket notification role"})[k] || k;
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
    const ticketMenu = new StringSelectMenuBuilder()
      .setCustomId("ticket_type")
      .setPlaceholder("Choose the section you need")
      .addOptions(
        { label: "General Support", value: "general", description: "Questions, assistance, or server-related help." },
        { label: "Internal Affairs", value: "internal_affairs", description: "Confidential concerns or complaints about personnel conduct." },
        { label: "Department Administration", value: "department_admin", description: "Rank, role, records, or department management matters." }
      );
    const row = new ActionRowBuilder().addComponents(ticketMenu);
    const panelText = "Select the section that best matches your request. A private ticket will be created and only you and authorized department staff will be able to view it.\n\n**General Support**\nFor general questions, assistance, server issues, or help navigating department services.\n\n**Internal Affairs**\nFor confidential concerns, complaints, or reports involving department personnel or conduct. Include relevant details and any supporting information.\n\n**Department Administration**\nFor administrative requests involving department management, rank or role concerns, records corrections, or other official department matters.\n\nPlease choose the most appropriate section and provide clear, accurate information once your ticket opens.";
    await ch.send(v2("Department Support Center", panelText, row));
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
// Server activity logging. Configure the destination with /configure -> Server activity log channel.
client.on(Events.GuildMemberAdd, member => {
  sendServerActivityLog(member.guild, "Member joined", `**Member:** ${member.user.tag} (${member})\n**Account created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:F`).catch(console.error);
});
client.on(Events.GuildMemberRemove, member => {
  sendServerActivityLog(member.guild, "Member left", `**Member:** ${member.user?.tag || member.id}\n**User ID:** ${member.id}`).catch(console.error);
});
client.on(Events.MessageDelete, message => {
  if (!message.guild || message.author?.bot) return;
  const content = message.content ? message.content.slice(0, 1200) : "[No cached message content]";
  sendServerActivityLog(message.guild, "Message deleted", `**Author:** ${message.author?.tag || "Unknown"}\n**Channel:** ${message.channel}\n**Content:**\n${content}`).catch(console.error);
});
client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  const before = (oldMessage.content || "[Unavailable]").slice(0, 900);
  const after = (newMessage.content || "[Empty]").slice(0, 900);
  sendServerActivityLog(newMessage.guild, "Message edited", `**Author:** ${newMessage.author?.tag || "Unknown"}\n**Channel:** ${newMessage.channel}\n**Before:**\n${before}\n\n**After:**\n${after}\n**Message:** [Jump to message](${newMessage.url})`).catch(console.error);
});
client.on(Events.GuildBanAdd, ban => {
  sendServerActivityLog(ban.guild, "Member banned", `**Member:** ${ban.user.tag}\n**User ID:** ${ban.user.id}\n**Reason:** ${ban.reason || "No reason provided"}`).catch(console.error);
});
client.on(Events.GuildBanRemove, ban => {
  sendServerActivityLog(ban.guild, "Member unbanned", `**Member:** ${ban.user.tag}\n**User ID:** ${ban.user.id}`).catch(console.error);
});
client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  const changes = [];
  if (oldMember.nickname !== newMember.nickname) changes.push(`**Nickname:** ${oldMember.nickname || oldMember.user.username} → ${newMember.nickname || newMember.user.username}`);
  const added = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
  const removed = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
  if (added.size) changes.push(`**Roles added:** ${added.map(role => role.name).join(", ")}`);
  if (removed.size) changes.push(`**Roles removed:** ${removed.map(role => role.name).join(", ")}`);
  const oldTimeout = oldMember.communicationDisabledUntilTimestamp || null;
  const newTimeout = newMember.communicationDisabledUntilTimestamp || null;
  if (oldTimeout !== newTimeout) changes.push(`**Timeout:** ${newTimeout ? `until <t:${Math.floor(newTimeout / 1000)}:F` : "removed"}`);
  if (!changes.length) return;
  sendServerActivityLog(newMember.guild, "Member updated", `**Member:** ${newMember.user.tag} (${newMember})\n${changes.join("\n")}`).catch(console.error);
});
client.on(Events.ChannelCreate, channel => {
  if (channel.guild) sendServerActivityLog(channel.guild, "Channel created", `**Channel:** ${channel.name}\n**Type:** ${channel.type}\n**Channel ID:** ${channel.id}`).catch(console.error);
});
client.on(Events.ChannelDelete, channel => {
  if (channel.guild) sendServerActivityLog(channel.guild, "Channel deleted", `**Channel:** ${channel.name}\n**Channel ID:** ${channel.id}`).catch(console.error);
});
client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
  if (!newChannel.guild) return;
  const changes = [];
  if (oldChannel.name !== newChannel.name) changes.push(`**Name:** ${oldChannel.name} → ${newChannel.name}`);
  if (oldChannel.topic !== newChannel.topic && "topic" in newChannel) changes.push(`**Topic:** ${newChannel.topic || "Cleared"}`);
  if (!changes.length) return;
  sendServerActivityLog(newChannel.guild, "Channel updated", `**Channel:** ${newChannel}\n${changes.join("\n")}`).catch(console.error);
});
client.on(Events.RoleCreate, role => {
  sendServerActivityLog(role.guild, "Role created", `**Role:** ${role.name}\n**Role ID:** ${role.id}`).catch(console.error);
});
client.on(Events.RoleDelete, role => {
  sendServerActivityLog(role.guild, "Role deleted", `**Role:** ${role.name}\n**Role ID:** ${role.id}`).catch(console.error);
});
client.on(Events.RoleUpdate, (oldRole, newRole) => {
  const changes = [];
  if (oldRole.name !== newRole.name) changes.push(`**Name:** ${oldRole.name} → ${newRole.name}`);
  if (oldRole.hexColor !== newRole.hexColor) changes.push(`**Color:** ${oldRole.hexColor} → ${newRole.hexColor}`);
  if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push("**Permissions:** Updated");
  if (!changes.length) return;
  sendServerActivityLog(newRole.guild, "Role updated", `**Role:** ${newRole}\n${changes.join("\n")}`).catch(console.error);
});
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const member = newState.member || oldState.member;
  const guild = newState.guild || oldState.guild;
  if (!member || !guild) return;
  if (!oldState.channelId && newState.channelId) {
    sendServerActivityLog(guild, "Voice channel joined", `**Member:** ${member.user.tag}\n**Channel:** ${newState.channel}`).catch(console.error);
  } else if (oldState.channelId && !newState.channelId) {
    sendServerActivityLog(guild, "Voice channel left", `**Member:** ${member.user.tag}\n**Channel:** ${oldState.channel}`).catch(console.error);
  } else if (oldState.channelId !== newState.channelId) {
    sendServerActivityLog(guild, "Voice channel switched", `**Member:** ${member.user.tag}\n**From:** ${oldState.channel}\n**To:** ${newState.channel}`).catch(console.error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_type") return createTicket(interaction, interaction.values[0]);
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
      const issuedAt = new Date();
      const dateText = issuedAt.toLocaleString("en-US", {
        month: "2-digit", day: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZoneName: "short"
      });

      // Components V2 infraction card. Accent color matches the brown used previously.
      const infractionCard = new ContainerBuilder()
        .setAccentColor(0x9A6324)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## Employee Infraction\n**Infraction issued by ${interaction.user.tag}**`)
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### Member\n${user}\n\nUnfortunately, ${member?.displayName || user.username}, our administrative team has decided to issue an infraction due to your actions.`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**Punishment:**\n${punishment}\n\n**Infraction Reason:**\n${reason}\n\n**Appeal Status:**\nNot yet appealed\n\n**Issued by:**\n${interaction.user}`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Infraction ID:** ${infractionId} | ${dateText}`)
        );

      await logChannel.send({
        components: [infractionCard],
        flags: MessageFlags.IsComponentsV2
      });

      return interaction.reply({
        ...v2("Infraction recorded", `The infraction for ${user} was posted to ${logChannel}.\n**Infraction ID:** ${infractionId}`),
        ephemeral: true
      });
    }
    if (cmd === "promote") {
      if (!commandAccess(interaction, "promote")) return deny(interaction);

      const user = interaction.options.getUser("member");
      const rank = clean(interaction.options.getString("rank"));
      const reason = clean(interaction.options.getString("reason"));
      const cfg = cfgFor(interaction.guildId);
      const logChannel = cfg.promotionChannel
        ? await interaction.guild.channels.fetch(cfg.promotionChannel).catch(() => null)
        : null;

      if (!logChannel?.isTextBased()) {
        return interaction.reply({
          ...v2("Promotion log channel missing", "Set the promotion log channel in `/configure` before recording a promotion."),
          ephemeral: true
        });
      }

      const promotedAt = new Date();
      const dateText = promotedAt.toLocaleString("en-US", {
        month: "2-digit", day: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZoneName: "short"
      });

      // Components V2 promotion card, using the same brown accent as the infraction card.
      const promotionCard = new ContainerBuilder()
        .setAccentColor(0x9A6324)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("## User Promoted")
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**User promoted:**\n${user}`)
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**Rank promoted:**\n${rank}\n\n**Reason for promotion:**\n${reason}\n\n**User who promoted:**\n${interaction.user}`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Promotion date:** ${dateText}`)
        );

      await logChannel.send({
        components: [promotionCard],
        flags: MessageFlags.IsComponentsV2
      });

      return interaction.reply({
        ...v2("Promotion recorded", `The promotion for ${user} was posted to ${logChannel}.`),
        ephemeral: true
      });
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
