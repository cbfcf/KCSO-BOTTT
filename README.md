# Department Management Bot v2

## Requirements
- Node.js 20 or newer
- A Discord application/bot with the Server Members Intent enabled
- Bot permissions: Manage Channels, Manage Roles, Manage Messages, Moderate Members, Kick Members, Ban Members, View Channels, Send Messages, Read Message History, Attach Files

## Hosting
Install dependencies with `npm install`, then start with `npm start` (or `node index.js`).

Set these environment variables in your host:
- `DISCORD_TOKEN`: Bot token
- `CLIENT_ID`: Discord application ID
- `GUILD_ID`: Your Discord server ID

Do not upload your real bot token or `.env` file to GitHub.

## First-time setup
1. Invite the bot with the `bot` and `applications.commands` scopes.
2. Give it the permissions listed above and place its highest role above roles it must manage.
3. Start the bot. Slash commands are registered to the server in `GUILD_ID`.
4. Run `/configure` as a server administrator.
5. Set the infraction log channel and promotion log channel separately.
6. Set the open ticket category, optional closed ticket category, support role, ticket notification role, ticket log channel, and ticket panel channel.
7. Run `/ticket panel` in the channel where you want the panel, or choose a channel with the command option.

## Commands
- `/configure` - interactive configuration menu
- `/infraction member reason punishment`
- `/promote member rank reason`
- `/ticket panel|claim|close|reopen|delete|add|remove`
- `/ban`, `/kick`, `/timeout`, `/untimeout`, `/warn`, `/purge`, `/slowmode`, `/lock`, `/unlock`, `/nickname`
- `/embed title description channel`
- `/role give|remove`

## Notes
- Ticket open creates a private channel, notifies the configured ticket ping role, and logs ticket events.
- Closing a ticket generates a plain-text transcript of the latest 100 messages and sends it to the configured ticket log channel.
- Configure your ticket support role and notification role separately if you want different groups.
- Command access is open by default to members who have the relevant Discord permissions where required; administrators can always use the commands. Use the server's Discord role permissions to control who can invoke moderation commands.
- This project stores configuration in `data/guild-config.json`; keep the `data` folder persistent on your host.
