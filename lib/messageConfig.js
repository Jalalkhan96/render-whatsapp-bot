const { getChannelInfo } = require('./channelInfo');

const channelInfo = getChannelInfo();

module.exports = {
    channelInfo: channelInfo
};
