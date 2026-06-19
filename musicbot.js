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

// Node 18+ has global fetch
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

// --- helper: queue size across versions
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

// --- helper: attempt to read "current track" across versions
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
  return track?.info?.title || "Unknown";
}
function trackUrl(track) {
  return track?.info?.uri || track?.info?.url || null;
}
function trackEncoded(track) {
  return track?.encoded || track?.track || track?.encodedTrack || null;
}

function findImagePath(baseName) {
  const dir = path.join(process.cwd(), "images");
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir);
  const prefix = baseName.toLowerCase() + ".";
  const match = files.find((f) => f.toLowerCase().startsWith(prefix));
  if (!match) return null;

  return path.join(dir, match);
}

function buildThumbAttachment(baseName) {
  const p = findImagePath(baseName);
  if (!p) return null;

  const ext = path.extname(p) || ".png";
  const name = `${baseName}${ext}`;
  return { attachment: new AttachmentBuilder(p, { name }), name };
}

/**
 * Force-stop (keep bot in voice)
 * Preferred: stopTrack / stop
 * Guaranteed fallback: Lavalink REST PATCH track=null
 */
async function forceStopKeepConnected({ player, nodeHost, nodePort, nodePassword, nodeSecure }) {
  try {
    if (typeof player.stopTrack === "function") {
      await player.stopTrack();
      return { ok: true, via: "stopTrack" };
    }
  } catch {}

  try {
    if (typeof player.stop === "function") {
      await player.stop();
      return { ok: true, via: "stop" };
    }
  } catch {}

  try {
    if (!_fetch) return { ok: false, via: "no_fetch" };

    const sessionId =
      player?.node?.sessionId || player?.node?.sessionID || player?.node?.session?.id || null;

    if (!sessionId) return { ok: false, via: "no_session" };

    const scheme = nodeSecure ? "https" : "http";
    const url = `${scheme}://${nodeHost}:${nodePort}/v4/sessions/${encodeURIComponent(
      sessionId
    )}/players/${encodeURIComponent(player.guildId)}`;

    const res = await _fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: nodePassword,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        track: { encoded: null }
      })
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, via: `rest_${res.status}`, details: txt.slice(0, 200) };
    }

    return { ok: true, via: "rest_track_null" };
  } catch (e) {
    return { ok: false, via: "rest_error", details: String(e?.message || e) };
  }
}

// hard disconnect bot from voice + destroy player (best effort)
async function forceDisconnectAndDestroyPlayer({ player }) {
  try {
    try {
      if (typeof player.stopTrack === "function") await player.stopTrack().catch(() => {});
      else if (typeof player.stop === "function") await player.stop().catch(() => {});
    } catch {}

    try {
      if (typeof player.disconnect === "function") await player.disconnect().catch(() => {});
    } catch {}

    try {
      if (typeof player.destroy === "function") await player.destroy().catch(() => {});
    } catch {}

    try {
      const mgr = player?.manager || player?.lavalink || null;
      if (mgr && typeof mgr.destroyPlayer === "function") {
        await mgr.destroyPlayer(player.guildId).catch(() => {});
      }
    } catch {}
  } catch {}
}

// try set voice channel status (if bot has perms + API exists)
async function trySetVoiceStatus(client, guildId, voiceChannelId, text) {
  try {
    const g = client.guilds.cache.get(String(guildId));
    if (!g) return;
    const ch = g.channels.cache.get(String(voiceChannelId));
    if (!ch) return;

    if (typeof ch.setStatus === "function") {
      await ch.setStatus(text).catch(() => {});
      return;
    }
  } catch {}
}

// always set bot presence as fallback (works everywhere)
async function trySetBotPresence(client, text) {
  try {
    if (!client?.user) return;
    const name = String(text || "").trim();

    if (!name) {
      await client.user.setPresence({ activities: [], status: "online" }).catch(() => {});
      return;
    }

    await client.user
      .setPresence({
        activities: [{ name, type: ActivityType.Playing }],
        status: "online"
      })
      .catch(() => {});
  } catch {}
}

// --- Emoji parsing: allow ID only, full custom emoji, or unicode
function parseEmojiEnv(v) {
  const s = String(v || "").trim();
  if (!s) return null;

  // <a:name:id> or <:name:id>
  const m = s.match(/<a?:\w+:(\d+)>/);
  if (m?.[1]) return { id: m[1] };

  // digits only
  if (/^\d+$/.test(s)) return { id: s };

  // unicode emoji
  return s;
}

// Lavalink REST PATCH helper
async function lavalinkPatchPlayer({ player, nodeHost, nodePort, nodePassword, nodeSecure, body }) {
  try {
    if (!_fetch) return { ok: false, via: "no_fetch" };

    const sessionId =
      player?.node?.sessionId || player?.node?.sessionID || player?.node?.session?.id || null;
    if (!sessionId) return { ok: false, via: "no_session" };

    const scheme = nodeSecure ? "https" : "http";
    const url = `${scheme}://${nodeHost}:${nodePort}/v4/sessions/${encodeURIComponent(
      sessionId
    )}/players/${encodeURIComponent(player.guildId)}`;

    const res = await _fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: nodePassword,
        "Content-Type": "application/json"
      },
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
    player,
    nodeHost: lavalink.host,
    nodePort: lavalink.port,
    nodePassword: lavalink.password,
    nodeSecure: lavalink.secure,
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
    player,
    nodeHost: lavalink.host,
    nodePort: lavalink.port,
    nodePassword: lavalink.password,
    nodeSecure: lavalink.secure,
    body: { volume: v }
  });
}

function makeFooter(msg) {
  const avatar =
    msg.author?.displayAvatarURL?.({ extension: "png", size: 128 }) ||
    msg.author?.avatarURL?.({ extension: "png", size: 128 }) ||
    null;

  return {
    text: msg.author?.username || "User",
    iconURL: avatar || undefined
  };
}

function makeSingleTrackEmbed({ title, msg, track }) {
  const url = trackUrl(track);
  const name = trackTitle(track);

  const embed = new EmbedBuilder().setTitle(title).setFooter(makeFooter(msg));
  if (url) embed.setDescription(`[${name}](${url})`);
  else embed.setDescription(`${name}`);
  return embed;
}

/**
 * startMusicBot
 */
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

  const repeatEnabled = new Map(); // guildId -> bool
  const lastKnownTrack = new Map(); // guildId -> track
  const guildVolume = new Map(); // guildId -> number
  const currentFilter = new Map(); // guildId -> filter value

  const EMOJI_REPEAT = parseEmojiEnv(process.env.EMOJI_REPEAT);
  const EMOJI_VOLDOWN = parseEmojiEnv(process.env.EMOJI_VOLDOWN);
  const EMOJI_STOP = parseEmojiEnv(process.env.EMOJI_STOP);
  const EMOJI_VOLUP = parseEmojiEnv(process.env.EMOJI_VOLUP);
  const EMOJI_SKIP = parseEmojiEnv(process.env.EMOJI_SKIP);

  const BTN = {
    REPEAT: "mb:repeat",
    VOLDOWN: "mb:voldown",
    STOP: "mb:stop",
    VOLUP: "mb:volup",
    SKIP: "mb:skip"
  };

  const SELECT = {
    FILTERS: "mb:filters"
  };

  // ===== Filters Presets (Lavalink v4 style filters payload) =====
  const eqBassLight = [
    { band: 0, gain: 0.15 },
    { band: 1, gain: 0.12 },
    { band: 2, gain: 0.10 },
    { band: 3, gain: 0.06 },
    { band: 4, gain: 0.03 }
  ];
  const eqBassMed = [
    { band: 0, gain: 0.25 },
    { band: 1, gain: 0.20 },
    { band: 2, gain: 0.16 },
    { band: 3, gain: 0.10 },
    { band: 4, gain: 0.05 }
  ];
  const eqBassStrong = [
    { band: 0, gain: 0.35 },
    { band: 1, gain: 0.28 },
    { band: 2, gain: 0.22 },
    { band: 3, gain: 0.14 },
    { band: 4, gain: 0.08 }
  ];

  const FILTER_PRESETS = [
    {
      value: "bass_light",
      label: "Bass Boost (Light)",
      description: "تعزيز بسيط للباس",
      filters: { equalizer: eqBassLight }
    },
    {
      value: "bass_medium",
      label: "Bass Boost (Medium)",
      description: "تعزيز متوسط للباس",
      filters: { equalizer: eqBassMed }
    },
    {
      value: "bass_strong",
      label: "Bass Boost (Strong)",
      description: "تعزيز قوي للباس",
      filters: { equalizer: eqBassStrong }
    },
    {
      value: "nightcore",
      label: "Nightcore",
      description: "تسريع + رفع النغمة",
      filters: { timescale: { speed: 1.15, pitch: 1.2, rate: 1.0 } }
    },
    {
      value: "vaporwave",
      label: "Vaporwave",
      description: "تبطيء + خفض النغمة",
      filters: { timescale: { speed: 0.85, pitch: 0.8, rate: 1.0 } }
    },
    {
      value: "8d",
      label: "8D (Rotation)",
      description: "تأثير دوران ستيريو",
      filters: { rotation: { rotationHz: 0.2 } }
    },
    {
      value: "karaoke",
      label: "Karaoke",
      description: "تقليل صوت المغني (قد يختلف حسب الأغنية)",
      filters: { karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220, filterWidth: 100 } }
    },
    {
      value: "lowpass",
      label: "Low Pass",
      description: "تنعيم الصوت وتقليل الحدة",
      filters: { lowPass: { smoothing: 20.0 } }
    },
    {
      value: "tremolo",
      label: "Tremolo",
      description: "اهتزاز في مستوى الصوت",
      filters: { tremolo: { frequency: 4.0, depth: 0.75 } }
    },
    {
      value: "vibrato",
      label: "Vibrato",
      description: "اهتزاز في النغمة",
      filters: { vibrato: { frequency: 6.0, depth: 0.75 } }
    },
    {
      value: "distortion",
      label: "Distortion",
      description: "تشويه/ديستورت خفيف",
      filters: {
        distortion: {
          sinOffset: 0.0,
          sinScale: 1.0,
          cosOffset: 0.0,
          cosScale: 1.0,
          tanOffset: 0.0,
          tanScale: 1.0,
          offset: 0.1,
          scale: 1.2
        }
      }
    },
    {
      value: "mono",
      label: "Mono (Channel Mix)",
      description: "تحويل الصوت لمونو",
      filters: { channelMix: { leftToLeft: 0.5, leftToRight: 0.5, rightToLeft: 0.5, rightToRight: 0.5 } }
    },
    // ✅ لازم يكون آخر خيار
    {
      value: "reset",
      label: "Off / Reset",
      description: "إلغاء كل الفلاتر",
      filters: {} // reset all
    }
  ];

  function buildControlsRow() {
    const bRepeat = new ButtonBuilder().setCustomId(BTN.REPEAT).setStyle(ButtonStyle.Secondary);
    if (EMOJI_REPEAT) bRepeat.setEmoji(EMOJI_REPEAT);

    const bDown = new ButtonBuilder().setCustomId(BTN.VOLDOWN).setStyle(ButtonStyle.Secondary);
    if (EMOJI_VOLDOWN) bDown.setEmoji(EMOJI_VOLDOWN);

    const bStop = new ButtonBuilder().setCustomId(BTN.STOP).setStyle(ButtonStyle.Secondary);
    if (EMOJI_STOP) bStop.setEmoji(EMOJI_STOP);

    const bUp = new ButtonBuilder().setCustomId(BTN.VOLUP).setStyle(ButtonStyle.Secondary);
    if (EMOJI_VOLUP) bUp.setEmoji(EMOJI_VOLUP);

    const bSkip = new ButtonBuilder().setCustomId(BTN.SKIP).setStyle(ButtonStyle.Secondary);
    if (EMOJI_SKIP) bSkip.setEmoji(EMOJI_SKIP);

    return new ActionRowBuilder().addComponents(bRepeat, bDown, bStop, bUp, bSkip);
  }

  function buildFiltersRow(guildId) {
    const current = String(currentFilter.get(String(guildId)) || "reset");

    const menu = new StringSelectMenuBuilder()
      .setCustomId(SELECT.FILTERS)
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
    nodes: [
      {
        id: lavalink.identifier,
        host: lavalink.host,
        port: lavalink.port,
        authorization: lavalink.password,
        secure: lavalink.secure
      }
    ],
    playerOptions: {
      onDisconnect: { autoReconnect: true, destroyPlayer: false },
      onEmptyQueue: { destroyAfterMs: -1 }
    },
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload)
  });

  client.on("raw", (d) => client.lavalink.sendRawData(d));

  function hasAvailableNode() {
    try {
      const nodes = client.lavalink?.nodeManager?.nodes;
      if (!nodes) return false;

      const arr =
        typeof nodes.values === "function"
          ? Array.from(nodes.values())
          : Array.isArray(nodes)
          ? nodes
          : [];

      if (!arr.length) return false;

      return arr.some((n) => {
        if (!n) return false;
        if (n.destroyed === true) return false;
        if (n.connected === true) return true;
        if (String(n.state || "").toUpperCase() === "CONNECTED") return true;
        if (String(n.status || "").toLowerCase() === "connected") return true;
        if (n.socket && n.socket.readyState === 1) return true;
        return false;
      });
    } catch {
      return false;
    }
  }

  async function updateStatusesForPlayer(player) {
    try {
      if (!player) return;
      const track = getCurrentTrack(player);
      if (!track) return;

      lastKnownTrack.set(String(player.guildId), track);

      const title = trackTitle(track);
      const text = `Playing: ${title}`.slice(0, 120);

      await trySetBotPresence(client, text);

      const vcId = String(player.voiceChannelId || fixedVoiceChannelId || "");
      if (!vcId) return;

      if (lastVoiceStatusText === text) return;
      lastVoiceStatusText = text;

      await trySetVoiceStatus(client, targetGuildId, vcId, text);
    } catch {}
  }

  async function applyFilterPreset({ player, presetValue }) {
    const preset = FILTER_PRESETS.find((x) => x.value === presetValue);
    if (!preset) return { ok: false, reason: "unknown_preset" };

    // REST patch is the most compatible across libs
    const r = await lavalinkPatchPlayer({
      player,
      nodeHost: lavalink.host,
      nodePort: lavalink.port,
      nodePassword: lavalink.password,
      nodeSecure: lavalink.secure,
      body: { filters: preset.filters }
    });

    if (r.ok) {
      currentFilter.set(String(player.guildId), preset.value);
    }
    return { ok: r.ok, preset };
  }

  // ✅ send "Now Playing" embed WITH buttons + filters menu
  async function sendNowPlayingEmbedToChannel({ channel, msgForFooter, track, thumbBaseName = "play", guildId }) {
    try {
      if (!channel || !track) return;

      const embed = makeSingleTrackEmbed({ title: "playing", msg: msgForFooter, track });
      const rowButtons = buildControlsRow();
      const rowFilters = buildFiltersRow(guildId);

      const thumb = buildThumbAttachment(thumbBaseName);
      const payload = { embeds: [embed], components: [rowButtons, rowFilters] };

      if (thumb) {
        embed.setThumbnail(`attachment://${thumb.name}`);
        payload.files = [thumb.attachment];
      }

      await channel.send(payload).catch(() => {});
    } catch {}
  }

  // =========================
  // ✅ Auto-advance / Repeat
  // =========================
  function setupAutoAdvanceOnce() {
    if (client.__autoAdvanceSetup) return;
    client.__autoAdvanceSetup = true;

    const shouldReactToEndReason = (payload) => {
      const r = String(payload?.reason || payload?.reason?.type || "").toUpperCase();
      if (!r) return true;
      if (r.includes("FINISH")) return true;
      if (r === "FINISHED") return true;
      return false;
    };

    const onEnd = async (player, payload, endedTrackMaybe) => {
      try {
        if (!player) return;

        const gid = String(player.guildId || player.guildID || "");
        if (gid && String(gid) !== String(targetGuildId)) return;

        if (!shouldReactToEndReason(payload)) return;

        const rep = !!repeatEnabled.get(String(player.guildId));
        if (rep) {
          const endedTrack =
            endedTrackMaybe ||
            payload?.track ||
            payload?.oldTrack ||
            payload?.current ||
            lastKnownTrack.get(String(player.guildId)) ||
            null;

          if (endedTrack) {
            await playSpecificTrack({ player, track: endedTrack, lavalink }).catch(() => {});
            setTimeout(() => updateStatusesForPlayer(player).catch(() => {}), 400);
            return;
          }
        }

        await new Promise((r) => setTimeout(r, 250));

        const qSize = getQueueSize(player);
        if (qSize <= 0) return;

        if (player.playing || player.paused) return;

        await player.play().catch(() => {});
        setTimeout(() => updateStatusesForPlayer(player).catch(() => {}), 400);
      } catch (e) {
        console.error("[AUTO NEXT/REPEAT ERROR]", e?.message || e);
      }
    };

    const attachEmitter = (emitter) => {
      if (!emitter || typeof emitter.on !== "function") return;

      const endEvents = ["trackEnd", "trackEndEvent", "end", "playerEnd", "TrackEnd"];
      for (const ev of endEvents) {
        try {
          emitter.on(ev, (...args) => {
            const player =
              args.find((a) => a && (a.guildId || a.guildID || a.voiceChannelId || a.queue)) || args[0];
            const payload = args[args.length - 1];

            const endedTrack =
              args.find((a) => a && a?.info?.title && (a?.encoded || a?.track || a?.encodedTrack)) ||
              payload?.track ||
              payload?.oldTrack ||
              null;

            onEnd(player, payload, endedTrack);
          });
        } catch {}
      }

      const startEvents = ["trackStart", "start", "playerStart", "TrackStart", "trackStartEvent"];
      for (const ev of startEvents) {
        try {
          emitter.on(ev, (...args) => {
            const player =
              args.find((a) => a && (a.guildId || a.guildID || a.voiceChannelId || a.queue)) || args[0];
            setTimeout(() => updateStatusesForPlayer(player).catch(() => {}), 250);
          });
        } catch {}
      }
    };

    attachEmitter(client.lavalink);
    attachEmitter(client.lavalink?.nodeManager);
  }

  async function ensurePlayer({ guildId, voiceChannelId }) {
    if (!hasAvailableNode()) throw new Error("NO_NODE_AVAILABLE_YET");

    let player = client.lavalink.getPlayer(guildId);

    if (!player) {
      player = await client.lavalink.createPlayer({
        guildId,
        voiceChannelId,
        selfDeaf: true,
        selfMute: false,
        volume: 100
      });
    } else {
      player.voiceChannelId = voiceChannelId;
    }

    if (!player.connected) await player.connect();

    setupAutoAdvanceOnce();

    try {
      if (player && typeof player.on === "function" && !player.__autoAdvanceAttached) {
        player.__autoAdvanceAttached = true;

        const endEvents = ["trackEnd", "end", "TrackEnd", "trackEndEvent"];
        for (const ev of endEvents) {
          try {
            player.on(ev, (...args) => {
              const payload = args[args.length - 1];
              const reason = String(payload?.reason || "").toUpperCase();
              if (reason && !reason.includes("FINISH") && reason !== "FINISHED") return;

              const endedTrack =
                args.find((a) => a && a?.info?.title && (a?.encoded || a?.track || a?.encodedTrack)) ||
                payload?.track ||
                payload?.oldTrack ||
                lastKnownTrack.get(String(player.guildId)) ||
                null;

              setTimeout(async () => {
                try {
                  const rep = !!repeatEnabled.get(String(player.guildId));
                  if (rep && endedTrack) {
                    await playSpecificTrack({ player, track: endedTrack, lavalink }).catch(() => {});
                    setTimeout(() => updateStatusesForPlayer(player).catch(() => {}), 400);
                    return;
                  }

                  const qSize = getQueueSize(player);
                  if (qSize > 0 && !player.playing && !player.paused) {
                    await player.play().catch(() => {});
                    setTimeout(() => updateStatusesForPlayer(player).catch(() => {}), 400);
                  }
                } catch {}
              }, 250);
            });
          } catch {}
        }

        const startEvents = ["trackStart", "start", "TrackStart", "trackStartEvent"];
        for (const ev of startEvents) {
          try {
            player.on(ev, () => setTimeout(() => updateStatusesForPlayer(player).catch(() => {}), 250));
          } catch {}
        }
      }
    } catch {}

    return player;
  }

  function isInTargetGuild(msg) {
    return msg.guild && String(msg.guild.id) === String(targetGuildId);
  }
  function isOwner(userId) {
    return String(userId) === String(ownerUserId);
  }
  function isMusicChannel(msg) {
    if (!controlTextChannelId) return false;
    return String(msg.channel.id) === String(controlTextChannelId);
  }
  function isUserInBotVoiceFromMessage(msg) {
    if (!fixedVoiceChannelId) return false;
    const userVcId = msg.member?.voice?.channelId || null;
    return userVcId && String(userVcId) === String(fixedVoiceChannelId);
  }
  function isUserInBotVoiceFromInteraction(interaction) {
    if (!fixedVoiceChannelId) return false;
    const userVcId = interaction.member?.voice?.channelId || null;
    return userVcId && String(userVcId) === String(fixedVoiceChannelId);
  }

  const pending = { avatar: false, banner: false, name: false, channelId: null };

  async function doResetBinding({ guildId }) {
    try {
      fixedVoiceChannelId = null;
      controlTextChannelId = null;
      saveState();

      lastVoiceStatusText = null;
      repeatEnabled.set(String(guildId), false);
      guildVolume.set(String(guildId), 100);
      lastKnownTrack.delete(String(guildId));
      currentFilter.set(String(guildId), "reset");

      await trySetBotPresence(client, "");

      const player = client.lavalink.getPlayer(guildId);
      if (player) {
        try {
          try {
            player.queue?.clear?.();
          } catch {}
          await forceDisconnectAndDestroyPlayer({ player });
        } catch {}
      }
    } catch {}
  }

  async function handleOwnerMentionCommand(msg) {
    const after = normalizeMentionPrefix(msg.content.trim(), client.user.id);
    if (after == null) return false;
    if (!isOwner(msg.author.id)) return true;

    const cmd = after.toLowerCase();

    if (cmd === "come" || cmd === "كم" || cmd === "come.") {
      const vc = msg.member?.voice?.channel;
      if (!vc) {
        await msg.reply("ادخل روم صوتي أولاً.");
        return true;
      }

      fixedVoiceChannelId = vc.id;
      controlTextChannelId = vc.id;
      saveState();

      try {
        await ensurePlayer({ guildId: msg.guild.id, voiceChannelId: fixedVoiceChannelId });
      } catch (e) {
        console.error("[COME ensurePlayer error]", e?.message || e);
      }

      await msg.reply(`تم الربط بنجاح.\nالروم الصوتي: ${vc.name}\nالأوامر تعمل فقط داخل شات هذا الروم الصوتي.`);
      return true;
    }

    if (cmd === "reset" || cmd === "ريست" || cmd === "reset.") {
      await doResetBinding({ guildId: msg.guild.id });
      await msg.reply("تم الريست ✅\nتم فك الربط والخروج من الروم، وتقدر تربطه بروم جديد بأمر come.");
      return true;
    }

    if (cmd === "setavatar") {
      pending.avatar = true;
      pending.banner = false;
      pending.name = false;
      pending.channelId = msg.channel.id;
      await msg.reply("ارسل صورة الأفتار كمرفق في نفس الشات.");
      return true;
    }

    if (cmd === "setbanner") {
      pending.banner = true;
      pending.avatar = false;
      pending.name = false;
      pending.channelId = msg.channel.id;
      await msg.reply("ارسل صورة البنر كمرفق في نفس الشات.");
      return true;
    }

    if (cmd === "setname") {
      pending.name = true;
      pending.avatar = false;
      pending.banner = false;
      pending.channelId = msg.channel.id;
      await msg.reply("اكتب الاسم الجديد الآن في نفس الشات.");
      return true;
    }

    await msg.reply("أمر غير معروف. الأوامر: come / reset / setavatar / setbanner / setname");
    return true;
  }

  async function maybeHandlePendingOwnerSteps(msg) {
    if (!isOwner(msg.author.id)) return false;
    if (!pending.channelId || String(pending.channelId) !== String(msg.channel.id)) return false;

    if (pending.avatar || pending.banner) {
      const att = msg.attachments?.first();
      if (!att?.url) {
        await msg.reply("لازم ترسل صورة كمرفق.");
        return true;
      }

      try {
        if (pending.avatar) {
          await client.user.setAvatar(att.url);
          await msg.reply("تم تغيير الأفتار.");
        } else {
          await client.user.setBanner(att.url);
          await msg.reply("تم تغيير البنر.");
        }
      } catch (e) {
        console.error("[SET AVATAR/BANNER ERROR]", e?.message || e);
        await msg.reply("تعذر تغيير الصورة.");
      } finally {
        pending.avatar = pending.banner = false;
        pending.channelId = null;
      }
      return true;
    }

    if (pending.name) {
      const newName = msg.content.trim();
      if (!newName) return true;

      try {
        await client.user.setUsername(newName);
        await msg.reply(`تم تغيير الاسم إلى: ${newName}`);
      } catch (e) {
        console.error("[SETNAME ERROR]", e?.message || e);
        await msg.reply("تعذر تغيير الاسم.");
      } finally {
        pending.name = false;
        pending.channelId = null;
      }
      return true;
    }

    return false;
  }

  async function replyWithThumb(msg, embed, thumbBaseName, components) {
    const thumb = buildThumbAttachment(thumbBaseName);
    const payload = { embeds: [embed] };
    if (components) payload.components = components;

    if (thumb) {
      embed.setThumbnail(`attachment://${thumb.name}`);
      payload.files = [thumb.attachment];
      await msg.reply(payload);
      return;
    }

    await msg.reply(payload);
  }

  async function handleMusicCommands(msg) {
    const content = msg.content.trim();

    if (!isMusicChannel(msg)) return;
    if (!isUserInBotVoiceFromMessage(msg)) return;
    if (!fixedVoiceChannelId) return;

    // PLAY / QUEUE
    if (content.startsWith("ش ")) {
      const query = content.slice(2).trim();
      if (!query) return;

      let player;
      try {
        player = await ensurePlayer({ guildId: msg.guild.id, voiceChannelId: fixedVoiceChannelId });
      } catch (e) {
        if (String(e?.message) === "NO_NODE_AVAILABLE_YET") return;
        console.error("[PLAY ensurePlayer error]", e?.message || e);
        return;
      }

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

        const embed = makeSingleTrackEmbed({ title: "playing", msg, track });
        const rowButtons = buildControlsRow();
        const rowFilters = buildFiltersRow(msg.guild.id);

        await replyWithThumb(msg, embed, "play", [rowButtons, rowFilters]);
        return;
      }

      const embed = makeSingleTrackEmbed({ title: "queued", msg, track });
      await replyWithThumb(msg, embed, "queue");
      return;
    }

    // STOP (command)
    if (content === "وقف") {
      const player = client.lavalink.getPlayer(msg.guild.id);
      if (!player || (!player.playing && !player.paused)) return;

      const current = getCurrentTrack(player);

      try {
        player.queue?.clear?.();
      } catch {}

      const r = await forceStopKeepConnected({
        player,
        nodeHost: lavalink.host,
        nodePort: lavalink.port,
        nodePassword: lavalink.password,
        nodeSecure: lavalink.secure
      });

      if (!r.ok) {
        console.error("[STOP FAILED]", r);
        return;
      }

      lastVoiceStatusText = null;
      await trySetBotPresence(client, "");
      trySetVoiceStatus(client, targetGuildId, fixedVoiceChannelId, "").catch(() => {});

      const embed = makeSingleTrackEmbed({ title: "stopped", msg, track: current });
      await replyWithThumb(msg, embed, "stop");
      return;
    }

    // SKIP (command) ✅ after skip: send NEW playing embed + buttons + filters
    if (content === "تخطي") {
      const player = client.lavalink.getPlayer(msg.guild.id);
      if (!player || (!player.playing && !player.paused)) return;

      const qSize = getQueueSize(player);

      if (qSize <= 0) {
        const r = await forceStopKeepConnected({
          player,
          nodeHost: lavalink.host,
          nodePort: lavalink.port,
          nodePassword: lavalink.password,
          nodeSecure: lavalink.secure
        });

        if (!r.ok) {
          console.error("[SKIP(no-next) FAILED]", r);
          return;
        }

        lastVoiceStatusText = null;
        await trySetBotPresence(client, "");
        trySetVoiceStatus(client, targetGuildId, fixedVoiceChannelId, "").catch(() => {});
        return;
      }

      try {
        await player.skip();
      } catch (e) {
        console.error("[SKIP ERROR]", e?.message || e);
        return;
      }

      await new Promise((r) => setTimeout(r, 450));
      const nowTrack = getCurrentTrack(player);

      if (nowTrack) {
        lastKnownTrack.set(String(msg.guild.id), nowTrack);
        await updateStatusesForPlayer(player);

        await sendNowPlayingEmbedToChannel({
          channel: msg.channel,
          msgForFooter: msg,
          track: nowTrack,
          thumbBaseName: "play",
          guildId: msg.guild.id
        });
      }

      return;
    }
  }

  // =========================
  // ✅ Interactions (Buttons + Select Menu)
  // =========================
  client.on("interactionCreate", async (interaction) => {
    try {
      if (!interaction.guild) return;
      if (String(interaction.guild.id) !== String(targetGuildId)) return;

      // لازم يكون داخل شات التحكم
      if (controlTextChannelId && String(interaction.channelId) !== String(controlTextChannelId)) {
        await interaction.reply({ content: "التفاعل يعمل فقط في شات الروم.", ephemeral: true }).catch(() => {});
        return;
      }

      // لازم يكون مع البوت بالروم
      if (!isUserInBotVoiceFromInteraction(interaction)) {
        await interaction.reply({ content: "لازم تكون مع البوت بالروم الصوتي.", ephemeral: true }).catch(() => {});
        return;
      }

      const player = client.lavalink.getPlayer(interaction.guild.id);
      if (!player) {
        // لو القائمة/الزر تم ضغطه وما فيه تشغيل
        if (interaction.isRepliable()) {
          await interaction.reply({ content: "ما فيه تشغيل حالياً.", ephemeral: true }).catch(() => {});
        }
        return;
      }

      const gid = String(interaction.guild.id);
      const vcId = fixedVoiceChannelId;

      // ===== Buttons =====
      if (interaction.isButton()) {
        // REPEAT toggle
        if (interaction.customId === BTN.REPEAT) {
          const cur = !!repeatEnabled.get(gid);
          const next = !cur;
          repeatEnabled.set(gid, next);

          await interaction
            .reply({ content: next ? "تكرار الاغنيه: ON ✅" : "تكرار الاغنيه: OFF ❌", ephemeral: true })
            .catch(() => {});
          return;
        }

        // VOL DOWN
        if (interaction.customId === BTN.VOLDOWN) {
          const current = Number(guildVolume.get(gid) ?? player.volume ?? 100) || 100;
          const next = Math.max(15, current - 15);
          guildVolume.set(gid, next);

          await setPlayerVolume({ player, volume: next, lavalink }).catch(() => {});
          await interaction.reply({ content: `تم خفض صوت الاغاني إلى ${next}%`, ephemeral: true }).catch(() => {});
          return;
        }

        // VOL UP
        if (interaction.customId === BTN.VOLUP) {
          const current = Number(guildVolume.get(gid) ?? player.volume ?? 100) || 100;
          const next = Math.min(100, current + 15);
          guildVolume.set(gid, next);

          await setPlayerVolume({ player, volume: next, lavalink }).catch(() => {});
          await interaction.reply({ content: `تم رفع صوت الاغاني إلى ${next}%`, ephemeral: true }).catch(() => {});
          return;
        }

        // STOP (button): stop current track only
        if (interaction.customId === BTN.STOP) {
          const r = await forceStopKeepConnected({
            player,
            nodeHost: lavalink.host,
            nodePort: lavalink.port,
            nodePassword: lavalink.password,
            nodeSecure: lavalink.secure
          });

          if (!r.ok) {
            await interaction.reply({ content: "تعذر إيقاف الاغنيه.", ephemeral: true }).catch(() => {});
            return;
          }

          lastVoiceStatusText = null;
          await trySetBotPresence(client, "");
          if (vcId) trySetVoiceStatus(client, targetGuildId, vcId, "").catch(() => {});

          await interaction.reply({ content: "تم إيقاف الاغنيه ✅", ephemeral: true }).catch(() => {});
          return;
        }

        // SKIP (button) ✅ after skip: send NEW playing embed + buttons + filters
        if (interaction.customId === BTN.SKIP) {
          if (!player.playing && !player.paused) {
            await interaction.reply({ content: "ما فيه اغنيه شغاله.", ephemeral: true }).catch(() => {});
            return;
          }

          const qSize = getQueueSize(player);

          if (qSize <= 0) {
            const r = await forceStopKeepConnected({
              player,
              nodeHost: lavalink.host,
              nodePort: lavalink.port,
              nodePassword: lavalink.password,
              nodeSecure: lavalink.secure
            });

            if (!r.ok) {
              await interaction.reply({ content: "تعذر تخطي الاغنيه.", ephemeral: true }).catch(() => {});
              return;
            }

            lastVoiceStatusText = null;
            await trySetBotPresence(client, "");
            if (vcId) trySetVoiceStatus(client, targetGuildId, vcId, "").catch(() => {});

            await interaction.reply({ content: "تم إيقاف الاغنيه (ما فيه طابور).", ephemeral: true }).catch(() => {});
            return;
          }

          try {
            await player.skip();
          } catch {
            await interaction.reply({ content: "تعذر تخطي الاغنيه.", ephemeral: true }).catch(() => {});
            return;
          }

          await interaction.reply({ content: "تم التخطي ✅", ephemeral: true }).catch(() => {});

          setTimeout(async () => {
            try {
              const nowTrack = getCurrentTrack(player);
              if (!nowTrack) return;

              lastKnownTrack.set(gid, nowTrack);
              await updateStatusesForPlayer(player);

              await sendNowPlayingEmbedToChannel({
                channel: interaction.channel,
                msgForFooter: { author: interaction.user },
                track: nowTrack,
                thumbBaseName: "play",
                guildId: interaction.guild.id
              });
            } catch {}
          }, 500);

          return;
        }
      }

      // ===== Select Menu (Filters) =====
      if (interaction.isStringSelectMenu() && interaction.customId === SELECT.FILTERS) {
        const chosen = interaction.values?.[0];
        if (!chosen) {
          await interaction.reply({ content: "اختيار غير صالح.", ephemeral: true }).catch(() => {});
          return;
        }

        const r = await applyFilterPreset({ player, presetValue: chosen });
        if (!r.ok) {
          await interaction.reply({ content: "تعذر تطبيق الفلتر.", ephemeral: true }).catch(() => {});
          return;
        }

        // نحدّث الـ default في القائمة (بدون تعديل الرسالة القديمة عشان ما يزعج)
        await interaction
          .reply({
            content: `تم تطبيق الفلتر: ${r.preset.label}\n${r.preset.description}`,
            ephemeral: true
          })
          .catch(() => {});
        return;
      }
    } catch (e) {
      console.error("[INTERACTIONS ERROR]", e?.message || e);
      try {
        if (interaction?.isRepliable && interaction.isRepliable() && !interaction.replied) {
          await interaction.reply({ content: "صار خطأ.", ephemeral: true });
        }
      } catch {}
    }
  });

  // ✅ INIT
  client.once("ready", async () => {
    try {
      await client.lavalink.init({ id: client.user.id, username: "musicbot" });
    } catch (e) {
      console.error("[Lavalink init error]", e?.message || e);
    }

    setupAutoAdvanceOnce();

    const tryAutoConnect = async (reason = "startup") => {
      if (!fixedVoiceChannelId) return;
      const g = client.guilds.cache.get(String(targetGuildId));
      if (!g) return;

      const existing = client.lavalink.getPlayer(g.id);
      if (existing?.connected) return;

      await ensurePlayer({ guildId: g.id, voiceChannelId: fixedVoiceChannelId });
      console.log(`[Auto-connect] Connected to saved VC (${fixedVoiceChannelId}) reason=${reason}`);
    };

    try {
      client.lavalink.nodeManager.on("connect", (node) => {
        console.log(`[Node] connected id=${node?.id}`);
        tryAutoConnect("node_connect").catch((e) => {
          if (String(e?.message) === "NO_NODE_AVAILABLE_YET") return;
          console.error("[Auto-connect error]", e?.message || e);
        });
      });

      client.lavalink.nodeManager.on("error", (node, error) => {
        console.error(`[Node] error id=${node?.id}`, error?.message || error);
      });

      client.lavalink.nodeManager.on("disconnect", (node) => {
        console.log(`[Node] disconnected id=${node?.id}`);
      });
    } catch {}

    for (let i = 1; i <= 10; i++) {
      try {
        await tryAutoConnect(`retry_${i}`);
        break;
      } catch (e) {
        if (String(e?.message) !== "NO_NODE_AVAILABLE_YET") {
          console.error("[Auto-connect error]", e?.message || e);
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  });

  client.on("messageCreate", async (msg) => {
    try {
      if (!isInTargetGuild(msg)) return;
      if (msg.author.bot) return;

      if (await maybeHandlePendingOwnerSteps(msg)) return;

      if (client.user && msg.mentions.has(client.user)) {
        const handled = await handleOwnerMentionCommand(msg);
        if (handled) return;
      }

      await handleMusicCommands(msg);
    } catch (err) {
      console.error("[MUSIC ERROR]", err);
    }
  });

  process.on("unhandledRejection", (reason) => console.error("[MUSIC unhandledRejection]", reason));
  process.on("uncaughtException", (err) => console.error("[MUSIC uncaughtException]", err));

  client.login(token);
  return client;
}

module.exports = { startMusicBot };
