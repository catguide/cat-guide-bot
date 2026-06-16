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

client.once('ready', async () => {
  console.log(`✅ Cat Guide Bot online as ${client.user.tag}`);

  const commands = [
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
