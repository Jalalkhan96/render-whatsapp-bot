const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const MODELS = {
  textImage: process.env.HF_TEXT_IMAGE_MODEL || 'stabilityai/stable-diffusion-xl-base-1.0',
  imageImage: process.env.HF_IMAGE_IMAGE_MODEL || 'lllyasviel/sd-controlnet-canny',
  textVideo: process.env.HF_TEXT_VIDEO_MODEL || 'Wan-AI/Wan2.1-T2V-14B',
  imageVideo: process.env.HF_IMAGE_VIDEO_MODEL || 'Wan-AI/Wan2.1-I2V-14B-480P'
};

async function infer(model, inputs, parameters = {}) {
  if (!process.env.HF_TOKEN) throw new Error('HF_TOKEN missing hai. sample.env se token set karke bot restart karein.');
  const response = await axios.post(`https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`, {
    inputs,
    parameters
  }, {
    responseType: 'arraybuffer',
    timeout: 180000,
    headers: {
      Authorization: `Bearer ${process.env.HF_TOKEN}`,
      Accept: 'image/*,video/*,application/json'
    },
    validateStatus: () => true
  });
  const contentType = response.headers['content-type'] || '';
  if (response.status >= 400 || contentType.includes('application/json')) {
    let detail = Buffer.from(response.data).toString('utf8');
    try { detail = JSON.parse(detail).error || JSON.parse(detail).message || detail; } catch {}
    throw new Error(String(detail).slice(0, 300));
  }
  return { buffer: Buffer.from(response.data), contentType };
}

async function imageInput(message, url) {
  if (url) {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(response.data).toString('base64');
  }
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const imageMessage = quoted?.imageMessage || message.message?.imageMessage;
  if (!imageMessage) return null;
  const stream = await downloadContentFromMessage(imageMessage, 'image');
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('base64');
}

module.exports = { MODELS, infer, imageInput };
