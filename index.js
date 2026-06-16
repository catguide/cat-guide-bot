require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const PLATFORMS = require('./platforms');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

async function checkPlatform(platform, username) {
  const url = platform.url.replace(/\{\}/g, encodeURIComponent(username));
  try {
    const res = await axios.get(url, {
      timeout: 7000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
      },
      validateStatus: () => true,
      maxRedirects: 5
    });

    // Finale URL nach Redirects prüfen — wenn sie 404/error enthält = nicht gefunden
    const finalUrl = res.request?.res?.responseUrl || res.config?.url || url;
    if (finalUrl.includes('404') || finalUrl.includes('error') || finalUrl.includes('not-found') || finalUrl.includes('notfound')) {
      return { found: false, url, name: platform.name };
    }

    if (platform.errorType === 'status_code') {
      return { found: res.status === 200, url, name: platform.name };
    }

    if (platform.errorType === 'redirect') {
      const finalUrl = res.request?.res?.responseUrl || res.config?.url || url;
      return { found: !finalUrl.includes(platform.errorUrl), url, name: platform.name };
    }

    if (platform.errorType === 'message') {
      const errorMsg = platform.errorMsg.replace(/\{\}/g, username);
      const bodyText = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      const notFound = bodyText.toLowerCase().includes(errorMsg.toLowerCase());
      return { found: res.status === 200 && !notFound, url, name: platform.name };
    }

    return { found: false, url, name: platform.name };
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
      validateStatus: () => true
    });
    return res.status === 200 && !res.data?.includes('User not found');
  } catch {
    return false;
  }
}

async function getRobloxUser(username) {
  const search = await axios.get(`https://users.roblox.com/v1/usernames/users`, {
    method: 'POST',
    data: { usernames: [username], excludeBannedUsers: false },
    timeout: 8000
  }).catch(() => null);

  // POST via axios
  const res = await axios.post('https://users.roblox.com/v1/usernames/users', {
    usernames: [username], excludeBannedUsers: false
  }, { timeout: 8000 }).catch(() => null);

  if (!res?.data?.data?.[0]) return null;
  const user = res.data.data[0];

  // Details holen
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...(process.env.ROBLOX_COOKIE ? { 'Cookie': `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}` } : {})
  };

  const [details, presence, avatar] = await Promise.all([
    axios.get(`https://users.roblox.com/v1/users/${user.id}`, { headers }).catch(() => null),
    axios.post('https://presence.roblox.com/v1/presence/users', { userIds: [user.id] }, { headers }).catch(() => null),
    axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png`, { headers }).catch(() => null),
  ]);

  const p = presence?.data?.userPresences?.[0];
  const avatarUrl = avatar?.data?.data?.[0]?.imageUrl;

  let statusText = '⚫ Offline';
  let gameInfo = null;

  if (p) {
    if (p.userPresenceType === 0) statusText = '⚫ Offline';
    else if (p.userPresenceType === 1) statusText = '🟢 Online (Website)';
    else if (p.userPresenceType === 2) {
      let gameName = p.lastLocation || null;
      if (!gameName && p.placeId) {
        const placeDetails = await axios.get(
          `https://games.roblox.com/v1/games/multiget-place-details?placeIds=${p.placeId}`,
          { headers, timeout: 5000 }
        ).catch(() => null);
        gameName = placeDetails?.data?.[0]?.name || null;
      }
      gameName = gameName || 'Unbekannt';
      statusText = `🎮 Im Spiel: **${gameName}**`;
      if (p.placeId) {
        gameInfo = {
          placeId: p.placeId,
          gameId: p.gameId || null,
          joinLink: p.gameId
            ? `roblox://experiences/start?placeId=${p.placeId}&gameInstanceId=${p.gameId}`
            : `roblox://experiences/start?placeId=${p.placeId}`,
          webLink: `https://www.roblox.com/games/${p.placeId}`,
          gameName
        };
      }
    }
    else if (p.userPresenceType === 3) statusText = '🎮 Im Roblox Studio';
  }

  return {
    id: user.id,
    name: user.name,
    displayName: user.displayName,
    description: details?.data?.description || '',
    created: details?.data?.created,
    isBanned: details?.data?.isBanned,
    avatarUrl,
    statusText,
    gameInfo,
  };
}

client.once('ready', async () => {
  console.log(`✅ Cat Guide Bot online as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('roblox')
      .setDescription('Roblox User suchen — Status, aktuelles Spiel & Join-Link')
      .addStringOption(opt =>
        opt.setName('username')
          .setDescription('Roblox Username')
          .setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('scan')
      .setDescription('Ultra-Scan: Discord User oder Namen über 50+ Plattformen suchen')
      .addUserOption(opt =>
        opt.setName('user')
          .setDescription('Discord User scannen (verlinkte Accounts + Internet-Scan)')
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

  // ── Roblox Command ──
  if (interaction.commandName === 'roblox') {
    await interaction.deferReply();
    const username = interaction.options.getString('username');
    const user = await getRobloxUser(username);

    if (!user) {
      return interaction.editReply({ content: `❌ Roblox User **${username}** nicht gefunden.` });
    }

    const createdDate = user.created
      ? `<t:${Math.floor(new Date(user.created).getTime() / 1000)}:D>`
      : 'Unbekannt';

    const embed = new EmbedBuilder()
      .setTitle(`🎮 ${user.displayName} (@${user.name})`)
      .setColor(user.gameInfo ? 0x57f287 : 0x2b2d31)
      .setURL(`https://www.roblox.com/users/${user.id}/profile`)
      .addFields(
        { name: '🆔 User ID', value: `\`${user.id}\``, inline: true },
        { name: '📅 Erstellt', value: createdDate, inline: true },
        { name: '🚫 Gebannt', value: user.isBanned ? 'Ja' : 'Nein', inline: true },
        { name: '📡 Status', value: user.statusText, inline: false },
      )
      .setFooter({ text: 'Cat Guide Investigation Bot' })
      .setTimestamp();

    if (user.avatarUrl) embed.setThumbnail(user.avatarUrl);
    if (user.description) embed.setDescription(`> ${user.description.slice(0, 200)}`);

    if (user.gameInfo) {
      embed.addFields(
        { name: '🌐 Spiel öffnen', value: `[Roblox Web](${user.gameInfo.webLink})`, inline: true },
        { name: '🚀 Direkt joinen', value: `[Join Link](${user.gameInfo.joinLink})`, inline: true },
      );
    }

    return interaction.editReply({ embeds: [embed] });
  }

  if (interaction.commandName !== 'scan') return;

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user');
  const targetName = interaction.options.getString('name');

  if (!targetUser && !targetName) {
    return interaction.editReply({ content: '❌ Bitte einen User oder Namen angeben.' });
  }

  // ── Discord User Scan ──
  if (targetUser) {
    const fetchedUser = await client.users.fetch(targetUser.id, { force: true }).catch(() => targetUser);
    const member = await interaction.guild?.members.fetch({ user: targetUser.id, force: true }).catch(() => null);
    const avatarUrl = fetchedUser.displayAvatarURL({ size: 256, extension: 'png' });
    const createdAt = `<t:${Math.floor(fetchedUser.createdTimestamp / 1000)}:F>`;
    const joinedAt = member?.joinedTimestamp
      ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
      : 'Unbekannt';

    // Verlinkte Accounts
    const connectedAccounts = [];
    let connectionsText = 'Keine verlinkten Accounts sichtbar';
    try {
      const res = await axios.get(`https://discord.com/api/v10/users/${fetchedUser.id}/profile`, {
        headers: { Authorization: `Bot ${process.env.TOKEN}` }
      });
      if (res.data.connected_accounts?.length > 0) {
        res.data.connected_accounts.forEach(c => connectedAccounts.push({ type: c.type, name: c.name }));
        connectionsText = connectedAccounts.map(c => `**${c.type}**: \`${c.name}\``).join('\n');
      }
    } catch { }

    const doxbinHit = await checkDoxbin(fetchedUser.username);
    const tineyeUrl = `https://tineye.com/search?url=${encodeURIComponent(avatarUrl)}`;
    const googleImgUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(avatarUrl)}`;
    const googleSearchUrl = `https://www.google.com/search?q="${encodeURIComponent(fetchedUser.username)}"`;

    const profileEmbed = new EmbedBuilder()
      .setTitle(`🔍 Ultra-Scan — ${fetchedUser.username}`)
      .setColor(0x5865f2)
      .setThumbnail(avatarUrl)
      .addFields(
        { name: '👤 Username', value: `\`${fetchedUser.username}\``, inline: true },
        { name: '🆔 User ID', value: `\`${fetchedUser.id}\``, inline: true },
        { name: '📅 Account erstellt', value: createdAt },
        { name: '📥 Server beigetreten', value: joinedAt },
        { name: '🔗 Verlinkte Accounts', value: connectionsText },
        { name: '🚨 Doxbin', value: doxbinHit ? '⚠️ **Eintrag gefunden!**' : '✅ Kein Eintrag' },
        { name: '🖼️ Profilbild reverse suchen', value: `[TinEye](${tineyeUrl}) • [Google Lens](${googleImgUrl})` },
        { name: '🔎 Google', value: `[Hier klicken](${googleSearchUrl})` },
      )
      .setFooter({ text: 'Cat Guide Investigation Bot' })
      .setTimestamp();

    await interaction.editReply({ embeds: [profileEmbed] });

    // Internet-Scan für Discord-Username + alle verlinkten Account-Namen
    const namesToScan = [fetchedUser.username, ...connectedAccounts.map(c => c.name)];
    const uniqueNames = [...new Set(namesToScan)];

    for (const name of uniqueNames) {
      const results = await runScan(name);
      const found = results.filter(r => r.found);
      const notFound = results.filter(r => !r.found);

      if (found.length === 0 && name !== fetchedUser.username) continue;

      const scanEmbed = new EmbedBuilder()
        .setTitle(`🌐 Internet-Scan — \`${name}\``)
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
          }
        )
        .setFooter({ text: 'Cat Guide Investigation Bot' })
        .setTimestamp();

      await interaction.followUp({ embeds: [scanEmbed] });
    }
    return;
  }

  // ── Direkte Suche nach Name ──
  if (targetName) {
    const loadingEmbed = new EmbedBuilder()
      .setTitle(`🔍 Scanne \`${targetName}\`...`)
      .setColor(0xfaa61a)
      .setDescription(`Durchsuche ${PLATFORMS.length} Plattformen — bitte warten...`)
      .setFooter({ text: 'Cat Guide Investigation Bot' });

    await interaction.editReply({ embeds: [loadingEmbed] });

    const [results, doxbinHit] = await Promise.all([
      runScan(targetName),
      checkDoxbin(targetName)
    ]);

    const found = results.filter(r => r.found);
    const notFound = results.filter(r => !r.found);
    const googleSearchUrl = `https://www.google.com/search?q="${encodeURIComponent(targetName)}"`;

    const resultEmbed = new EmbedBuilder()
      .setTitle(`📋 Ergebnis — \`${targetName}\``)
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
          value: doxbinHit ? '⚠️ **Eintrag gefunden!**' : '✅ Kein Eintrag',
        },
        {
          name: '🔎 Google',
          value: `[Hier klicken](${googleSearchUrl})`,
        }
      )
      .setFooter({ text: 'Cat Guide Investigation Bot' })
      .setTimestamp();

    await interaction.editReply({ embeds: [resultEmbed] });
  }
});

client.login(process.env.TOKEN);
