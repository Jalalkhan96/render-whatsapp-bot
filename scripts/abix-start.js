'use strict';

/**
 * Abix-safe startup wrapper.
 *
 * Purpose:
 *   1. Fail early with a useful message when npm dependencies are missing.
 *   2. Verify the Baileys/Sharp media stack used by this build.
 *   3. Verify the main entrypoint before launching the real bot.
 *   4. Avoid silently starting a partially-installed bot after npm ERESOLVE.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PKG = require(path.join(ROOT, 'package.json'));

function log(icon, message) {
  console.log(`${icon} ${message}`);
}

function fail(message) {
  console.error(`\n❌ [ABIX PREFLIGHT] ${message}\n`);
  process.exit(1);
}

function versionOf(name) {
  try {
    const pkg = require(`${name}/package.json`);
    return pkg.version;
  } catch (_) {
    return null;
  }
}

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(major) || major < 20) {
    fail(`Node.js ${process.versions.node} detected. This bot requires Node.js 20+.`);
  }
  log('✅', `Node.js ${process.versions.node}`);
}

function checkNpmrc() {
  const npmrc = path.join(ROOT, '.npmrc');
  if (!fs.existsSync(npmrc)) {
    fail('.npmrc is missing. Abix needs legacy-peer-deps=true for the Baileys/Jimp dependency tree.');
  }
  const contents = fs.readFileSync(npmrc, 'utf8');
  log('✅', '.npmrc detected');
}

function checkFiles() {
  for (const relative of ['package.json', 'index.js', 'config.js', 'lib/myfunc.js']) {
    if (!fs.existsSync(path.join(ROOT, relative))) {
      fail(`Required file is missing: ${relative}`);
    }
  }
  log('✅', 'Core project files present');
}

function checkDependencies() {
  const baileys = versionOf('@whiskeysockets/baileys');
  const sharp = versionOf('sharp');
  if (!baileys) fail('Baileys is not installed. Check the npm installation log.');
  if (!sharp) fail('Sharp is not installed. Image rendering/stickers require Sharp.');

  log('✅', `Baileys installed: ${baileys} (package.json: ${PKG.dependencies['@whiskeysockets/baileys']})`);
  log('✅', `Sharp installed: ${sharp} (package.json: ${PKG.dependencies.sharp})`);

  try { require('@whiskeysockets/baileys'); }
  catch (error) { fail(`Baileys cannot be loaded: ${error.message}`); }
  try { require('sharp'); }
  catch (error) { fail(`Sharp cannot be loaded: ${error.message}`); }
  log('✅', 'Baileys and Sharp load successfully');
}

function checkEnvironment() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    log('⚠️', 'No .env file found. This is allowed if Abix injects environment variables.');
    return;
  }
  log('✅', '.env file detected');
}

function startBot() {
  log('🚀', 'Starting ABIX-AE...');

  const child = spawn(process.execPath, [path.join(ROOT, 'index.js')], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit'
  });

  child.on('error', (error) => {
    console.error(`❌ Failed to launch index.js: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`⚠️ Bot stopped by signal ${signal}`);
      process.exit(1);
    }
    process.exit(code === null ? 1 : code);
  });
}

checkNode();
checkNpmrc();
checkFiles();
checkEnvironment();
checkDependencies();
startBot();
