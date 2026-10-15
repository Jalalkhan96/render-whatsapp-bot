const { WAMessageStubType } = require('@whiskeysockets/baileys')
const RESET = '\x1b[0m';
const style = (code) => {
    const fn = (value) => `${code}${value}${RESET}`;
    fn.bold = (value) => `\x1b[1m${code}${value}${RESET}`;
    return fn;
};
const chalk = {
    hex: () => style(''),
    cyan: style('\x1b[36m'),
    black: style('\x1b[30m'),
    bgCyan: style('\x1b[46m'),
    magenta: style('\x1b[35m'),
    gray: style('\x1b[90m'),
    green: style('\x1b[32m'),
    yellow: style('\x1b[33m'),
    white: style('\x1b[37m'),
    greenBright: style('\x1b[92m'),
    blue: style('\x1b[34m'),
    blueBright: style('\x1b[94m'),
    red: style('\x1b[31m')
};
const PhoneNumber = require('awesome-phonenumber')
const settings = require('../settings')

/**
 * Extract real phone number from various JID formats
 */
function extractPhoneNumber(jid) {
    if (!jid) return null
    
    let number = jid
        .replace('@s.whatsapp.net', '')
        .replace('@lid', '')
        .replace('@g.us', '')
        .split(':')[0]
    
    if (number.length < 10 && jid.includes('@lid')) {
        return null
    }
    
    return number
}

/**
 * Get name with fallback options
 */
async function getNameWithFallback(jid, sock, pushName) {
    try {
        if (pushName && pushName.trim()) {
            return pushName.trim()
        }

        if (sock.store?.contacts?.[jid]) {
            const contact = sock.store.contacts[jid]
            if (contact.name || contact.notify) {
                return contact.name || contact.notify
            }
        }

        const phone = extractPhoneNumber(jid)
        if (phone && phone.length >= 10) {
            const pn = PhoneNumber('+' + phone)
            if (pn.isValid()) {
                return null
            }
        }
        return jid.split('@')[0].split(':')[0]
        
    } catch (e) {
        return jid.split('@')[0].split(':')[0]
    }
}

async function printMessage() {}

/**
 * Simple colored logger for events
 */
function printLog(type, message) {
    const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false,
        timeZone: settings.timeZone || 'Asia/Karachi'
    })

    const colors = {
        info: chalk.blue,
        success: chalk.green,
        warning: chalk.yellow,
        error: chalk.red,
        connection: chalk.cyan,
        store: chalk.magenta
    }

    const icons = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        error: '❌',
        connection: '🔌',
        store: '🗄️'
    }

    const color = colors[type] || chalk.white
    const icon = icons[type] || '•'

    console.log(
        chalk.gray(`[${timestamp}]`) + ' ' +
        color(icon) + ' ' +
        color(message)
    )
}

module.exports = { printMessage, printLog };


