// musicbot.js
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder,
  ActivityType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");
const { LavalinkManager } = require("lavalink-client");

// جلب الإعدادات واللون العام من ملف الـ Config كما في index.js
let globalConfig = {};
try {
  globalConfig = require(`${process.cwd()}/config`);
} catch (e) {
  globalConfig = { prefix: "!", emco: "#000000" };
}
const emco = globalConfig.emco || "#000000";

const _fetch = global.fetch;

function safeReadJson(filePath, fallback) {
  try {
    if (!filePath) return fallback;
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJson(filePath, obj) {
  try {
    if (!filePath) return;
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
  } catch {}
}

function normalizeMentionPrefix(content, botId) {
  const a = `<@${botId}>`;
  const b = `<@!${botId}>`;
  if (content.startsWith(a)) return content.slice(a.length).trim();
  if (content.startsWith(b)) return content.slice(b.length).trim();
  return null;
}

function getQueueSize(player) {
  const q = player?.queue;
  if (!q) return 0;
  if (typeof q.size === "number") return q.size;
  if (typeof q.length === "number") return q.length;
  if (Array.isArray(q)) return q.length;
  if (Array.isArray(q.tracks)) return q.tracks.length;
  if (Array.isArray(q.items)) return q.items.length;
  return 0;
}

function getCurrentTrack(player) {
  return (
    player?.currentTrack ||
    player?.track ||
    player?.playingTrack ||
    player?.queue?.current ||
    player?.queue?.currentTrack ||
    null
  );
}

function trackTitle(track) {
  return track?.info?.title || "Unknown Track";
}
function trackUrl(track) {
  return track?.info?.uri || track?.info?.url || null;
}
function trackEncoded(track) {
  return track?.encoded || track?.track || track?.encodedTrack || null;
}

// دالة تحويل الوقت إلى صيغة نصية mm:ss لتطابق تماماً ملف index.js
function formatDuration(ms) {
  if (!ms || isNaN(ms)) return "00:00";
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  return `${hours ? hours + ':' : ''}${minutes < 10 ? '0' + minutes : minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
}

async function lavalinkPatchPlayer({ player, nodeHost, nodePort, nodePassword, nodeSecure, body }) {
  try {
    if (!_fetch) return { ok: false, via: "no_fetch" };
    const sessionId = player?.node?.sessionId || player?.node?.sessionID || player?.node?.session?.id || null;
    if (!sessionId) return { ok: false, via: "no_session" };

    const scheme = nodeSecure ? "https" : "http";
    const url = `${scheme}://${nodeHost}:${nodePort}/v4/sessions/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(player.guildId)}`;

    const res = await _fetch(url, {
      method: "PATCH",
      headers: { Authorization: nodePassword, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, via: `rest_${res.status}`, details: txt.slice(0, 200) };
    }
    return { ok: true, via: "rest_patch" };
  } catch (e) {
    return { ok: false, via: "rest_error", details: String(e?.message || e) };
  }
}

async function playSpecificTrack({ player, track, lavalink }) {
  const encoded = trackEncoded(track);
  try {
    if (typeof player.playTrack === "function") {
      await player.playTrack(track);
      return { ok: true, via: "playTrack" };
    }
  } catch {}
  try {
    if (typeof player.play === "function") {
      await player.play(track);
      return { ok: true, via: "play(track)" };
    }
  } catch {}

  if (!encoded) return { ok: false, via: "no_encoded" };
  return lavalinkPatchPlayer({
    player, nodeHost: lavalink.host, nodePort: lavalink.port, nodePassword: lavalink.password, nodeSecure: lavalink.secure,
    body: { track: { encoded } }
  });
}

async function setPlayerVolume({ player, volume, lavalink }) {
  const v = Math.max(0, Math.min(1000, Number(volume) || 0));
  try {
    if (typeof player.setVolume === "function") {
      await player.setVolume(v);
      return { ok: true, via: "setVolume" };
    }
  } catch {}
  return lavalinkPatchPlayer({
    player, nodeHost: lavalink.host, nodePort: lavalink.port, nodePassword: lavalink.password, nodeSecure: lavalink.secure,
    body: { volume: v }
  });
}

async function forceStopKeepConnected({ player, nodeHost, nodePort, nodePassword, nodeSecure }) {
  try {
    if (typeof player.stopTrack === "function") { await player.stopTrack(); return { ok: true, via: "stopTrack" }; }
  } catch {}
  try {
    if (typeof player.stop === "function") { await player.stop(); return { ok: true, via: "stop" }; }
  } catch {}
  return lavalinkPatchPlayer({
    player, nodeHost, nodePort, nodePassword, nodeSecure, body: { track: { encoded: null } }
  });
}

async function forceDisconnectAndDestroyPlayer({ player }) {
  try {
    try { if (typeof player.stopTrack === "function") await player.stopTrack().catch(() => {}); else if (typeof player.stop === "function") await player.stop().catch(() => {}); } catch {}
    try { if (typeof player.disconnect === "function") await player.disconnect().catch(() => {}); } catch {}
    try { if (typeof player.destroy === "function") await player.destroy().catch(() => {}); } catch {}
  } catch {}
}

async function trySetVoiceStatus(client, guildId, voiceChannelId, text) {
  try {
    const g = client.guilds.cache.get(String(guildId));
    if (!g) return;
    const ch = g.channels.cache.get(String(voiceChannelId));
    if (ch && typeof ch.setStatus === "function") {
      await ch.setStatus(text).catch(() => {});
    }
  } catch {}
}

async function trySetBotPresence(client, text) {
  try {
    if (!client?.user) return;
    const name = String(text || "").trim();
    if (!name) {
      await client.user.setPresence({ activities: [], status: "online" }).catch(() => {});
      return;
    }
    await client.user.setPresence({
      activities: [{ name, type: ActivityType.Playing }],
      status: "online"
    }).catch(() => {});
  } catch {}
}

function startMusicBot({ token, targetGuildId, ownerUserId, lavalink, stateFile }) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  const defaultState = {
    guildId: String(targetGuildId),
    ownerUserId: String(ownerUserId),
    fixedVoiceChannelId: null,
    controlTextChannelId: null
  };

  let fixedVoiceChannelId = null;
  let controlTextChannelId = null;
  let lastVoiceStatusText = null;

  const repeatEnabled = new Map();
  const lastKnownTrack = new Map();
  const guildVolume = new Map();
  const currentFilter = new Map();

  // مصفوفة الأزرار المطابقة تماماً لتصميم وأيقونات ملفك index.js
  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mb:repeat').setEmoji("<:undoarrow:1224078115479883816>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mb:voldown').setEmoji("<:lowvolume:1224079426564788274>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mb:stop').setEmoji("<:pause:1224080944013770822>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mb:volup').setEmoji("<:highvolume:1224018170409564231>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mb:skip').setEmoji("<:skipstart_1:1224082806741930108>").setStyle(ButtonStyle.Secondary)
  );

  const FILTER_PRESETS = [
    { value: "bass_light", label: "Bass Boost (Light)", description: "تعزيز بسيط للباس", filters: { equalizer: [{ band: 0, gain: 0.15 }, { band: 1, gain: 0.12 }] } },
    { value: "bass_medium", label: "Bass Boost (Medium)", description: "تعزيز متوسط للباس", filters: { equalizer: [{ band: 0, gain: 0.25 }, { band: 1, gain: 0.20 }] } },
    { value: "bass_strong", label: "Bass Boost (Strong)", description: "تعزيز قوي للباس", filters: { equalizer: [{ band: 0, gain: 0.35 }, { band: 1, gain: 0.28 }] } },
    { value: "nightcore", label: "Nightcore", description: "تسريع + رفع النغمة", filters: { timescale: { speed: 1.15, pitch: 1.2, rate: 1.0 } } },
    { value: "reset", label: "Off / Reset", description: "إلغاء كل الفلاتر", filters: {} }
  ];

  function buildFiltersRow(guildId) {
    const current = String(currentFilter.get(String(guildId)) || "reset");
    const menu = new StringSelectMenuBuilder()
      .setCustomId("mb:filters")
      .setPlaceholder("اختر فلتر للصوت")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        FILTER_PRESETS.map((p) => ({
          label: p.label,
          description: p.description,
          value: p.value,
          default: p.value === current
        }))
      );
    return new ActionRowBuilder().addComponents(menu);
  }

  function loadState() {
    const st = safeReadJson(stateFile, defaultState);
    if (!st) return;
    if (String(st.guildId) !== String(targetGuildId)) return;
    if (String(st.ownerUserId) !== String(ownerUserId)) return;
    fixedVoiceChannelId = st.fixedVoiceChannelId || null;
    controlTextChannelId = st.controlTextChannelId || null;
  }

  function saveState() {
    safeWriteJson(stateFile, {
      guildId: String(targetGuildId),
      ownerUserId: String(ownerUserId),
      fixedVoiceChannelId,
      controlTextChannelId
    });
  }

  loadState();

  client.lavalink = new LavalinkManager({
    nodes: [{ id: lavalink.identifier, host: lavalink.host, port: lavalink.port, authorization: lavalink.password, secure: lavalink.secure }],
    playerOptions: { onDisconnect: { autoReconnect: true, destroyPlayer: false }, onEmptyQueue: { destroyAfterMs: -1 } },
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload)
  });

  client.on("raw", (d) => client.lavalink.sendRawData(d));

  function hasAvailableNode() {
    try {
      const nodes = client.lavalink?.nodeManager?.nodes;
      if (!nodes) return false;
      const arr = typeof nodes.values === "function" ? Array.from(nodes.values()) : Array.isArray(nodes) ? nodes : [];
      return arr.some((n) => n && n.connected === true);
    } catch { return false; }
  }

  async function updateStatusesForPlayer(player) {
    try {
      if (!player) return;
      const track = getCurrentTrack(player);
      if (!track) return;
      lastKnownTrack.set(String(player.guildId), track);
      const text = `Playing: ${trackTitle(track)}`.slice(0, 120);
      await trySetBotPresence(client, text);
      const vcId = String(player.voiceChannelId || fixedVoiceChannelId || "");
      if (vcId && lastVoiceStatusText !== text) {
        lastVoiceStatusText = text;
        await trySetVoiceStatus(client, targetGuildId, vcId, text);
      }
    } catch {}
  }

  async function applyFilterPreset({ player, presetValue }) {
    const preset = FILTER_PRESETS.find((x) => x.value === presetValue);
    if (!preset) return { ok: false, reason: "unknown_preset" };
    const r = await lavalinkPatchPlayer({
      player, nodeHost: lavalink.host, nodePort: lavalink.port, nodePassword: lavalink.password, nodeSecure: lavalink.secure,
      body: { filters: preset.filters }
    });
    if (r.ok) currentFilter.set(String(player.guildId), preset.value);
    return { ok: r.ok, preset };
  }

  // دالة إرسال إيمبد التشغيل الفوري المتطابقة مع دالة playSong في ملف index.js
  async function sendNowPlayingEmbedToChannel({ channel, track, guildId }) {
    try {
      if (!channel || !track) return;
      const title = trackTitle(track);
      const url = trackUrl(track);
      const duration = formatDuration(track.info?.duration || track.info?.length || 0);

      const embed = new EmbedBuilder()
        .setAuthor({ name: "🎵 Playing song" })
        .setColor(emco)
        .addFields(
          { name: 'Song Name', value: `***Started:* [${title}](${url})**` },
          { name: 'Song Duration', value: `(\`${duration}\`)` }
        )
        .setThumbnail("https://cdn.discordapp.com/attachments/1161286178822176858/1205557078890905610/ddddd.png?ex=65d8cd85&is=65c65885&hm=c45afc56ea3abbc91d3cac1215ec2698e45a5727f5fa5ad9e958b1a8e3c87bef&")
        .setFooter({ text: client.user.username, iconURL: client.user.displayAvatarURL() });

      const rowFilters = buildFiltersRow(guildId);
      await channel.send({ embeds: [embed], components: [rowButtons, rowFilters] }).catch(() => {});
    } catch {}
  }

  function setupAutoAdvanceOnce() {
    if (client.__autoAdvanceSetup) return;
    client.__autoAdvanceSetup = true;

    const onEnd = async (player) => {
      try {
        if (!player) return;
        const gid = String(player.guildId || "");
        if (gid && String(gid) !== String(targetGuildId)) return;

        const rep = !!repeatEnabled.get(String(player.guildId));
        if (rep) {
          const endedTrack = lastKnownTrack.get(String(player.guildId));
          if (endedTrack) {
            await playSpecificTrack({ player, track: endedTrack, lavalink }).catch(() => {});
            setTimeout(() => updateStatusesForPlayer(player).catch(() => {}), 400);
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 250));
        if (getQueueSize(player) <= 0 || player.playing || player.paused) return;
        await player.play().catch(() => {});
        setTimeout(() => updateStatusesForPlayer(player).catch(() => {}), 400);
      } catch {}
    };

    client.lavalink.on("trackEnd", (player) => onEnd(player));
    client.lavalink.on("trackStart", (player) => setTimeout(() => updateStatusesForPlayer(player).catch(() => {}), 250));
  }

  async function ensurePlayer({ guildId, voiceChannelId }) {
    if (!hasAvailableNode()) throw new Error("NO_NODE_AVAILABLE_YET");
    let player = client.lavalink.getPlayer(guildId);
    if (!player) {
      player = await client.lavalink.createPlayer({ guildId, voiceChannelId, selfDeaf: true, selfMute: false, volume: 100 });
    } else {
      player.voiceChannelId = voiceChannelId;
    }
    if (!player.connected) await player.connect();
    setupAutoAdvanceOnce();
    return player;
  }

  function isMusicChannel(msg) {
    return controlTextChannelId && String(msg.channel.id) === String(controlTextChannelId);
  }
  function isUserInBotVoiceFromMessage(msg) {
    const userVcId = msg.member?.voice?.channelId || null;
    return userVcId && String(userVcId) === String(fixedVoiceChannelId);
  }

  const pending = { avatar: false, name: false, channelId: null };

  async function doResetBinding({ guildId }) {
    try {
      fixedVoiceChannelId = null;
      controlTextChannelId = null;
      saveState();
      lastVoiceStatusText = null;
      repeatEnabled.set(String(guildId), false);
      guildVolume.set(String(guildId), 100);
      currentFilter.set(String(guildId), "reset");
      await trySetBotPresence(client, "");
      const player = client.lavalink.getPlayer(guildId);
      if (player) await forceDisconnectAndDestroyPlayer({ player });
    } catch {}
  }

  async function handleOwnerMentionCommand(msg) {
    const after = normalizeMentionPrefix(msg.content.trim(), client.user.id);
    if (after == null) return false;
    if (String(msg.author.id) !== String(ownerUserId)) return true;

    const cmd = after.toLowerCase();
    if (cmd === "come" || cmd === "كم") {
      const vc = msg.member?.voice?.channel;
      if (!vc) { await msg.reply("ادخل روم صوتي أولاً."); return true; }
      fixedVoiceChannelId = vc.id;
      controlTextChannelId = msg.channel.id;
      saveState();
      try { await ensurePlayer({ guildId: msg.guild.id, voiceChannelId: fixedVoiceChannelId }); } catch {}
      await msg.reply(`تم الربط بنجاح.\nالروم الصوتي: ${vc.name}\nالأوامر تعمل فقط داخل شات هذا الروم الصوتي.`);
      return true;
    }
    if (cmd === "reset" || cmd === "ريست") {
      await doResetBinding({ guildId: msg.guild.id });
      await msg.reply("تم الريست ✅\nتم فك الربط والخروج من الروم.");
      return true;
    }
    if (cmd === "setavatar") {
      pending.avatar = true; pending.name = false; pending.channelId = msg.channel.id;
      await msg.reply("ارسل صورة الأفتار كمرفق في نفس الشات.");
      return true;
    }
    if (cmd === "setname") {
      pending.name = true; pending.avatar = false; pending.channelId = msg.channel.id;
      await msg.reply("اكتب الاسم الجديد الآن في نفس الشات.");
      return true;
    }
    return false;
  }

  async function maybeHandlePendingOwnerSteps(msg) {
    if (String(msg.author.id) !== String(ownerUserId)) return false;
    if (!pending.channelId || String(pending.channelId) !== String(msg.channel.id)) return false;

    if (pending.avatar) {
      const att = msg.attachments?.first();
      if (!att?.url) { await msg.reply("لازم ترسل صورة كمرفق."); return true; }
      try { await client.user.setAvatar(att.url); await msg.reply("تم تغيير الأفتار ✅"); } catch { await msg.reply("تعذر تغيير الصورة."); }
      pending.avatar = false; pending.channelId = null;
      return true;
    }
    if (pending.name) {
      const newName = msg.content.trim();
      if (!newName) return true;
      try { await client.user.setUsername(newName); await msg.reply(`تم تغيير الاسم إلى: ${newName} ✅`); } catch { await msg.reply("تعذر تغيير الاسم."); }
      pending.name = false; pending.channelId = null;
      return true;
    }
    return false;
  }

  // دمج مصفوفات الأوامر العربية والإنجليزية مدمجة ومتطابقة بالكامل مع index.js
  async function handleMusicCommands(msg) {
    if (!isMusicChannel(msg)) return;
    if (!isUserInBotVoiceFromMessage(msg)) return;
    if (!fixedVoiceChannelId) return;

    let prefix = globalConfig.prefix || "!";
    try {
      const tokensData = safeReadJson("./tokens.json", []);
      const tokenObj = tokensData.find(t => t.token === token);
      if (tokenObj && tokenObj.prefix) prefix = tokenObj.prefix;
    } catch {}

    const cmdsArray = {
      play: [`${prefix}شغل`, `${prefix}ش`, `${prefix}p`, `${prefix}play`, `${prefix}P`, `${prefix}Play`],
      stop: [`${prefix}stop`, `${prefix}وقف`, `${prefix}Stop`, `${prefix}توقيف`],
      skip: [`${prefix}skip`, `${prefix}سكب`, `${prefix}تخطي`, `${prefix}s`, `${prefix}س`, `${prefix}S`, `${prefix}Skip`],
      volume: [`${prefix}volume`, `${prefix}vol`, `${prefix}صوت`, `${prefix}v`, `${prefix}ص`,`${prefix}V`,`${prefix}Vol`,`${prefix}Volume`],
      nowplaying: [`${prefix}nowplaying`, `${prefix}np`,`${prefix}Np`,`${prefix}Nowplaying`,`${prefix}الشغال`,`${prefix}الان`],
      loop: [`${prefix}loop`, `${prefix}تكرار`, `${prefix}l`,`${prefix}L`,`${prefix}Loop`],
      pause: [`${prefix}pause`, `${prefix}توقيف`, `${prefix}كمل`, `${prefix}pa`,`${prefix}Pa`,`${prefix}Pause`],
      queue: [`${prefix}queue`, `${prefix}قائمة`, `${prefix}اغاني`, `${prefix}q`, `${prefix}qu`,`${prefix}Q`,`${prefix}Qu`,`${prefix}Queue`],
    };

    const firstWord = msg.content.split(' ')[0];

    // --- أمر التشغيل (Play) ---
    if (cmdsArray.play.some((cmd) => firstWord === cmd)) {
      const query = msg.content.split(' ').slice(1).join(' ');
      if (!query) {
        const embed = new EmbedBuilder()
          .setAuthor({ name: "اوامر التشغيل:" })
          .setDescription(`***\`play [ title ]\` :** plays first result from **YouTube***.\n***\`play [URL]\` :** searches **YouTube, Spotify**, **SoundCloud***.`)
          .setColor(emco);
        return msg.reply({ embeds: [embed] }).catch(() => 0);
      }

      let player;
      try { player = await ensurePlayer({ guildId: msg.guild.id, voiceChannelId: fixedVoiceChannelId }); } catch (e) { return; }

      const res = await player.search({ query }, msg.author);
      if (!res?.tracks?.length) return;

      const track = res.tracks[0];
      await player.queue.add(track);

      if (!player.playing && !player.paused) {
        await player.play();
        lastKnownTrack.set(String(msg.guild.id), track);
        if (!guildVolume.has(String(msg.guild.id))) guildVolume.set(String(msg.guild.id), 100);
        if (!currentFilter.has(String(msg.guild.id))) currentFilter.set(String(msg.guild.id), "reset");
        await updateStatusesForPlayer(player);

        await sendNowPlayingEmbedToChannel({ channel: msg.channel, track, guildId: msg.guild.id });
      } else {
        const duration = formatDuration(track.info?.duration || track.info?.length || 0);
        const embed = new EmbedBuilder()
          .setAuthor({ name: "ϟ Adding to queue" })
          .setColor(emco)
          .addFields(
            { name: 'Song Name', value: `**${trackTitle(track)}**` },
            { name: 'Song Duration', value: `(\`${duration}\`)` }
          )
          .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1169710999268491325/NowPlaying.png?ex=65566542&is=6543f042&hm=00a5c0c58c2c36e143b5b778cc3681aea08c75b8458c413133a490343197ec7b&")
          .setFooter({ text: client.user.username, iconURL: client.user.displayAvatarURL() });
        await msg.reply({ embeds: [embed] }).catch(() => 0);
      }
    }

    // --- أمر الإيقاف (Stop) ---
    else if (cmdsArray.stop.some((cmd) => firstWord === cmd)) {
      const player = client.lavalink.getPlayer(msg.guild.id);
      if (!player || (!player.playing && !player.paused)) {
        const embed = new EmbedBuilder().setDescription(`**🎶 There must be music playing to use that!**`).setColor(emco);
        return msg.channel.send({ embeds: [embed] }).catch(() => 0);
      }
      try { player.queue?.clear?.(); } catch {}
      await forceStopKeepConnected({ player, nodeHost: lavalink.host, nodePort: lavalink.port, nodePassword: lavalink.password, nodeSecure: lavalink.secure });

      lastVoiceStatusText = null;
      await trySetBotPresence(client, "");
      trySetVoiceStatus(client, targetGuildId, fixedVoiceChannelId, "").catch(() => {});

      const embed = new EmbedBuilder()
        .setDescription("**ϟ Songs Has Been :** ***Stopped***")
        .setColor(emco)
        .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1169710999268491325/NowPlaying.png?ex=65566542&is=6543f042&hm=00a5c0c58c2c36e143b5b778cc3681aea08c75b8458c413133a490343197ec7b&");
      await msg.reply({ embeds: [embed] }).catch(() => 0);
    }

    // --- أمر التخطي (Skip) ---
    else if (cmdsArray.skip.some((cmd) => firstWord === cmd)) {
      const player = client.lavalink.getPlayer(msg.guild.id);
      if (!player || (!player.playing && !player.paused)) {
        const embed = new EmbedBuilder().setDescription(`**🎶 There must be music playing to use that!**`).setColor(emco);
        return msg.channel.send({ embeds: [embed] }).catch(() => 0);
      }

      const current = getCurrentTrack(player);
      const qSize = getQueueSize(player);

      if (qSize <= 0) {
        await forceStopKeepConnected({ player, nodeHost: lavalink.host, nodePort: lavalink.port, nodePassword: lavalink.password, nodeSecure: lavalink.secure });
        lastVoiceStatusText = null; await trySetBotPresence(client, "");
        trySetVoiceStatus(client, targetGuildId, fixedVoiceChannelId, "").catch(() => {});
        return msg.react(`✅`).catch(() => 0);
      }

      await player.skip();
      const embed = new EmbedBuilder()
        .setDescription(`***ϟ Skipped ${trackTitle(current)}***`)
        .setColor(emco)
        .setThumbnail("https://cdn.discordapp.com/attachments/1161286178822176858/1205556141032214618/111.png?ex=65d8cca6&is=65c657a6&hm=44e2be2c07211ae17c441738b34edecb7a090a411b30da2283c4712fe7131dea&");
      await msg.channel.send({ embeds: [embed] }).catch(() => 0);
    }

    // --- أمر التكرار (Loop) ---
    else if (cmdsArray.loop.some((cmd) => firstWord === cmd)) {
      const player = client.lavalink.getPlayer(msg.guild.id);
      if (!player) return msg.channel.send({ embeds: [new EmbedBuilder().setDescription(`**🎶 There must be music playing to use that!**`).setColor(emco)] }).catch(() => 0);

      const cur = !!repeatEnabled.get(msg.guild.id);
      const next = !cur;
      repeatEnabled.set(msg.guild.id, next);

      const embed = new EmbedBuilder()
        .setDescription(`_Repeat mode set to :_ ${next ? "**ON ..**" : "**OFF ..**"}`)
        .setThumbnail("https://cdn.discordapp.com/attachments/1161286178822176858/1205556753752789043/Untitled-1.png?ex=65d8cd38&is=65c65838&hm=29f9c403050d6f24f661f21a34fd1604be145afdb38e181610c9685d1c6b72ff&")
        .setColor(emco);
      await msg.reply({ embeds: [embed] }).catch(() => 0);
    }

    // --- أمر الصوت (Volume) ---
    else if (cmdsArray.volume.some((cmd) => firstWord === cmd)) {
      const player = client.lavalink.getPlayer(msg.guild.id);
      if (!player) return msg.reply(`🎶 There must be music playing to use that!`).catch(() => 0);

      const volArg = msg.content.split(' ')[1];
      if (!volArg) {
        const embed = new EmbedBuilder()
          .setDescription(`_🔊 Current volume is :_ **${guildVolume.get(msg.guild.id) || 100}**`)
          .setColor(emco)
          .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1170057890506223647/4f4b99efc0371.png?ex=6557a853&is=65453353&hm=40e45c153b144474c1ca95c2854f3f21933cc20c1d2abc1f0ec1e8945da812ea&");
        return msg.reply({ embeds: [embed] }).catch(() => 0);
      }

      const volume = parseInt(volArg);
      if (isNaN(volume) || volume > 150 || volume < 0) {
        const embed = new EmbedBuilder().setDescription(`🚫 Volume must be a valid integer between 0 and 150!`).setColor(emco);
        return msg.channel.send({ embeds: [embed] }).catch(() => 0);
      }

      guildVolume.set(msg.guild.id, volume);
      await setPlayerVolume({ player, volume, lavalink });

      const embed = new EmbedBuilder()
        .setDescription(`***ϟ Volume changed from \`${volume}%\` .***`)
        .setColor(emco)
        .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1170057890506223647/4f4b99efc0371.png?ex=6557a853&is=65453353&hm=40e45c153b144474c1ca95c2854f3f21933cc20c1d2abc1f0ec1e8945da812ea&");
      await msg.reply({ embeds: [embed] }).catch(() => 0);
    }

    // --- أمر قائمة الانتظار (Queue) ---
    else if (cmdsArray.queue.some((cmd) => firstWord === cmd)) {
      const player = client.lavalink.getPlayer(msg.guild.id);
      if (!player) return msg.reply(`🎶 There must be music playing to use that!`).catch(() => 0);

      const tracks = player.queue.tracks || [];
      const songNames = tracks.slice(0, 10).map((t, i) => `\`${i + 1}\`. ${trackTitle(t)}`).join('\n') || "No more songs in queue.";

      const embed = new EmbedBuilder()
        .setAuthor({ name: `ϟ Total songs :  ( ${getQueueSize(player)} )` })
        .setDescription(`*Now playing :* \n${songNames}`)
        .setThumbnail("https://cdn.discordapp.com/attachments/1161286178822176858/1205557078890905610/ddddd.png?ex=65d8cd85&is=65c65885&hm=c45afc56ea3abbc91d3cac1215ec2698e45a5727f5fa5ad9e958b1a8e3c87bef&")
        .setColor(emco)
        .setFooter({ text: client.user.username, iconURL: client.user.displayAvatarURL() });
      await msg.channel.send({ embeds: [embed] }).catch(() => 0);
    }

    // --- أمر الشغال حالياً (Now Playing) ---
    else if (cmdsArray.nowplaying.some((cmd) => firstWord === cmd)) {
      const player = client.lavalink.getPlayer(msg.guild.id);
      if (!player) return msg.reply(`🎶 There must be music playing to use that!`).catch(() => 0);

      const track = getCurrentTrack(player);
      const embed = new EmbedBuilder()
        .setAuthor({ name: 'Playing now', iconURL: client.user.displayAvatarURL({ dynamic: true }) })
        .setColor(emco)
        .setDescription(`**[${trackTitle(track)}](${trackUrl(track)})**`)
        .setFooter({ text: msg.author.username, iconURL: msg.author.avatarURL() });
      await msg.channel.send({ embeds: [embed] }).catch(() => 0);
    }

    // --- أمر الإيقاف المؤقت / الاستئناف (Pause / Resume) ---
    else if (cmdsArray.pause.some((cmd) => firstWord === cmd)) {
      const player = client.lavalink.getPlayer(msg.guild.id);
      if (!player) return msg.reply(`🎶 There must be music playing to use that!`).catch(() => 0);

      if (player.paused) {
        await player.resume(); msg.react("▶️").catch(() => 0);
      } else {
        await player.pause(); msg.react("⏸️").catch(() => 0);
      }
    }
  }

  // مستمع التفاعلات (أزرار التحكم وقائمة الفلاتر)
  client.on("interactionCreate", async (interaction) => {
    try {
      if (!interaction.guild || String(interaction.guild.id) !== String(targetGuildId)) return;
      if (controlTextChannelId && String(interaction.channelId) !== String(controlTextChannelId)) return;
      if (fixedVoiceChannelId && String(interaction.member?.voice?.channelId) !== String(fixedVoiceChannelId)) return;

      const player = client.lavalink.getPlayer(interaction.guild.id);
      if (!player) return;

      const gid = String(interaction.guild.id);

      if (interaction.isButton()) {
        if (interaction.customId === "mb:repeat") {
          const next = !repeatEnabled.get(gid); repeatEnabled.set(gid, next);
          await interaction.reply({ content: next ? "تكرار الاغنيه: ON ✅" : "تكرار الاغنيه: OFF ❌", ephemeral: true });
        }
        else if (interaction.customId === "mb:voldown") {
          const next = Math.max(0, (guildVolume.get(gid) || 100) - 10); guildVolume.set(gid, next);
          await setPlayerVolume({ player, volume: next, lavalink });
          await interaction.reply({ content: `***ϟ Volume changed from \`${next}%\` .***`, ephemeral: true });
        }
        else if (interaction.customId === "mb:volup") {
          const next = Math.min(150, (guildVolume.get(gid) || 100) + 10); guildVolume.set(gid, next);
          await setPlayerVolume({ player, volume: next, lavalink });
          await interaction.reply({ content: `***volume has been raised to \`${next}%\` .***`, ephemeral: true });
        }
        else if (interaction.customId === "mb:stop") {
          try { player.queue?.clear?.(); } catch {}
          await forceStopKeepConnected({ player, nodeHost: lavalink.host, nodePort: lavalink.port, nodePassword: lavalink.password, nodeSecure: lavalink.secure });
          await interaction.reply({ content: "تم إيقاف الاغنيه ✅", ephemeral: true });
        }
        else if (interaction.customId === "mb:skip") {
          if (getQueueSize(player) <= 0) {
            await forceStopKeepConnected({ player, nodeHost: lavalink.host, nodePort: lavalink.port, nodePassword: lavalink.password, nodeSecure: lavalink.secure });
            return interaction.reply({ content: "*Server queue is empty.*", ephemeral: true });
          }
          await player.skip();
          await interaction.reply({ content: "***ϟ Skipped the current song.***", ephemeral: true });
        }
      }

      if (interaction.isStringSelectMenu() && interaction.customId === "mb:filters") {
        const chosen = interaction.values?.[0];
        const r = await applyFilterPreset({ player, presetValue: chosen });
        if (r.ok) await interaction.reply({ content: `تم تطبيق الفلتر: ${r.preset.label}`, ephemeral: true });
      }
    } catch {}
  });

  client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    if (String(msg.guild.id) !== String(targetGuildId)) return;

    if (await handleOwnerMentionCommand(msg)) return;
    if (await maybeHandlePendingOwnerSteps(msg)) return;

    await handleMusicCommands(msg);
  });

  client.once("ready", async () => {
    try { await client.lavalink.init({ id: client.user.id, username: "musicbot" }); } catch (e) {}
    setupAutoAdvanceOnce();
    if (fixedVoiceChannelId) {
      await ensurePlayer({ guildId: targetGuildId, voiceChannelId: fixedVoiceChannelId }).catch(() => {});
    }
  });

  client.login(token).catch((e) => console.error("Login Error:", e));
}

module.exports = { startMusicBot };