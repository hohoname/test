const { Discord, Permissions, Intents, Client, MessageEmbed, MessageAttachment, Collection, Collector, MessageCollector, MessageActionRow, MessageButton, MessageSelectMenu, WebhookClient } = require('discord.js');
require('events').EventEmitter.defaultMaxListeners = 200;
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello Express app!')
});
app.listen(30001, () => {
  console.log('Server Started..');
});

function convertTimeToSeconds(timeString) {
  const time = timeString.toLowerCase();
  const units = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    w: 604800
  };

  const unit = time.charAt(time.length - 1);
  const value = parseInt(time.slice(0, time.length - 1));
  if (unit in units) {
    return value * units[unit];

  } else {
    return 0; 
  }
}


const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_MESSAGES,
  ],
  partials: ['CHANNEL', 'MESSAGE', 'USER', 'GUILD_MEMBER'],
  allowedMentions: {
    parse: ['users'],
    repliedUser: false
  }
});



const ms = require("ms");
const fs = require('fs');
const { SpotifyPlugin } = require("@distube/spotify");
const { SoundCloudPlugin } = require("@distube/soundcloud");
const { DisTube } = require("distube");
const config = require('./config.json');
const { owners, prefix, emco, useEmbeds, Support, logChannelId} = require(`${process.cwd()}/config`);
const fetch = require("node-fetch");
client.prefix = prefix;
module.exports = client;
client.commands = new Collection();
client.slashCommands = new Collection();
client.config = require(`${process.cwd()}/config`);
require("./handler")(client);
const tempData = new Collection();
tempData.set("bots", []);







client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  setInterval(checkSubscriptions, 30000);
  client.user.setActivity("Storm Store.", {
      type: "STREAMING",
      url: `https://twitch.tv/storm`,
  }); // حط الحاله اللي انت تبيها
  client.user.setStatus("STREAMING"); // هنا لو تبي تغير تعيين الحاله مثال
});

// دالة للتحقق من حالة الاشتراكات
function checkSubscriptions() {
  try {
    const logs = fs.readFileSync('./logs.json', 'utf8');
    const logsArray = JSON.parse(logs);

    const logChannel = client.channels.cache.find(channel => channel.id === logChannelId);

    logsArray.forEach((log, index) => {
      const remainingTime = log.expirationTime - Date.now();
      if (remainingTime <= 0) {
        const user = client.users.cache.get(log.user);
        if (user) {
          // إرسال معلومات الاشتراك في رسالة خاصة للشخص
          user.send( {
            files: ['https://media.discordapp.net/attachments/1283130591319163004/1322117351948423188/IMG_6126.png?ex=676fb53c&is=676e63bc&hm=68b7696685aff2567f156af73b0fe505d3603931ade85e548c69b254f6dc7189&=&format=webp&quality=lossless&width=1292&height=593'],
          });
    

          
          const mention = `\`🔔\` - **Notice: <@&${Support}> **`;
          const embed = new MessageEmbed()
            .setTitle('Anend Subscription Details')
            .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1198777786312163438/deadline.png?ex=65c023d0&is=65adaed0&hm=9a84febd33023bb154c7ba9937d58240f4adbadb3416f7edfc814af816713164&")
            .setDescription(`**UserID:** \`${user.id}\`\n**Username:** \`${user.username}\` / <@${user.id}>\n**ServerId**: \`${log.server}\`\n**Number of Bots:** \`${log.botsCount}\`\n**Subscription Time:** \`${log.subscriptionTime}\`\n**Expiration Time:** \`${new Date(log.expirationTime).toLocaleString()}\`\n**Code:** \`${log.code}\``)
            .setColor(emco);
          
          logChannel.send({ content: mention, embeds: [embed] });
           
        }

        logsArray.splice(index, 1);

        // استخراج التوكنات المرتبطة بالاشتراك المحذوف
        const tokens = fs.readFileSync('./tokens.json', 'utf8');
        const tokensArray = JSON.parse(tokens);

        const tokensToRemove = tokensArray.filter(tokenEntry => tokenEntry.code === log.code);

        // إضافة التوكنات إلى ملف bots.json
        const bots = fs.readFileSync('./bots.json', 'utf8');
        const botsArray = JSON.parse(bots);

        tokensToRemove.forEach(tokenEntry => {
          botsArray.push({
            token: tokenEntry.token,
            Server: null,
            channel: null,
            chat: null,
            status: null,
            client: null,
            useEmbeds: false
          });
        });

        fs.writeFileSync('./bots.json', JSON.stringify(botsArray, null, 2));

        // حذف التوكنات من ملف tokens.json
        const updatedTokensArray = tokensArray.filter(tokenEntry => !tokensToRemove.includes(tokenEntry));
        fs.writeFileSync('./tokens.json', JSON.stringify(updatedTokensArray, null, 2));
      }
    });

    // تحديث ملف السجلات بعد حذف الاشتراك
    fs.writeFileSync('./logs.json', JSON.stringify(logsArray, null, 2));
  } catch (error) {
    console.error('❌>', error);
  }
}




setTimeout(async () => {
  var data = fs.readFileSync('./tokens.json');
  var parsedData = JSON.parse(data);
  var tokens_data = parsedData;
  if (!tokens_data[0]) return;

  tokens_data.forEach(token => {
    runBotSystem(token.token);
  });
}, 3000);

async function convert(harinder) {
  try {
    const temperance = await fetch(harinder);
    const myrtte = temperance.url;
    if (myrtte) {
      return `${""}${myrtte}${""}`;
    } else {
      return null;
    }
  } catch (deari) {
    return 0;
  }
}


async function runBotSystem(token) {
  const client83883 = new Client({
    intents: [
      Intents.FLAGS.GUILDS,
      Intents.FLAGS.GUILD_MEMBERS,
      Intents.FLAGS.GUILD_MESSAGES,
      Intents.FLAGS.GUILD_VOICE_STATES
    ],
    partials: ['CHANNEL', 'GUILD_MEMBER'],
    allowedMentions: {
      parse: ['users'],
      repliedUser: false
    }
  });
 


  client83883.music = new DisTube(client83883, {
    leaveOnStop: false,
    leaveOnEmpty: false,
    emitNewSongOnly: true,
    emitAddSongWhenCreatingQueue: false,
    emitAddListWhenCreatingQueue: false,
    plugins: [
      new SpotifyPlugin({
        emitEventsAfterFetching: true,
      }),
      new SoundCloudPlugin(),
    ],
    youtubeDL: false
  });



  const skipButton = new MessageButton()
  .setCustomId('skipButton')
  .setEmoji("<:skipstart_1:1224082806741930108>")
  .setStyle('SECONDARY');
const volumeUpButton = new MessageButton()
  .setCustomId('volumeUpButton')
  .setEmoji("<:highvolume:1224081870409564231>")
  .setStyle('SECONDARY');
  const stopButton = new MessageButton()
  .setCustomId('pauseButton')
  .setEmoji("<:pause:1224080944013770822>")  // تغيير الإيموجي للإشارة للإيقاف المؤقت
  .setStyle('SECONDARY');
  const volumeDownButton = new MessageButton()
  .setCustomId('volumeDownButton')
  .setEmoji("<:lowvolume:1224079426564788274>")
  .setStyle('SECONDARY');
  const repeatButton = new MessageButton()
  .setCustomId('repeatButton')
  .setEmoji("<:undoarrow:1224078115479883816>")
  .setStyle('SECONDARY');
const row = new MessageActionRow()


  .addComponents(repeatButton, volumeDownButton, stopButton, volumeUpButton, skipButton);



  
  client83883.lastVolume = 50;
  client83883.music
  .on('playSong', (queue, song) => {
    if (useEmbeds) {
      const embed = new MessageEmbed()
      .setAuthor("🎵 Playing song")
      .setColor(emco) 
      .addFields(
        { name: 'Song Name', value: `***Started:* [${song.name}](${song.url})**` },
        { name: 'Song Duration', value: `(\`${song.formattedDuration}\`)` }
      )
      .setThumbnail("https://cdn.discordapp.com/attachments/1161286178822176858/1205557078890905610/ddddd.png?ex=65d8cd85&is=65c65885&hm=c45afc56ea3abbc91d3cac1215ec2698e45a5727f5fa5ad9e958b1a8e3c87bef&")     
      .setFooter(client83883.user.username, client83883.user.displayAvatarURL())
      song.metadata.msg.edit({ embeds: [embed], components: [row] }).catch(() => 0);
      
    } else {
      song.metadata.msg.edit({
        content: `_Now playing :_ **${song.name}** _Time:_ **${song.formattedDuration}**.`,
        components: [row]
      }).catch(() => 0);
      
    }
    if (queue?.volume !== client83883.lastVolume) {
      queue.setVolume(client83883.lastVolume);
    };
  })
  .on('addSong', (queue, song) => {
    if (useEmbeds) {
      const embed = new MessageEmbed()
        .setAuthor("ϟ Adding to queue")
        .setColor(emco) 
        .addFields(
          { name: 'Song Name', value: `**${song.name}**` },
          { name: 'Song Duration', value: `(\`${song.formattedDuration}\`)` }
        )
        .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1169710999268491325/NowPlaying.png?ex=65566542&is=6543f042&hm=00a5c0c58c2c36e143b5b778cc3681aea08c75b8458c413133a490343197ec7b& ")     
        .setFooter(client83883.user.username, client83883.user.displayAvatarURL())
      song.metadata.msg.edit({ embeds: [embed] }).catch(() => 0);
    } else {
      song.metadata.msg.edit({
        content: `_Added :_ **${song.name} \`(${song.formattedDuration})\`** _Song to Queue_`,
        components: [row]
      }).catch(() => 0);
    }
  })
  .on('addList', (queue, playlist) => {
    if (useEmbeds) {
      const embed = new MessageEmbed()
      .setColor(emco) 
        .setDescription(`🔂 **أُضيفت قائمة الآغاني** *${playlist.name}* (\`${playlist.songs.length}\` آغنية) **إلى طابور الأغاني**`);
      song.metadata.msg.edit({ embeds: [embed] }).catch(() => 0);
    } else {
      song.metadata.msg.edit(`🔂 **أُضيفت قائمة الآغاني** *${playlist.name}* (\`${playlist.songs.length}\` آغنية) **إلى طابور الأغاني**`).catch(() => 0);
    }
  })
  .on('error', (channel, e) => {
    console.log(e);
    if (channel) {
      if (useEmbeds) {
        const embed = new MessageEmbed()
        .setColor(emco) 
          .setDescription(`♨️ **تم إستقبال خطأ:** ${e.toString().slice(0, 1974)}`);
        channel.send({ embeds: [embed] }).catch(() => 0);
      } else {
        channel.send(`♨️ **تم إستقبال خطأ:** ${e.toString().slice(0, 1974)}`).catch(() => 0);
      }
    } else {
      console.error(e);
    }
  })
  .on('searchNoResult', (message, query) => {
    if (useEmbeds) {
      const embed = new MessageEmbed()
      .setColor(emco) 
        .setDescription(`> ♨️ **لم يتم إيجاد نتائج بحث لـ** *${query}*`);
      message.reply({ embeds: [embed] }).catch(() => 0);
    } else {
      message.reply(`> ♨️ **لم يتم إيجاد نتائج بحث لـ** *${query}*`).catch(() => 0);
    }
  });

  client83883.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
  
    const queue = client83883.music.getQueue(interaction.guildId);
  
    if (!queue) {
      await interaction.reply({ content: '***There is no song currently playing.***', ephemeral: true });
      return;
    }
  

    
    switch (interaction.customId) {
      case 'repeatButton':
        if (queue.repeatMode === 0) {
          queue.setRepeatMode(1);
          await interaction.reply({ content: '_Repeat mode set to :_ **ON**', ephemeral: true });
        } else if (queue.repeatMode === 1) {
          queue.setRepeatMode(0);
          await interaction.reply({ content: '_Repeat mode set to :_ **OFF**', ephemeral: true });
        }  
        break;
    
      case 'volumeDownButton':
        const newVolumeDown = queue.volume - 10;
        if (newVolumeDown >= 0) {
          queue.setVolume(newVolumeDown); // خفض مستوى الصوت بـ 10 درجات
          await interaction.reply({ content: `***ϟ Volume changed from \`${queue.volume}%\` .***`, ephemeral: true });
        } else {
          await interaction.reply({ content: '***Volume cannot be set below 0%.***', ephemeral: true });
        }
        break;
    
      case 'pauseButton':
        if (queue.paused) {
          queue.resume();
          await interaction.reply({ content: '***song has resumed.***', ephemeral: true });
        } else {
          queue.pause();
          await interaction.reply({ content: '***song has been paused.***', ephemeral: true });
        }
        break;
    
      case 'volumeUpButton':
        const newVolumeUp = queue.volume + 10;
        if (newVolumeUp <= 150) {
          queue.setVolume(newVolumeUp);
          await interaction.reply({ content: `***volume has been raised to \`${queue.volume}%\` .***`, ephemeral: true });
        } else {
          queue.setVolume(150);
          await interaction.reply({ content: `***volume is raised to maximum by 150%.***`, ephemeral: true });
        }
        break;
    
      case 'skipButton':
        if (queue.songs.length <= 1) {
          await interaction.reply({ content: '*Server queue is empty.*', ephemeral: true });
          return;
        }
        queue.skip();
        await interaction.reply({ content: '***ϟ Skipped the current song.***', ephemeral: true });
        break;
    
      default:
        await interaction.reply({ content: 'الزر غير معرف.', ephemeral: true });
        break;
    }
  });
  







  client83883.on('ready', async () => {
    let newData = tempData.get("bots");
    newData.push(client83883);
    tempData.set(`bots`, newData);

    let botNumber = newData.indexOf(client83883) + 1;
    console.log(`🎶 ${botNumber} > ${client83883.user.username} : ${client83883.guilds.cache.first()?.name}`);

    let int = setInterval(async () => {
        var data = fs.readFileSync('./tokens.json', 'utf8');
        if (!data || data == '') return;
        data = JSON.parse(data);
        tokenObj = data.find((tokenBot) => tokenBot.token == token);
        if (!tokenObj) {
            client83883.destroy()?.catch(() => 0);
            return clearInterval(int);
        };

        let serverID = tokenObj.Server; // استخراج الـ ID للسيرفر من ملف التوكنات

        if (tokenObj.channel) {
            let guild = client83883.guilds.cache.get(serverID);
            if (guild) {
                let voiceChannel = guild?.me.voice.channel;
                if (!voiceChannel) {
                    let musicChannel = guild.channels.cache.get(tokenObj?.channel);
                    if (musicChannel && musicChannel.joinable) {
                        client83883.music.voices.join(musicChannel).catch(() => 0);
                    }
                }
                if (voiceChannel && voiceChannel.id !== tokenObj.channel) {
                    let musicChannel = guild.channels.cache.get(tokenObj?.channel);
                    if (musicChannel && musicChannel.joinable) {
                        client83883.music.voices.join(musicChannel).catch(() => 0);
                    }
                }
            }
        } else {
            let guild = client83883.guilds.cache.get(serverID);
            if (guild) {
                let voiceChannel = guild?.me.voice.channel;
                if (voiceChannel) {
                    client83883.music.voices.leave(guild.id);
                }
            }
        }
    }, 5000);
});



client83883.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  var data = fs.readFileSync('./tokens.json', 'utf8');
  if (data == '' || !data) return;
  data = JSON.parse(data);
  let tokenObj = data.find((t) => t.token == token);
  if (!data || !tokenObj) return;
  
  let args = message.content?.trim().split(' ');
  if (args) {
      if (args[0] == `<@!${client83883.user.id}>` || args[0] == `<@${client83883.user.id}>`) {
          args = args.slice(1);
          if (!args[0]) return;
          if (args[0] == 'help') {
            const botOwnerId = tokenObj.client; // استخراج الأيدي من ملف التوكنات
          
            const button1 = new MessageButton()
              .setLabel('Support')
              .setStyle('LINK')
              .setURL('https://discord.gg/Y7tr8PFTkc');
          
            const row1 = new MessageActionRow().addComponents(button1);
          
            const helpEmbed = new MessageEmbed()
            .setAuthor('Portal', client83883.user.displayAvatarURL({ dynamic: true }))
            
            .setTitle('*أوامر الاغاني :*')

            .setDescription(`
            \`play\` : Play Song from youtube or soundcloud or spotify
            \`stop\` : Stop The music
            \`skip\` : Skip The current song
            \`volume\` : Set The music volume
            \`nowplaying\` : Show The song playing now
            \`loop\` : loop The queue
            \`pause\` : Pause The server queue
            \`resume\` : Resume The music
            \`seek\` : It exceeds 10 seconds
            \`forward\` : Skip the specified path
            \`autoplay\` : Autoplay mode for songs
            \`queue\` : Get server Playlist
            \`join\` : Set bot Channel enable 24/7
            \`setup\` : Installing bot with Voice and changing its name 24/7
            \`leave\` : Leave From channel disable 24/7
            \`setchat\`: Set Commands chat
            \`unchat\`: un Commands chat
            \`setprefix\`: Set a prefix bot
            \`setting\` : Display bot settings
            \`ping\` : Show Bot response speed
            \`restart\` : Restart The bot
            \`setavatar\` : Change Avatar bot
            \`setname\` : Change Name bot
            \`setstreaming\` : Change The bot's state
            \`restart\` : Restart the bot
             `)


    
            
            
          
              const additionalEmbed = new MessageEmbed()
              .setDescription(`
              **Owner:** <@${botOwnerId}>
              **Owner Id:** ${botOwnerId}`);
              

            message.author.send({
              embeds: [helpEmbed,additionalEmbed],
              components: [row1],
            }).then(async () => {
              message.react("✅").catch(() => 0);
            }).catch(() => {
              message.react("🔒").catch(() => 0);
            });
          }
          


        if (!owners.includes(message.author.id) && !message.member.permissions.has('ADMINISTRATOR')) {
          return;
        }     
             if(args[0] == 'restart' || args[0] == 'اعاده') {
             await client83883.destroy()
             setTimeout(async() => {
               client83883.login(token).then(() => {
                 message.react(`💹`).catch(() => 0)
             }).catch(() => { console.log(`${client83883.user.tag} (${client83883.user.id}) has an error with restarting.`) })
           }, 5000)
              
           } else if (args[0] == 'setname' || args[0] == 'اسم'|| args[0] == 'name' || args[0] == 'sn') {
            let name = args.slice(1).join(' ');
            if (!name) return;
        
            const tryChangeName = (newName, attempts = 0) => {
                client83883.user.setUsername(newName).then(async () => {
                    message.react('✅').catch(() => 0);
                }).catch((error) => {
                    if (error.code === 50035) { // الإسم مُستخدم كثيرًأ
                        if (attempts < 3) { // تحديد عدد المحاولات المسموح بها
                            const newNameWithDot = `${newName}.`; // إضافة نقطة إلى الإسم
                            tryChangeName(newNameWithDot, attempts + 1); // المحاولة مرة أخرى مع الإسم المُعدل
                        } else {
                            message.react('⏳').catch(() => 0); // تفاعل خطأ عند الوصول للحد الأقصى للمحاولات
                        }
                    } else {
                        console.error(error);
                        message.reply("An error occurred while changing the bot's name.");
                    }
                });
            };
        
            tryChangeName(name); // بدء المحاولة لتغيير الإسم
  
           } else if (args[0] == 'setavatar' || args[0] == 'صورة' || args[0] == 'avatar' || args[0] == 'avatar' || args[0] == 'sa') {
            let url = args[1];
            if (!url && !message.attachments.first()) return;
          
            if (message.attachments.first()) {
              url = message.attachments.first().url;
            }
          
            client83883.user.setAvatar(url)
              .then(() => {
                message.react('✅').catch(() => {});
              })
              .catch((error) => {
                message.react('✅').catch(() => {});
              });
                    
           } else if (args[0] == 'join' || args[0] == 'leave' || args[0] == 'setchannel' || args[0] == 'come' || args[0] == 'تعال' || args[0] == 'ادخل'|| args[0] == 'اخرج'|| args[0] == 'اطلع'|| args[0] == 'disablechannel' ) {
            let data = fs.readFileSync('./tokens.json');
            data = JSON.parse(data);
            tokenObj = data.find((tokenBot) => tokenBot.token == token);
            let channel;
            if (args[0] == 'join' || args[0] == 'come' || args[0] == 'setvc' || args[0] == 'ادخل' || args[0] == 'تعال')  {
              channel = message.member.voice.channel;
              if (!channel) return;
            } else {
              channel = await message.guild.channels.fetch(args[1]).catch(() => 0);
              if (!channel) return;
            }
            data = data.map((tokenBot) => {
              if (tokenBot.token == token) {
                tokenBot.channel = channel.id;
              }
              return tokenBot;
            });
            fs.writeFile('./tokens.json', JSON.stringify(data, null, 2), (err) => {
              if (err) throw err;
            });
            message.react('✅');
          }  
          else if (args[0] == 'setup') {
            let channel = message.member.voice.channel;
            if (!channel) return;
          
            data = data.map((tokenBot) => {
              if (tokenBot.token == token) {
                tokenBot.channel = channel.id;
              }
              return tokenBot;
            });
          
            // تغيير اسم البوت نفسه
            const cooldownTime = 5000; // تعيين فترة الانتظار بالمللي ثانية (5 ثوانٍ)
            const lastChangeTime = client83883.user.lastChangeTime || 0;
            const currentTime = Date.now();
          
            // إذا مضت فترة زمنية أقل من cooldownTime من آخر مرة تم فيها تغيير الاسم
            if (currentTime - lastChangeTime < cooldownTime) {
              return message.react('⏳');
            }
          
            try {
              await client83883.user.setUsername(channel.name);
              // تحديث وقت آخر تغيير
              client83883.user.lastChangeTime = Date.now();
              fs.writeFile('./tokens.json', JSON.stringify(data, null, 2), (err) => {
                if (err) throw err;
              });
              message.react('✅');
            } catch (error) {
              if (error.code === 50035) {
                // يتم إعادة المحاولة في حالة حدوث خطأ 50035
                return message.react('⏳');
              } else {
                console.error(error);
              }
            }
                  
          } else if (args[0] == 'setchat' || args[0] == 'chat' || args[0] == 'settc' || args[0] == 'اوامر') {
            let data = fs.readFileSync('./tokens.json', 'utf8');
            let parsedData = JSON.parse(data);
            
            tokenObj = parsedData.find((tokenBot) => tokenBot.token == token);
            
            if (!tokenObj) return;
            
            let channel = message.guild.channels.cache.get(message.channel.id); // Get the channel where the command was executed
            
            if (!channel) return;
            
            parsedData = parsedData.map((tokenBot) => {
                if (tokenBot.token == token) {
                    tokenBot.chat = channel.id; // Set the channel ID as the chat channel
                }
                return tokenBot;
            });
            
            fs.writeFile('./tokens.json', JSON.stringify(parsedData, null, 2), (err) => {
                if (err) throw err;
                message.react('✅');
            });        
          
          } else if (args[0] == 'unchat' || args[0] == 'unt' || args[0] == 'الغاء') {
            let data = fs.readFileSync('./tokens.json', 'utf8');
            let parsedData = JSON.parse(data);
            
            tokenObj = parsedData.find((tokenBot) => tokenBot.token == token);
            
            if (!tokenObj) return;
            
            let channelId = tokenObj.chat;
            if (!channelId) return message.reply('**لا يوجد شات مُحدد.**');
                
            parsedData = parsedData.map((tokenBot) => {
                if (tokenBot.token == token) {
                    delete tokenBot.chat; // Remove the chat ID
                }
                return tokenBot;
            });
            
            fs.writeFile('./tokens.json', JSON.stringify(parsedData, null, 2), (err) => {
                if (err) throw err;
                message.react('✅');
            });
            loadPrefix();

        } else if (args[0] == 'ping' || args[0] == 'بنج' || args[0] == 'بنغ') {
            const ping = client.ws.ping;
            message.reply(`***ϟ Pong! My ping is ${ping}ms.***`);
            
          }else if (args[0] === 'setting' || args[0] == 'st' || args[0] == 'اعدادات' || args[0] == 'معلومات' || args[0] == 'settings') {
            let voiceChannel = message.guild.channels.cache.get(tokenObj.channel);
            let commandChat = message.guild.channels.cache.get(tokenObj.chat);
                        const embed = new MessageEmbed()
              .setThumbnail(client83883.user.displayAvatarURL({ dynamic: true }))
              .setColor(emco) 
              .setDescription(`
                **Platform :** \`YouTube\`
                **Voice Channel :** ${voiceChannel ? `<#${voiceChannel.id}>` : '`Not set`'}
                **Text Channel :** ${commandChat ? `<#${commandChat.id}>` : '`Not set`'}
                **Play In Voice Channel :** \`Disable\`
                **Number of Servers the Bot is in :** \`${client83883.guilds.cache.size}\`
              `);
            
            message.reply({ embeds: [embed] });

          } else if (args[0] == 'setstreaming' || args[0] == 'streaming' || args[0] == 'ste' || args[0] == 'ستريمنج') {
            let status = message.content.split(" ")[2];
            if (!status) return message.react("❌");
            client83883.user.setPresence({
              activities: [
                {
                  name: status,
                  type: 'STREAMING',
                  url: "https://twitch.tv/" + status,
                },
              ],
              status: 'online',
            });
            message.react("✅");
          
            // Save the new status in the token file
            let tokens = fs.readFileSync('./tokens.json');
            tokens = JSON.parse(tokens);
            let tokenObj = tokens.find((tokenBot) => tokenBot.token == token);
            tokenObj.status = status;
            fs.writeFileSync('./tokens.json', JSON.stringify(tokens, null, 2));
          } else if (args[0] == 'setprefix') {
            if (!args[1]) return message.reply('يرجى تحديد البادئة الجديدة للبوت.');
  
            let newPrefix = args[1];  
            
            let data = fs.readFileSync('./tokens.json', 'utf8');
            let parsedData = JSON.parse(data);
            let tokenObj = parsedData.find((tokenBot) => tokenBot.token === token);
            if (tokenObj) {
                tokenObj.prefix = newPrefix;  
            } else {
                parsedData.push({ token, prefix: newPrefix });  
            }
            fs.writeFileSync('./tokens.json', JSON.stringify(parsedData, null, 2));
            
            message.reply(`**تم تحديث بادئه إلي : \`${newPrefix}\`**`);

        } else if (args[0] == 'addrole') {
          if (!message.mentions.roles.size) {
              return message.reply('يرجى منشن الرول لتحديد الإيدي.');
          }
      
          const role = message.mentions.roles.first();
          const roleId = role.id;
      
          let data = fs.readFileSync('./tokens.json', 'utf8');
          let parsedData = JSON.parse(data);
          
          tokenObj = parsedData.find((tokenBot) => tokenBot.token == token);
          
          if (!tokenObj) return;
          
          // حفظ أيدي الرول مع التوكن
          parsedData = parsedData.map((tokenBot) => {
              if (tokenBot.token == token) {
                  tokenBot.Admin = roleId;
              }
              return tokenBot;
          });
          
          fs.writeFile('./tokens.json', JSON.stringify(parsedData, null, 2), (err) => {
              if (err) throw err;
              message.react('✅');
          });
      }
      
          
        }
      }
    });

    


    client83883.on("ready", () => {
      // تحديد وظيفة للشيك على حالة التوكنات كل 10 ثوانٍ
      setInterval(() => {
        fs.readFile('./tokens.json', 'utf8', (err, data) => {
          if (err) {
            console.error(err);
            return;
          }
          const tokens = JSON.parse(data);
          tokens.forEach((token) => {
            // إذا كان هناك حالة محددة للتوكن الحالي، قم بتعيين حالة البوت بناءً عليها
            if (token.status && token.token === client83883.token) {
              client83883.user.setPresence({
                activities: [
                  {
                    name: token.status,
                    type: 'STREAMING',
                    url: "https://twitch.tv/storm" + token.status,
                  },
                ],
                status: 'online',
              });
            }
          });
        });
      }, 10000); // الشيك كل 10 ثوانٍ
    });
    
    

  
// -----------------------------------------------------------

client83883.on("ready", () => { client83883.user.setPresence({ status: 'dnd', activities: [{ name: `Storm Music`, type: "STREAMING", url: "https://www.twitch.tv/stormS" }] }); });



client83883.on('guildCreate', async (guild) => {
  let tokens = [];
  try {
    const tokensData = fs.readFileSync('./tokens.json', 'utf8');
    tokens = JSON.parse(tokensData);
  } catch (error) {
    console.error('Error reading tokens.json:', error);
    return;
  }

  const guildId = guild.id;
  const botName = client83883.user.tag; // اسم البوت
  if (!tokens.some(token => token.Server === guildId)) {
    await guild.leave();
    console.log(`\x1b[31m > left server ${botName} : ${guild.name}\x1b[0m`);
  } else {
    console.log(`\x1b[32m✅ > joined server ${botName} : ${guild.name}\x1b[0m`);
  }
});


// -----------------------------------------------------------
client83883.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  let member_voice = message.member?.voice?.channel;
  if (!member_voice) return;
  let client_voice = message.guild.me?.voice?.channel;
  if (!client_voice) return;
  if (member_voice.id !== client_voice.id) return;

  var data = fs.readFileSync('./tokens.json', 'utf8');
  if (!data || data == '') return;
  data = JSON.parse(data);
  if (!data) return;

  let botData = data.find((tok) => tok.token == token);
  if (!botData) return;

  let prefix = botData.prefix || "";

      let cmdsArray = {
      play: [`${prefix}شغل`, `${prefix}ش`, `${prefix}p`, `${prefix}play`, `${prefix}P`, `${prefix}Play`],
      stop: [`${prefix}stop`, `${prefix}وقف`, `${prefix}Stop`, `${prefix}توقيف`],
      skip: [`${prefix}skip`, `${prefix}سكب`, `${prefix}تخطي`, `${prefix}s`, `${prefix}س`, `${prefix}S`, `${prefix}Skip`],
      volume: [`${prefix}volume`, `${prefix}vol`, `${prefix}صوت`, `${prefix}v`, `${prefix}ص`,`${prefix}V`,`${prefix}Vol`,`${prefix}Volume`],
      nowplaying: [`${prefix}nowplaying`, `${prefix}np`,`${prefix}Np`,`${prefix}Nowplaying`,`${prefix}الشغال`,`${prefix}الان`],
      loop: [`${prefix}loop`, `${prefix}تكرار`, `${prefix}l`,`${prefix}L`,`${prefix}Loop`],
      pause: [`${prefix}pause`, `${prefix}توقيف`, `${prefix}كمل`, `${prefix}pa`,`${prefix}Pa`,`${prefix}Pause`],
      seek: [`${prefix}seek`,`${prefix}Seek`,`${prefix}قدم`,`${prefix}se`,`${prefix}Se`],
      forward: [`${prefix}forward`,`${prefix}Forward`,`${prefix}تقديم`,`${prefix}fo`,`${prefix}Fo`],
      autoplay: [`${prefix}autoplay`,`${prefix}Autoplay`,`${prefix}Ap`,`${prefix}ap`],
      queue: [`${prefix}queue`, `${prefix}قائمة`, `${prefix}اغاني`, `${prefix}q`, `${prefix}qu`,`${prefix}Q`,`${prefix}Qu`,`${prefix}Queue`],
  };

    if (cmdsArray.play.some((cmd) => message.content.split(' ')[0] == cmd)) {
      let song = message.content.split(' ').slice(1).join(' ')
      if (song) {
        if (useEmbeds) {
          const embed = new MessageEmbed()
          .setColor(emco) 
            .setDescription(`***ϟ سوف يتم بدء التشغيل.....***`);
          message.reply({ embeds: [embed] }).then(async (msg) => {
            await client83883.music.play(message.member.voice.channel, String(await convert(song) || song), {
              member: message.member,
              textChannel: message.channel,
              metadata: { msg },
              message
            });
          }).catch(() => 0)
        } else {
          message.reply(`_ϟ سوف يتم بدء التشغيل....._`).then(async (msg) => {
            await client83883.music.play(message.member.voice.channel, String(await convert(song) || song), {
              member: message.member,
              textChannel: message.channel,
              metadata: { msg },
              message
            });
          }).catch(() => 0)
        }
      } else {
        if (useEmbeds) {
          const embed = new MessageEmbed()
          .setAuthor("اوامر التشغيل:")
            .setDescription(`***\`play [ title ]\` :** plays first result from **YouTube***.\n***\`play [URL]\` :** searches **YouTube, Spotify**, **SoundCloud***.`)
            .setColor(emco)
          message.reply({ embeds: [embed] }).catch(() => 0);
        } else {
          message.reply(`*Play command usage:*\n***play [ title ] :** plays first result from **YouTube***.\n***play [URL]:** searches **YouTube, Spotify**, **SoundCloud***.`).catch(() => 0);
        }
      }
    }  else if (cmdsArray.seek.some((cmd) => message.content.split(" ")[0] == cmd)) {
      let args = message.content.split(" ");
      const queue = client83883.music.getQueue(message);
      if (!queue) {
        if (useEmbeds) {
          const embed = new MessageEmbed()
            .setDescription(`**🎶 يجب ان تكون اغنيه مشغله لاتسخدام هذا الامر!**`)
            .setThumbnail("https://media.discordapp.net/attachments/748831290244988940/1326450736061481062/IMG_6103.png?ex=677f7903&is=677e2783&hm=ddf0be75aee6096ab89668048ea674110118d34c964eb983dc3a957f9e59e6b4&=&format=webp&quality=lossless&width=437&height=437")
            .setColor(emco);
          message.channel.send({ embeds: [embed] }).catch(() => 0);
        } else {
          message.channel.send(`🎶 There must be music playing to use that!`).catch(() => 0);
        }
      } else {
        const seconds = convertTimeToSeconds("10s");
        const time = parseInt(seconds);
        if (isNaN(time) || time === 0) {
          if (useEmbeds) {
            const embed = new MessageEmbed()
              .setDescription(`**❌ Invalid time provided!**`)
              .setColor(emco);
            message.channel.send({ embeds: [embed] }).catch(() => 0);
          } else {
            message.channel.send(`❌ Invalid time provided!`).catch(() => 0);
          }
          return;
        }
        queue.seek(queue.currentTime + time);
        if (useEmbeds) {
          const embed = new MessageEmbed()
            .setDescription(`_Songs skipped :_ **${time}s**`)
            .setThumbnail("https://cdn.discordapp.com/attachments/1161286178822176858/1205555936727539713/emoji.png?ex=65d8cc75&is=65c65775&hm=5c1ddf1e6f50a0ef35e378c8c8086f7e4ebae5661a536d3d7ff3c821bc53e6ea&")
            .setColor(emco);
          message.channel.send({ embeds: [embed] }).catch(() => 0);
        } else {
          message.channel.send(`_Songs skipped :_ **${time}s**`).catch(() => 0);
        }
      }
    } else if (cmdsArray.forward.some((cmd) => message.content.split(" ")[0] == cmd)) {
      let args = message.content.split(" ");
      const queue = client83883.music.getQueue(message);
    
      if (!queue) {
        if (useEmbeds) {
          const embed = new MessageEmbed()
            .setDescription(`**🎶 There must be music playing to use that!**`)
            .setThumbnail("https://media.discordapp.net/attachments/748831290244988940/1326450736061481062/IMG_6103.png?ex=677f7903&is=677e2783&hm=ddf0be75aee6096ab89668048ea674110118d34c964eb983dc3a957f9e59e6b4&=&format=webp&quality=lossless&width=437&height=437")
            .setColor(emco);
          message.channel.send({ embeds: [embed] }).catch(() => 0);
        } else {
          message.channel.send(`🎶 There must be music playing to use that!`).catch(() => 0);
        }
      } else {
        if (!args[1]) {
          if (useEmbeds) {
            const embed = new MessageEmbed()
              .setDescription(`> Please type the number of seconds you want to seek forward`)
              .setColor(emco);
            message.channel.send({ embeds: [embed] }).catch(() => 0);
          } else {
            message.channel.send(`> Please type the number of seconds you want to seek forward`).catch(() => 0);
          }
          return;
        }
    
        const seconds = convertTimeToSeconds(args[1]);
        const time = parseInt(seconds);
    
        if (isNaN(time) || time === 0) {
          if (useEmbeds) {
            const embed = new MessageEmbed()
              .setDescription(`🚫 Attach a valid number!`)
              .setColor(emco);
            message.reply({ embeds: [embed] }).catch(() => 0);
          } else {
            message.reply(`🚫 Attach a valid number!`).catch(() => 0);
          }
          return;
        }
    
        queue.seek(queue.currentTime + time);
    
        const formattedTime = formatTime(queue.currentTime + time);
        const description = `_Song time :_ **${formatTime(queue.currentTime + time)}**`;
    
        if (useEmbeds) {
          const embed = new MessageEmbed()
            .setDescription(description)
            .setThumbnail("https://cdn.discordapp.com/attachments/1161286178822176858/1205556141032214618/111.png?ex=65d8cca6&is=65c657a6&hm=44e2be2c07211ae17c441738b34edecb7a090a411b30da2283c4712fe7131dea&")
            .setColor(emco);
          message.channel.send({ embeds: [embed] }).catch(() => 0);
        } else {
          message.channel.send(description).catch(() => 0);
        }
      }

      function formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.round(seconds % 60);
      
        return `${hours < 10 ? '0' : ''}${hours}:${minutes < 10 ? '0' : ''}${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
      }
      
    } else if (cmdsArray.autoplay.some((cmd) => message.content.split(" ")[0] == cmd)) {
      const queue = client83883.music.getQueue(message);
    
      if (!queue) {
        if (useEmbeds) {
          const embed = new MessageEmbed()
            .setDescription(`**🎶 There must be music playing to use that!**`)
            .setThumbnail("https://media.discordapp.net/attachments/748831290244988940/1326450736061481062/IMG_6103.png?ex=677f7903&is=677e2783&hm=ddf0be75aee6096ab89668048ea674110118d34c964eb983dc3a957f9e59e6b4&=&format=webp&quality=lossless&width=437&height=437")
            .setColor(emco);
          message.channel.send({ embeds: [embed] }).catch(() => 0);
        } else {
          message.channel.send(`🎶 There must be music playing to use that!`).catch(() => 0);
        }
      } else {
        const autoplay = queue.toggleAutoplay();
    
        if (useEmbeds) {
          const embed = new MessageEmbed()
            .setDescription(`_Autoplay mode set to :_ ${autoplay == 1 ? "**ON**" : "**OFF**"}`)
            .setThumbnail("https://cdn.discordapp.com/attachments/1161286178822176858/1205556345647136920/waweda.png?ex=65d8ccd6&is=65c657d6&hm=64aa4bf559a31866f3c593be48603afc717a741b24b181d284fc5ce6a183848e&")
            .setColor(emco);
          message.reply({ embeds: [embed] }).catch(() => 0);
        } else {
          message.reply(`_Autoplay mode set to :_ ${autoplay == 1 ? "**ON**" : "**OFF**"}`).catch(() => 0);
        }
      }
    }
    
  
  
    else if (cmdsArray.stop.some((cmd) => message.content.split(' ')[0] == cmd)) {
      const queue = client83883.music.getQueue(message);
      if (!queue) {
        if (useEmbeds) {
          const embed = new MessageEmbed()
            .setDescription(`**🎶 There must be music playing to use that!**`)
            .setColor(emco) 
            .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1169712150130995220/no.png?ex=65566654&is=6543f154&hm=b95ef265828fafc88f4adc56d7ba9f07d44557c4ce8796c790313d889040eafb&")     
          message.channel.send({ embeds: [embed] }).catch(() => 0);
        } else {
          message.channel.send(`🎶 There must be music playing to use that!`).catch(() => 0);
        }
      } else {
        queue.stop();
      }
      
      if (useEmbeds) {
        const embed = new MessageEmbed()
          .setDescription("**ϟ Songs Has Been :** ***Stopped***")
          .setColor(emco) 
          .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1169710999268491325/NowPlaying.png?ex=65566542&is=6543f042&hm=00a5c0c58c2c36e143b5b778cc3681aea08c75b8458c413133a490343197ec7b&");  
        message.reply({ embeds: [embed] }).catch(() => 0);
      } else {
        message.reply("ϟ **Stopped music, and the queue has been cleared**").catch(() => 0);
      }
    } else if (cmdsArray.loop.some((cmd) => message.content.split(' ')[0] == cmd)) {
      const queue = client83883.music.getQueue(message);
      if (!queue) {
        if (useEmbeds) {
          const embed = new MessageEmbed()
          .setDescription(`**🎶 There must be music playing to use that!**`)
          .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1169712150130995220/no.png?ex=65566654&is=6543f154&hm=b95ef265828fafc88f4adc56d7ba9f07d44557c4ce8796c790313d889040eafb&")    
          .setColor(emco)
          message.channel.send({ embeds: [embed] }).catch(() => 0);
        } else {
          message.channel.send(`🎶 There must be music playing to use that!`).catch(() => 0);
        }
      } else {
        const autoplay = queue.setRepeatMode(queue.repeatMode == 1 ? 0 : 1);
        if (useEmbeds) {
          const embed = new MessageEmbed()
            .setDescription(`_Repeat mode set to :_ ${autoplay == 1 ? "**ON ..**" : "**OFF ..**"}`)
            .setThumbnail("https://cdn.discordapp.com/attachments/1161286178822176858/1205556753752789043/Untitled-1.png?ex=65d8cd38&is=65c65838&hm=29f9c403050d6f24f661f21a34fd1604be145afdb38e181610c9685d1c6b72ff&")
            .setColor(emco)  
          message.reply({ embeds: [embed] }).catch(() => 0);
        } else {
          message.reply(`_Repeat mode set to :_ ${autoplay == 1 ? "**ON ..**" : "**OFF ..**"}`).catch(() => 0);
        }
      }
      
    } else if (cmdsArray.pause.some((cmd) => message.content.split(' ')[0] == cmd)) {
      const queue = client83883.music.getQueue(message);
      if (!queue) {
        if (useEmbeds) {
          const embed = new MessageEmbed()
          .setDescription(`**🎶 There must be music playing to use that!**`)
          .setColor(emco) 
          .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1169712150130995220/no.png?ex=65566654&is=6543f154&hm=b95ef265828fafc88f4adc56d7ba9f07d44557c4ce8796c790313d889040eafb&")     
          message.channel.send({ embeds: [embed] }).catch(() => 0);
        } else {
          message.channel.send(`🎶 There must be music playing to use that!`).catch(() => 0);
        }
      } else {
        if (queue.paused) {
          queue.resume();
          message.react("▶️").catch(() => 0);
        } else {
          queue.pause();
          message.react("⏸️").catch(() => 0);
        }
      }    
    } else if (cmdsArray.nowplaying.some((cmd) => message.content.split(' ')[0] == cmd)) {
      const queue = client83883.music.getQueue(message);
      if (!queue) {
        if (useEmbeds) {
          const embed = new MessageEmbed()
          .setDescription(`**🎶 There must be music playing to use that!**`)
          .setColor(emco)  
          .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1169712150130995220/no.png?ex=65566654&is=6543f154&hm=b95ef265828fafc88f4adc56d7ba9f07d44557c4ce8796c790313d889040eafb&")     
          message.channel.send({ embeds: [embed] }).catch(() => 0);
        } else {
          message.channel.send(`🎶 There must be music playing to use that!`).catch(() => 0);
        }
      } else {
        const song = queue.songs[0];
        const embed = new MessageEmbed()
          .setAuthor('Playing now', client83883.user.displayAvatarURL({ dynamic: true }))
          .setColor(emco) 
          .setDescription(`**[${song.name}](${song.url})**`)
          .setThumbnail(song.thumbnail)
          .setFooter(message.author.username, message.author.avatarURL());
        message.channel.send({ embeds: [embed] }).catch(() => 0);
      }    
    } else if (cmdsArray.volume.some((cmd) => message.content.split(' ')[0] == cmd)) {
  const args = message.content.split(' ');
  const queue = client83883.music.getQueue(message);
  if (!queue) {
    if (useEmbeds) {
      const embed = new MessageEmbed()
      .setDescription(`**🎶 There must be music playing to use that!**`)
      .setColor(emco) 
      .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1169712150130995220/no.png?ex=65566654&is=6543f154&hm=b95ef265828fafc88f4adc56d7ba9f07d44557c4ce8796c790313d889040eafb&")     
      message.reply({ embeds: [embed] }).catch(() => 0);
    } else {
      message.reply(`🎶 There must be music playing to use that!`).catch(() => 0);
    }
  } else {
    if (!args[1]) {
      if (useEmbeds) {
        const embed = new MessageEmbed()
          .setDescription(`_🔊 Current volume is :_ **${queue?.volume}**`)
          .setColor(emco) 
          .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1170057890506223647/4f4b99efc0371.png?ex=6557a853&is=65453353&hm=40e45c153b144474c1ca95c2854f3f21933cc20c1d2abc1f0ec1e8945da812ea&")    
        message.reply({ embeds: [embed] }).catch(() => 0);
      } else {
        message.reply(`_🔊 Current volume is :_ **${queue?.volume}**`).catch(() => 0);
      }
    } else {
      const volume = parseInt(args[1]);
      if (isNaN(volume) || volume > 150 || volume < 0) {
        if (useEmbeds) {
          const embed = new MessageEmbed()
            .setDescription(`🚫 Volume must be a valid integer between 0 and 150!`)
            .setColor(emco) 
            .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1169712150130995220/no.png?ex=65566654&is=6543f154&hm=b95ef265828fafc88f4adc56d7ba9f07d44557c4ce8796c790313d889040eafb&")   
          message.channel.send({ embeds: [embed] }).catch(() => 0);
        } else {
          message.channel.send(`🚫 Volume must be a valid integer between 0 and 150!`).catch(() => 0);
        }
      } else {
        client83883.lastVolume = volume;
        queue.setVolume(volume);
        if (useEmbeds) {
          const embed = new MessageEmbed()
            .setDescription(`***ϟ Volume changed from \`${volume}%\` .***`)
            .setColor(emco) 
            .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1170057890506223647/4f4b99efc0371.png?ex=6557a853&is=65453353&hm=40e45c153b144474c1ca95c2854f3f21933cc20c1d2abc1f0ec1e8945da812ea&");   
          message.reply({ embeds: [embed] }).catch(() => 0);
        } else {
          message.reply(`*ϟ Volume changed from **\`${volume}%\`** .*`).catch(() => 0);
        }
      }
    }
  }
    } else if (cmdsArray.skip.some((cmd) => message.content.split(' ')[0] == cmd)) {
      const queue = client83883.music.getQueue(message);
      if (!queue) return message.reply(`🎶 There must be music playing to use that!`).catch(() => 0);
      try {
        const song = await queue.skip();
        if (useEmbeds) {
          const embed = new MessageEmbed()
            .setDescription(`***ϟ Skipped ${song.name}***`)
            .setColor(emco)
            .setThumbnail("https://cdn.discordapp.com/attachments/1161286178822176858/1205556141032214618/111.png?ex=65d8cca6&is=65c657a6&hm=44e2be2c07211ae17c441738b34edecb7a090a411b30da2283c4712fe7131dea&");
          message.channel.send({ embeds: [embed] }).catch(() => 0);
        } else {
          message.channel.send(`_skipped, the next song is :_ **${song.name}**`).catch(() => 0);
        }
      } catch (e) {
        if (`${e}`.includes("NO_UP_NEXT")) {
          await queue.stop().catch(() => 0);
          message.react(`✅`).catch(() => 0);
        } else {
          if (useEmbeds) {
            const embed = new MessageEmbed()
              .setColor(emco)
              .setDescription(`***ϟ Error ${song.name}***`);
            message.channel.send({ embeds: [embed] }).catch(() => 0);
          } else {
            message.channel.send(`***ϟ Error ${song.name}***`).catch(() => 0);
          }
        }
      }
    } if (cmdsArray.queue.some((cmd) => message.content.split(' ')[0] == cmd)) {
      const queue = client83883.music.getQueue(message);
      if (!queue) {
        if (useEmbeds) {
          const embed = new MessageEmbed()
          .setDescription(`**🎶 There must be music playing to use that!**`)
          .setThumbnail("https://cdn.discordapp.com/attachments/1091536665912299530/1169712150130995220/no.png?ex=65566654&is=6543f154&hm=b95ef265828fafc88f4adc56d7ba9f07d44557c4ce8796c790313d889040eafb&")
          .setColor(emco)   
          message.reply({ embeds: [embed] }).catch(() => 0);
        } else {
          message.reply(`🎶 There must be music playing to use that!`).catch(() => 0);
        }
        return;
      }
    
      const songNames = queue.songs.map((song, index) => `\`${index + 1}\`. ${song.name}`).join('\n');
    
    
      if (useEmbeds) {
        const embed = new MessageEmbed()
        .setAuthor(`ϟ Total songs :  ( ${queue.songs.length} )`)
          .setDescription(`*Now playing :* \n${songNames}`)
          .setThumbnail("https://cdn.discordapp.com/attachments/1161286178822176858/1205557078890905610/ddddd.png?ex=65d8cd85&is=65c65885&hm=c45afc56ea3abbc91d3cac1215ec2698e45a5727f5fa5ad9e958b1a8e3c87bef&")
          .setColor(emco)
          .setFooter({ text: `${client83883.user.username}`, iconURL: `${client83883.user.displayAvatarURL({ dynamic: true })}` });
        message.channel.send({ embeds: [embed] }).catch(() => 0);
      } else {
        const embed = new MessageEmbed()
        .setAuthor(`ϟ Total songs :  ( ${queue.songs.length} )`)
          .setDescription(`*Now playing :* \n${songNames}`)
          .setThumbnail("https://cdn.discordapp.com/attachments/1161286178822176858/1205557078890905610/ddddd.png?ex=65d8cd85&is=65c65885&hm=c45afc56ea3abbc91d3cac1215ec2698e45a5727f5fa5ad9e958b1a8e3c87bef&")
          .setColor(emco)
          .setFooter({ text: `${client83883.user.username}`, iconURL: `${client83883.user.displayAvatarURL({ dynamic: true })}` });
        message.channel.send({ embeds: [embed] }).catch(() => 0);      } 
    }
    
  });
  try {
    await client83883.login(token);
  } catch (e) {
    console.log(`❌ > ${token} ${e}`);
  }
};




process.on("uncaughtException", console.log);
process.on("unhandledRejection", console.log);
process.on("rejectionHandled", console.log);

