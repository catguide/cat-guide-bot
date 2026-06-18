require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

async function getRobloxUserId(username) {
  const res = await axios.post('https://users.roblox.com/v1/usernames/users', {
    usernames: [username], excludeBannedUsers: false
  }, { timeout: 8000 }).catch(() => null);
  return res?.data?.data?.[0] || null;
}

async function resolveTokensToIds(tokens) {
  if (!tokens.length) return [];
  const CHUNK = 100;
  const ids = [];
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    'Content-Type': 'application/json',
    ...(process.env.ROBLOX_COOKIE ? { 'Cookie': `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}` } : {})
  };
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);
    const batch = chunk.map(t => ({ token: t, type: 'AvatarHeadShot', size: '48x48', format: 'Png' }));
    let res = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await axios.post('https://thumbnails.roblox.com/v1/batch', batch, {
        headers, timeout: 10000
      }).catch(() => null);
      if (res?.data?.data?.length) break;
      await new Promise(r => setTimeout(r, 500));
    }
    const result = res?.data?.data?.map(d => d.targetId).filter(Boolean) || [];
    ids.push(...result);
  }
  return ids;
}

async function scrapeProfileForGame(targetUserId) {
  if (!process.env.ROBLOX_COOKIE) return null;
  try {
    // Roblox embedded page state enthält manchmal gameId auch bei Privacy
    const res = await axios.get(`https://www.roblox.com/users/${targetUserId}/profile`, {
      headers: {
        'Cookie': `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      timeout: 10000,
    }).catch(() => null);
    if (!res?.data) return null;
    const html = res.data;

    // Suche nach gameInstanceId / placeId im eingebetteten JS-State
    const instanceMatch = html.match(/"gameInstanceId"\s*:\s*"([^"]+)"/);
    const placeMatch = html.match(/"placeId"\s*:\s*(\d+)/);
    const jobMatch = html.match(/"jobId"\s*:\s*"([^"]+)"/);

    if ((instanceMatch || jobMatch) && placeMatch) {
      return {
        placeId: placeMatch[1],
        gameInstanceId: instanceMatch?.[1] || jobMatch?.[1],
      };
    }
    return null;
  } catch { return null; }
}

async function followUserToServer(targetUserId) {
  if (!process.env.ROBLOX_COOKIE) return null;
  try {
    const trackerId = Math.floor(Math.random() * 9999999999);
    const res = await axios.get(
      `https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestFollowUser&userId=${targetUserId}&isPartyLeader=false&browserTrackerId=${trackerId}`,
      {
        headers: {
          'Cookie': `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
          'User-Agent': 'Mozilla/5.0',
        },
        timeout: 10000,
        validateStatus: () => true,
      }
    ).catch(() => null);

    if (!res?.data) return null;
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    // status 2 = joining, jobId = server instance ID
    if (data.jobId && data.placeId) {
      return { placeId: data.placeId, gameInstanceId: data.jobId, status: data.status };
    }
    return null;
  } catch {
    return null;
  }
}

async function getUniversePlaces(placeId) {
  // Universe ID holen
  const uni = await axios.get(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000
  }).catch(() => null);
  const universeId = uni?.data?.universeId;
  if (!universeId) return [placeId];

  // Alle Places im Universe holen
  const places = await axios.get(`https://games.roblox.com/v1/games/${universeId}/places?sortOrder=Asc&limit=100`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000
  }).catch(() => null);

  const placeIds = places?.data?.data?.map(p => p.id).filter(Boolean) || [];
  return placeIds.length ? placeIds : [placeId];
}

async function findPlayerInGame(placeId, targetUserId) {
  return Promise.race([
    _scanAllPlaces(placeId, targetUserId),
    new Promise(resolve => setTimeout(() => resolve(null), 55000))
  ]);
}

async function _scanAllPlaces(rootPlaceId, targetUserId) {
  const placeIds = await getUniversePlaces(rootPlaceId);
  for (const pid of placeIds) {
    const result = await _scanServers(pid, targetUserId);
    if (result) return { ...result, placeId: pid };
  }
  return null;
}

async function _scanServers(placeId, targetUserId) {
  let cursor = '';
  const maxPages = 20;

  for (let page = 0; page < maxPages; page++) {
    const url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100${cursor ? `&cursor=${cursor}` : ''}`;
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000, validateStatus: () => true }).catch(() => null);
    if (!res?.data?.data?.length) break;

    const servers = res.data.data;

    // Alle Server dieser Seite parallel checken
    const hits = await Promise.all(servers.map(async server => {
      if (!server.playerTokens?.length) return null;
      const ids = await resolveTokensToIds(server.playerTokens);
      return ids.includes(targetUserId) ? server : null;
    }));

    const found = hits.find(h => h !== null);
    if (found) {
      return {
        serverId: found.id,
        players: found.playing,
        maxPlayers: found.maxPlayers,
        joinLink: `http://104.238.167.216:3000/join?placeId=${placeId}&gameInstanceId=${found.id}`
      };
    }

    cursor = res.data.nextPageCursor;
    if (!cursor) break;
  }

  return null;
}

async function getRobloxUser(username) {
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
            ? `https://www.roblox.com/games/start?placeId=${p.placeId}&gameInstanceId=${p.gameId}`
            : `https://www.roblox.com/games/start?placeId=${p.placeId}`,
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
      .setName('find')
      .setDescription('Roblox Spieler finden & direkt joinen')
      .addStringOption(opt =>
        opt.setName('username')
          .setDescription('Roblox Username')
          .setRequired(true))
      .addStringOption(opt =>
        opt.setName('placeid')
          .setDescription('Place ID des Spiels (nur nötig wenn User Privacy an hat)')
          .setRequired(false))
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

    const components = [];
    if (user.gameInfo) {
      embed.addFields({ name: '🎮 Spiel', value: user.gameInfo.gameName, inline: true });
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('🚀 Direkt joinen').setURL(user.gameInfo.joinLink).setStyle(ButtonStyle.Link),
        new ButtonBuilder().setLabel('🌐 Spiel öffnen').setURL(user.gameInfo.webLink).setStyle(ButtonStyle.Link),
      ));
    }

    return interaction.editReply({ embeds: [embed], components });
  }

  // ── Find Command ──
  if (interaction.commandName === 'find') {
    await interaction.deferReply();
    const username = interaction.options.getString('username');

    const userInfo = await getRobloxUserId(username);
    if (!userInfo) {
      return interaction.editReply({ content: `❌ Roblox User **${username}** nicht gefunden.` });
    }

    const manualPlaceId = interaction.options.getString('placeid');
    const headers = {
      'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Content-Type': 'application/json',
      ...(process.env.ROBLOX_COOKIE ? { 'Cookie': `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}` } : {})
    };

    // Trick 1: Profile-Scrape — Roblox-Seite enthält manchmal gameInstanceId
    const profileResult = await scrapeProfileForGame(userInfo.id);
    if (profileResult?.gameInstanceId) {
      const gameRes = await axios.get(`https://games.roblox.com/v1/games/multiget-place-details?placeIds=${profileResult.placeId}`, { headers }).catch(() => null);
      const gameName = gameRes?.data?.[0]?.name || `Place ${profileResult.placeId}`;
      const joinLink = `roblox://experiences/start?placeId=${profileResult.placeId}&gameInstanceId=${profileResult.gameInstanceId}`;
      return interaction.editReply({
        content: `✅ **${username} gefunden in ${gameName}!**\n\n🚀 Link in Adresszeile eingeben:\n\`\`\`\n${joinLink}\n\`\`\``,
      });
    }

    // Trick 2: Follow-User — Roblox Launcher folgt dem User direkt in seinen Server
    const followResult = await followUserToServer(userInfo.id);
    if (followResult?.gameInstanceId) {
      const gameRes = await axios.get(`https://games.roblox.com/v1/games/multiget-place-details?placeIds=${followResult.placeId}`, { headers }).catch(() => null);
      const gameName = gameRes?.data?.[0]?.name || `Place ${followResult.placeId}`;
      const joinLink = `roblox://experiences/start?placeId=${followResult.placeId}&gameInstanceId=${followResult.gameInstanceId}`;
      return interaction.editReply({
        content: `✅ **${username} gefunden in ${gameName}!**\n\n🚀 Link in Adresszeile eingeben:\n\`\`\`\n${joinLink}\n\`\`\``,
      });
    }

    // Wenn placeid manuell angegeben → direkt scannen ohne Presence
    if (manualPlaceId) {
      const gameRes = await axios.get(`https://games.roblox.com/v1/games/multiget-place-details?placeIds=${manualPlaceId}`, { headers }).catch(() => null);
      const gameName = gameRes?.data?.[0]?.name || `Place ${manualPlaceId}`;
      await interaction.editReply({ content: `🔍 Scanne **${gameName}** nach **${username}**...` });
      const result = await findPlayerInGame(manualPlaceId, userInfo.id);
      if (!result) return interaction.editReply({ content: `❌ **${username}** nicht in **${gameName}** gefunden (oder privater Server).` });
      const joinLink = `roblox://experiences/start?placeId=${result.placeId || manualPlaceId}&gameInstanceId=${result.serverId}`;
      return interaction.editReply({
        content: `✅ **${username} gefunden in ${gameName}!** (${result.players}/${result.maxPlayers} Spieler)\n\n🚀 Link in Adresszeile eingeben:\n\`\`\`\n${joinLink}\n\`\`\``,
      });
    }

    // Presence holen um placeId zu kriegen
    const presence = await axios.post('https://presence.roblox.com/v1/presence/users',
      { userIds: [userInfo.id] }, { headers, timeout: 8000 }).catch(() => null);
    const p = presence?.data?.userPresences?.[0];

    if (!p || p.userPresenceType !== 2) {
      return interaction.editReply({ content: `❌ **${username}** ist gerade nicht in Roblox.` });
    }

    // placeId + gameId bekannt → direkt
    if (p.placeId && p.gameId) {
      const gameRes = await axios.get(`https://games.roblox.com/v1/games/multiget-place-details?placeIds=${p.placeId}`, { headers }).catch(() => null);
      const gameName = gameRes?.data?.[0]?.name || `Place ${p.placeId}`;
      const joinLink = `roblox://experiences/start?placeId=${p.placeId}&gameInstanceId=${p.gameId}`;
      return interaction.editReply({
        content: `✅ **${username} gefunden in ${gameName}!**\n\n🚀 Link in Adresszeile eingeben:\n\`\`\`\n${joinLink}\n\`\`\``,
      });
    }

    // placeId unbekannt (Privacy) → Hinweis mit placeid Option
    if (!p.placeId) {
      return interaction.editReply({ content: `❌ **${username}** hat Privacy aktiviert.\nWenn du weißt in welchem Spiel er ist: \`/find username:${username} placeid:PLACE_ID\`` });
    }

    // placeId bekannt aber kein gameId → Server scannen
    await interaction.editReply({ content: `🔍 Scanne Server nach **${username}**...` });
    const result = await findPlayerInGame(p.placeId, userInfo.id);
    const gameRes2 = await axios.get(`https://games.roblox.com/v1/games/multiget-place-details?placeIds=${p.placeId}`, { headers }).catch(() => null);
    const gameName2 = gameRes2?.data?.[0]?.name || `Place ${p.placeId}`;

    if (!result) return interaction.editReply({ content: `❌ **${username}** ist in **${gameName2}** aber nicht gefunden.\nHinweis: Falls er in einem öffentlichen Server ist, nochmal versuchen — manchmal schlägt der Scan fehl.\nFalls privater Server: \`/find username:${username} placeid:${p.placeId}\`` });

    const joinLink2 = `roblox://experiences/start?placeId=${result.placeId || p.placeId}&gameInstanceId=${result.serverId}`;
    return interaction.editReply({
      content: `✅ **${username} gefunden in ${gameName2}!** (${result.players}/${result.maxPlayers} Spieler)\n\n🚀 Link in Adresszeile eingeben:\n\`\`\`\n${joinLink2}\n\`\`\``,
    });
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
