const legacy = {
  antilink: require('../plugins/antilink'),
  antitag: require('../plugins/antitag'),
  antibadword: require('../plugins/antibadword'),
};
module.exports = Object.values(legacy).map((plugin) => ({
  ...plugin,
  category: 'moderation',
  // Antitag was primary-owner-only in the legacy file; group moderation is
  // now consistent with the rest: configured owners or group admins.
  strictOwnerOnly: false,
  adminOnly: true,
}));
