const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../database/neko_groups.json');
const gifFilePath = path.join(__dirname, '../database/nekogif_groups.json');

function ensureDir() {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getGroups() {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading neko_groups.json', err);
  }
  return [];
}

function saveGroups(groups) {
  try {
    ensureDir();
    fs.writeFileSync(filePath, JSON.stringify(groups, null, 2));
  } catch (err) {
    console.error('Error saving neko_groups.json', err);
  }
}

function isGroupEnabled(chatId) {
  return getGroups().includes(chatId);
}

function enableGroup(chatId) {
  const groups = getGroups();
  if (!groups.includes(chatId)) {
    groups.push(chatId);
    saveGroups(groups);
    return true;
  }
  return false;
}

function disableGroup(chatId) {
  const groups = getGroups();
  const index = groups.indexOf(chatId);
  if (index > -1) {
    groups.splice(index, 1);
    saveGroups(groups);
    return true;
  }
  return false;
}

function getGifGroups() {
  try {
    if (fs.existsSync(gifFilePath)) {
      return JSON.parse(fs.readFileSync(gifFilePath, 'utf8'));
    }
  } catch (err) {}
  return [];
}
function saveGifGroups(groups) {
  try {
    ensureDir();
    fs.writeFileSync(gifFilePath, JSON.stringify(groups, null, 2));
  } catch (err) {}
}

function isGifGroupEnabled(chatId) {
  return getGifGroups().includes(chatId);
}
function enableGifGroup(chatId) {
  const groups = getGifGroups();
  if (!groups.includes(chatId)) {
    groups.push(chatId);
    saveGifGroups(groups);
    return true;
  }
  return false;
}
function disableGifGroup(chatId) {
  const groups = getGifGroups();
  const index = groups.indexOf(chatId);
  if (index > -1) {
    groups.splice(index, 1);
    saveGifGroups(groups);
    return true;
  }
  return false;
}

module.exports = { 
  isGroupEnabled, enableGroup, disableGroup,
  isGifGroupEnabled, enableGifGroup, disableGifGroup
};
