require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const PLATFORMS = [
  { name: 'GitHub', url: 'https://github.com/{}' },
  { name: 'Reddit', url: 'https://www.reddit.com/user/{}' },
  { name: 'Twitter/X', url: 'https://twitter.com/{}' },
  { name: 'Instagram', url: 'https://www.instagram.com/{}' },
  { name: 'TikTok', url: 'https://www.tiktok.com/@{}' },
  { name: 'YouTube', url: 'https://www.youtube.com/@{}' },
  { name: 'Twitch', url: 'https://www.twitch.tv/{}' },
  { name: 'Pinterest', url: 'https://www.pinterest.com/{}' },
  { name: 'SoundCloud', url: 'https://soundcloud.com/{}' },
  { name: 'Steam', url: 'https://steamcommunity.com/id/{}' },
  { name: 'Roblox', url: 'https://www.roblox.com/user.aspx?username={}' },
  { name: 'Spotify', url: 'https://open.spotify.com/user/{}' },
  { name: 'Kick', url: 'https://kick.com/{}' },
  { name: 'Snapchat', url: 'https://www.snapchat.com/add/{}' },
  { name: 'LinkedIn', url: 'https://www.linkedin.com/in/{}' },
  { name: 'Tumblr', url: 'https://{}.tumblr.com' },
  { name: 'DeviantArt', url: 'https://www.deviantart.com/{}' },
  { name: 'Patreon', url: 'https://www.patreon.com/{}' },
  { name: 'Fiverr', url: 'https://www.fiverr.com/{}' },
  { name: 'Replit', url: 'https://replit.com/@{}' },
  { name: 'Gitlab', url: 'https://gitlab.com/{}' },
  { name: 'Npmjs', url: 'https://www.npmjs.com/~{}' },
  { name: 'Keybase', url: 'https://keybase.io/{}' },
  { name: 'Hackerrank', url: 'https://www.hackerrank.com/{}' },
  { name: 'Leetcode', url: 'https://leetcode.com/{}' },
];

async function checkPlatform(platform, username) {
  const url = platform.url.replace('{}', username);
  try {
    const res = await axios.get(url, {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      validateStatus: (s) => s < 500
    });
    if (res.status === 200) return { found: true, url };
    return { found: false, url };
  } catch {
    return { found: false, url };
  }
}

async function runScan(username) {
  const results = await Promise.all(
    PLATFORMS.map(p => checkPlatform(p, username).then(r => ({ name: p.name, ...r })))
  );
  return results;
}

client.once('ready', async () => {
  console.log(`✅ Cat Guide Bot online as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('scan')
      .setDescription('Scans the internet for everything found about a name or Discord user')
      .addStringOption(opt =>
        opt.setName('target')
          .setDescription('Username or name to scan')
          .setRequired(false))
      .addUserOption(opt =>
        opt.setName('user')
          .setDescription('Discord user to scan')
          .setRequired(false))
      .setIntegrationTypes([0, 1])
      .setContexts([0, 1, 2])
      .toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log('✅ Slash commands registered');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'scan') return;

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user');
  const targetName = interaction.options.getString('target');

  if (!targetUser && !targetName) {
    return interaction.editReply({ content: '❌ Please provide a username or mention a Discord user.' });
  }

  // ── Discord User Scan ──
  if (targetUser) {
    const member = interaction.guild?.members.cache.get(targetUser.id)
      || await interaction.guild?.members.fetch(targetUser.id).catch(() => null);

    const flags = targetUser.flags?.toArray() || [];
    const badgeMap = {
      Staff: '👨‍💼 Discord Staff',
      Partner: '🤝 Partner',
      Hypesquad: '🏠 HypeSquad Events',
      BugHunterLevel1: '🐛 Bug Hunter',
      BugHunterLevel2: '🐛 Bug Hunter Gold',
      HypeSquadOnlineHouse1: '🏠 Bravery',
      HypeSquadOnlineHouse2: '🏠 Brilliance',
      HypeSquadOnlineHouse3: '🏠 Balance',
      PremiumEarlySupporter: '⭐ Early Supporter',
      VerifiedDeveloper: '🤖 Verified Bot Developer',
      ActiveDeveloper: '🔧 Active Developer',
    };
    const badges = flags.map(f => badgeMap[f] || f).join('\n') || 'None';

    const createdAt = `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>`;
    const joinedAt = member?.joinedTimestamp
      ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
      : 'Unknown';

    const roles = member?.roles.cache
      .filter(r => r.id !== interaction.guild?.id)
      .map(r => r.toString())
      .join(', ') || 'None';

    // Fetch connected accounts via Discord API
    let connections = 'Not accessible (user must share)';
    const connectedNames = [];
    try {
      const res = await axios.get(`https://discord.com/api/v10/users/${targetUser.id}/profile`, {
        headers: { Authorization: `Bot ${process.env.TOKEN}` }
      });
      if (res.data.connected_accounts?.length > 0) {
        connections = res.data.connected_accounts
          .map(c => `**${c.type}**: ${c.name}`)
          .join('\n');
        res.data.connected_accounts.forEach(c => connectedNames.push(c.name));
      } else {
        connections = 'No linked accounts visible';
      }
    } catch {
      connections = 'No linked accounts visible';
    }

    const discordEmbed = new EmbedBuilder()
      .setTitle(`🔍 Investigation Report — ${targetUser.username}`)
      .setColor(0x2b2d31)
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '👤 Username', value: `${targetUser.username}`, inline: true },
        { name: '🆔 User ID', value: targetUser.id, inline: true },
        { name: '🤖 Bot', value: targetUser.bot ? 'Yes' : 'No', inline: true },
        { name: '📅 Account Created', value: createdAt, inline: false },
        { name: '📥 Joined Server', value: joinedAt, inline: false },
        { name: '🏅 Badges', value: badges, inline: false },
        { name: '🎭 Roles', value: roles.length > 1024 ? roles.slice(0, 1021) + '...' : roles, inline: false },
        { name: '🔗 Linked Accounts', value: connections, inline: false },
      )
      .setFooter({ text: 'Cat Guide Investigation Bot' })
      .setTimestamp();

    await interaction.editReply({ embeds: [discordEmbed] });

    // If we found connected account names, auto-scan them
    if (connectedNames.length > 0) {
      for (const name of connectedNames) {
        const scanResults = await runScan(name);
        const found = scanResults.filter(r => r.found);
        const notFound = scanResults.filter(r => !r.found);

        const scanEmbed = new EmbedBuilder()
          .setTitle(`🌐 Internet Scan — "${name}" (from linked accounts)`)
          .setColor(0x5865f2)
          .addFields(
            {
              name: `✅ Found on ${found.length} platforms`,
              value: found.length > 0
                ? found.map(r => `[${r.name}](${r.url})`).join('\n')
                : 'None found',
              inline: false
            },
            {
              name: `❌ Not found on ${notFound.length} platforms`,
              value: notFound.map(r => r.name).join(', ') || 'None',
              inline: false
            }
          )
          .setFooter({ text: 'Cat Guide Investigation Bot' })
          .setTimestamp();

        await interaction.followUp({ embeds: [scanEmbed] });
      }
    }
    return;
  }

  // ── Internet Username Scan ──
  if (targetName) {
    const loadingEmbed = new EmbedBuilder()
      .setTitle(`🔍 Scanning "${targetName}" across the internet...`)
      .setColor(0xfaa61a)
      .setDescription('Please wait, checking 25+ platforms...')
      .setFooter({ text: 'Cat Guide Investigation Bot' });

    await interaction.editReply({ embeds: [loadingEmbed] });

    const results = await runScan(targetName);
    const found = results.filter(r => r.found);
    const notFound = results.filter(r => !r.found);

    const resultEmbed = new EmbedBuilder()
      .setTitle(`📋 Investigation Report — "${targetName}"`)
      .setColor(found.length > 0 ? 0x57f287 : 0xed4245)
      .addFields(
        {
          name: `✅ Found on ${found.length} platforms`,
          value: found.length > 0
            ? found.map(r => `[${r.name}](${r.url})`).join('\n')
            : 'No accounts found',
          inline: false
        },
        {
          name: `❌ Not found on ${notFound.length} platforms`,
          value: notFound.map(r => r.name).join(', ') || 'None',
          inline: false
        }
      )
      .setFooter({ text: 'Cat Guide Investigation Bot' })
      .setTimestamp();

    await interaction.editReply({ embeds: [resultEmbed] });
  }
});

client.login(process.env.TOKEN);
