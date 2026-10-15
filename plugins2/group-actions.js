const legacy = {
  kick: require('../plugins/kick'),
  ban: require('../plugins/ban'),
  unban: require('../plugins/unban'),
  mute: require('../plugins/mute'),
  unmute: require('../plugins/unmute'),
};
module.exports = Object.values(legacy).map((plugin) => ({
  ...plugin,
  category: 'moderation',
  aliases: Array.isArray(plugin.aliases) ? plugin.aliases : [],
}));
