require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
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
  { name: 'Keybase', url: 'https://keybase.io/{}' },
  { name: 'Letterboxd', url: 'https://letterboxd.com/{}' },
  { name: 'Last.fm', url: 'https://www.last.fm/user/{}' },
  { name: 'Flickr', url: 'https://www.flickr.com/people/{}' },
  { name: 'Vimeo', url: 'https://vimeo.com/{}' },
  { name: 'Medium', url: 'https://medium.com/@{}' },
  { name: 'Substack', url: 'https://{}.substack.com' },
  { name: 'Linktree', url: 'https://linktr.ee/{}' },
  { name: 'Ko-fi', url: 'https://ko-fi.com/{}' },
  { name: 'Cashapp', url: 'https://cash.app/${}' },
  { name: 'Venmo', url: 'https://venmo.com/{}' },
  { name: 'Behance', url: 'https://www.behance.net/{}' },
  { name: 'Dribbble', url: 'https://dribbble.com/{}' },
  { name: 'Hackerrank', url: 'https://www.hackerrank.com/{}' },
  { name: 'Leetcode', url: 'https://leetcode.com/{}' },
  { name: 'Codeforces', url: 'https://codeforces.com/profile/{}' },
  { name: 'Npmjs', url: 'https://www.npmjs.com/~{}' },
  { name: 'DockerHub', url: 'https://hub.docker.com/u/{}' },
  { name: 'Trello', url: 'https://trello.com/{}' },
  { name: 'ProductHunt', url: 'https://www.producthunt.com/@{}' },
  { name: 'Quora', url: 'https://www.quora.com/profile/{}' },
  { name: 'Periscope', url: 'https://www.periscope.tv/{}' },
  { name: 'Minds', url: 'https://www.minds.com/{}' },
  { name: 'Mastodon', url: 'https://mastodon.social/@{}' },
  { name: 'Bluesky', url: 'https://bsky.app/profile/{}' },
  { name: 'Chess.com', url: 'https://www.chess.com/member/{}' },
  { name: 'Duolingo', url: 'https://www.duolingo.com/profile/{}' },
  { name: 'Wattpad', url: 'https://www.wattpad.com/user/{}' },
  { name: 'Furaffinity', url: 'https://www.furaffinity.net/user/{}' },
];

// Username-Varianten generieren
function generateVariants(username) {
  const base = username.toLowerCase().replace(/[^a-z0-9]/g, '');
  const variants = new Set([
    username,
    username.toLowerCase(),
    base,
    `${base}1`,
    `${base}2`,
    `${base}99`,
    `${base}_`,
    `_${base}`,
    `the${base}`,
    `${base}yt`,
    `${base}tv`,
    `real${base}`,
    `official${base}`,
    `x${base}`,
  ]);
  return [...variants].filter(v => v.length >= 2);
}

async function checkPlatform(platform, username) {
  const url = platform.url.replace('{}', encodeURIComponent(username));
  try {
    const res = await axios.get(url, {
      timeout: 6000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      validateStatus: (s) => s < 500
    });
    return { found: res.status === 200, url, name: platform.name };
  } catch {
    return { found: false, url, name: platform.name };
  }
}

async function runScan(username) {
  return Promise.all(PLATFORMS.map(p => checkPlatform(p, username)));
}

async function checkDoxbin(username) {
  try {
    const res = await axios.get(`https://doxbin.com/user/${encodeURIComponent(username)}`, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      validateStatus: (s) => s < 500
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

client.once('ready', async () => {
  console.log(`✅ Cat Guide Bot online as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('scan')
      .setDescription('Ultra-Scan: Discord User oder Name — findet alles im Internet')
      .addUserOption(opt =>
        opt.setName('user')
          .setDescription('Discord User scannen')
          .setRequired(false))
      .addStringOption(opt =>
        opt.setName('name')
          .setDescription('Name oder Username direkt suchen')
          .setRequired(false))
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
  const targetName = interaction.options.getString('name');

  if (!targetUser && !targetName) {
    return interaction.editReply({ content: '❌ Bitte einen User oder Namen angeben.' });
  }

  // ── Discord User Ultra-Scan ──
  if (targetUser) {
    const fetchedUser = await client.users.fetch(targetUser.id, { force: true }).catch(() => targetUser);
    const member = await interaction.guild?.members.fetch({ user: targetUser.id, force: true }).catch(() => null);
    const avatarUrl = fetchedUser.displayAvatarURL({ size: 256, extension: 'png' });

    const createdAt = `<t:${Math.floor(fetchedUser.createdTimestamp / 1000)}:F>`;
    const joinedAt = member?.joinedTimestamp
      ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
      : 'Unbekannt';

    // Verlinkte Accounts holen
    const connectedAccounts = [];
    let connectionsText = 'Keine verlinkten Accounts sichtbar';
    try {
      const res = await axios.get(`https://discord.com/api/v10/users/${fetchedUser.id}/profile`, {
        headers: { Authorization: `Bot ${process.env.TOKEN}` }
      });
      if (res.data.connected_accounts?.length > 0) {
        res.data.connected_accounts.forEach(c => connectedAccounts.push({ type: c.type, name: c.name }));
        connectionsText = connectedAccounts.map(c => `**${c.type}**: ${c.name}`).join('\n');
      }
    } catch {
      connectionsText = 'Keine verlinkten Accounts sichtbar';
    }

    // Reverse Image Search Links
    const tineyeUrl = `https://tineye.com/search?url=${encodeURIComponent(avatarUrl)}`;
    const googleImgUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(avatarUrl)}`;

    // Doxbin check
    const doxbinHit = await checkDoxbin(fetchedUser.username);

    // Google Suchlink
    const googleSearchUrl = `https://www.google.com/search?q="${encodeURIComponent(fetchedUser.username)}"`;

    const profileEmbed = new EmbedBuilder()
      .setTitle(`🔍 Ultra-Scan — ${fetchedUser.username}`)
      .setColor(0x2b2d31)
      .setThumbnail(avatarUrl)
      .addFields(
        { name: '👤 Username', value: fetchedUser.username, inline: true },
        { name: '🆔 User ID', value: fetchedUser.id, inline: true },
        { name: '🤖 Bot', value: fetchedUser.bot ? 'Ja' : 'Nein', inline: true },
        { name: '📅 Account erstellt', value: createdAt },
        { name: '📥 Server beigetreten', value: joinedAt },
        { name: '🔗 Verlinkte Accounts', value: connectionsText },
        { name: '🚨 Doxbin', value: doxbinHit ? '⚠️ Eintrag gefunden!' : '✅ Kein Eintrag' },
        { name: '🖼️ Profilbild suchen', value: `[TinEye](${tineyeUrl}) • [Google Lens](${googleImgUrl})` },
        { name: '🔎 Google Suche', value: `[Hier klicken](${googleSearchUrl})` },
      )
      .setFooter({ text: 'Cat Guide Investigation Bot' })
      .setTimestamp();

    await interaction.editReply({ embeds: [profileEmbed] });

    // Internet-Scan für Discord-Username + verlinkte Accounts
    const namesToScan = [fetchedUser.username, ...connectedAccounts.map(c => c.name)];
    const uniqueNames = [...new Set(namesToScan)];

    for (const name of uniqueNames) {
      const results = await runScan(name);
      const found = results.filter(r => r.found);
      const notFound = results.filter(r => !r.found);

      // Username-Varianten für gefundene Lücken
      const variants = generateVariants(name);
      const variantText = variants.slice(0, 8).join(', ');

      const scanEmbed = new EmbedBuilder()
        .setTitle(`🌐 Internet-Scan — "${name}"`)
        .setColor(found.length > 0 ? 0x57f287 : 0xed4245)
        .addFields(
          {
            name: `✅ Gefunden auf ${found.length} Plattformen`,
            value: found.length > 0
              ? found.map(r => `[${r.name}](${r.url})`).join('\n').slice(0, 1024)
              : 'Nichts gefunden',
          },
          {
            name: `❌ Nicht gefunden (${notFound.length})`,
            value: notFound.map(r => r.name).join(', ').slice(0, 1024) || '—',
          },
          {
            name: '🔄 Mögliche Varianten zum manuellen Prüfen',
            value: variantText || '—',
          }
        )
        .setFooter({ text: 'Cat Guide Investigation Bot' })
        .setTimestamp();

      await interaction.followUp({ embeds: [scanEmbed] });
    }
    return;
  }

  // ── Direkte Internet-Suche ──
  if (targetName) {
    const loadingEmbed = new EmbedBuilder()
      .setTitle(`🔍 Scanne "${targetName}"...`)
      .setColor(0xfaa61a)
      .setDescription('Bitte warten — durchsuche 50+ Plattformen...')
      .setFooter({ text: 'Cat Guide Investigation Bot' });

    await interaction.editReply({ embeds: [loadingEmbed] });

    const [results, doxbinHit] = await Promise.all([
      runScan(targetName),
      checkDoxbin(targetName)
    ]);

    const found = results.filter(r => r.found);
    const notFound = results.filter(r => !r.found);
    const variants = generateVariants(targetName);
    const googleSearchUrl = `https://www.google.com/search?q="${encodeURIComponent(targetName)}"`;

    const resultEmbed = new EmbedBuilder()
      .setTitle(`📋 Ergebnis — "${targetName}"`)
      .setColor(found.length > 0 ? 0x57f287 : 0xed4245)
      .addFields(
        {
          name: `✅ Gefunden auf ${found.length} Plattformen`,
          value: found.length > 0
            ? found.map(r => `[${r.name}](${r.url})`).join('\n').slice(0, 1024)
            : 'Nichts gefunden',
        },
        {
          name: `❌ Nicht gefunden (${notFound.length})`,
          value: notFound.map(r => r.name).join(', ').slice(0, 1024) || '—',
        },
        {
          name: '🚨 Doxbin',
          value: doxbinHit ? '⚠️ Eintrag gefunden!' : '✅ Kein Eintrag',
        },
        {
          name: '🔄 Mögliche Varianten',
          value: variants.slice(0, 8).join(', ') || '—',
        },
        {
          name: '🔎 Google Suche',
          value: `[Hier klicken](${googleSearchUrl})`,
        }
      )
      .setFooter({ text: 'Cat Guide Investigation Bot' })
      .setTimestamp();

    await interaction.editReply({ embeds: [resultEmbed] });
  }
});

client.login(process.env.TOKEN);
