const fetch = require('node-fetch');

// ==================== KONFIGURASI ====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const GIST_API = `https://api.github.com/gists/${GIST_ID}`;
const CHANNEL_USERNAME = '@LeguminY';
const CHANNEL_ID = '@LeguminY'; // Ganti dengan ID channel jika perlu

// ==================== DATABASE GIST ====================
async function getDB() {
    const res = await fetch(GIST_API, {
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });
    const gist = await res.json();
    const db = JSON.parse(gist.files['database.json'].content);
    return db;
}

async function saveDB(db) {
    await fetch(GIST_API, {
        method: 'PATCH',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            files: {
                'database.json': {
                    content: JSON.stringify(db, null, 2)
                }
            }
        })
    });
}

function initDB() {
    return {
        users: {},           // { userId: { username, joinedAt, status, pairedWith, ... } }
        pairs: {},           // { pairId: { user1, user2, createdAt, messages } }
        stats: {
            totalMessages: 0,
            totalPairs: 0,
            totalUsers: 0
        },
        queue: []            // User yang lagi nyari pasangan
    };
}

// ==================== HELPER FUNCTIONS ====================
async function sendMessage(chatId, text, replyMarkup = null) {
    const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
    };
    if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
    
    await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

async function sendPhoto(chatId, photoUrl, caption = '', replyMarkup = null) {
    const payload = {
        chat_id: chatId,
        photo: photoUrl,
        caption: caption,
        parse_mode: 'HTML'
    };
    if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
    
    await fetch(`${TELEGRAM_API}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

async function sendDocument(chatId, document, caption = '', replyMarkup = null) {
    const payload = {
        chat_id: chatId,
        document: document,
        caption: caption,
        parse_mode: 'HTML'
    };
    if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
    
    await fetch(`${TELEGRAM_API}/sendDocument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

async function checkChannelMembership(userId) {
    try {
        const res = await fetch(`${TELEGRAM_API}/getChatMember`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHANNEL_ID,
                user_id: userId
            })
        });
        const data = await res.json();
        const status = data.result?.status;
        return ['creator', 'administrator', 'member'].includes(status);
    } catch (error) {
        return false;
    }
}

async function uploadToCatbox(fileUrl) {
    try {
        const res = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `reqtype=urlupload&url=${encodeURIComponent(fileUrl)}`
        });
        return await res.text();
    } catch (error) {
        return null;
    }
}

// ==================== BOT COMMANDS ====================
async function handleStart(msg) {
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    const db = await getDB();
    
    // Register user jika belum ada
    if (!db.users[userId]) {
        db.users[userId] = {
            username: username,
            joinedAt: new Date().toISOString(),
            status: 'idle',
            pairedWith: null,
            totalChats: 0
        };
        db.stats.totalUsers++;
        await saveDB(db);
    }
    
    // Cek membership
    const isMember = await checkChannelMembership(userId);
    
    if (!isMember) {
        const keyboard = {
            inline_keyboard: [
                [{ text: '📢 JOIN @LeguminY', url: 'https://t.me/LeguminY' }],
                [{ text: '🔄 Cek Ulang', callback_data: 'check_member' }]
            ]
        };
        await sendMessage(msg.chat.id, 
            `⚠️ <b>AKSES DITOLAK!</b>\n\n` +
            `Kamu <b>wajib join</b> channel kami dulu:\n` +
            `📢 <b>@LeguminY</b>\n\n` +
            `Setelah join, klik tombol <b>Cek Ulang</b> di bawah 👇`,
            keyboard
        );
        return;
    }
    
    // User sudah join channel
    const mainKeyboard = {
        inline_keyboard: [
            [
                { text: '🔍 Cari Partner', callback_data: 'find_partner' },
                { text: '📊 Stats', callback_data: 'stats' }
            ],
            [
                { text: '📋 Rules', callback_data: 'rules' },
                { text: 'ℹ️ Help', callback_data: 'help' }
            ]
        ]
    };
    
    await sendMessage(msg.chat.id,
        `✅ <b>SELAMAT DATANG!</b>\n\n` +
        `Hai <b>${username}</b>! Kamu sudah terverifikasi.\n\n` +
        `🔹 <b>Anonymous Chat</b> — Kirim pesan rahasia ke orang random\n` +
        `🔹 <b>100% Anonymous</b> — Identitasmu dirahasiakan\n` +
        `🔹 <b>Random Pairing</b> — Otomatis cari teman baru\n\n` +
        `👇 Pilih menu di bawah untuk mulai:`,
        mainKeyboard
    );
}

async function handleFindPartner(msg, userId) {
    const db = await getDB();
    const user = db.users[userId];
    
    // Cek apakah user sudah punya partner
    if (user.pairedWith) {
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '❌ Putuskan', callback_data: 'disconnect' },
                    { text: '⏭️ Skip', callback_data: 'skip_partner' }
                ]
            ]
        };
        await sendMessage(msg.chat.id,
            '⚠️ Kamu masih terhubung dengan seseorang!\n' +
            'Putuskan dulu untuk mencari partner baru.',
            keyboard
        );
        return;
    }
    
    // Cek queue
    if (db.queue.length > 0) {
        // Ada yang nunggu, pairing!
        const partnerId = db.queue.shift();
        const pairId = `pair_${Date.now()}`;
        
        db.users[userId].pairedWith = partnerId;
        db.users[userId].status = 'chatting';
        db.users[partnerId].pairedWith = userId;
        db.users[partnerId].status = 'chatting';
        
        db.pairs[pairId] = {
            user1: userId,
            user2: partnerId,
            createdAt: new Date().toISOString(),
            messages: []
        };
        
        db.stats.totalPairs++;
        
        await saveDB(db);
        
        // Notifikasi ke kedua user
        const chatKeyboard = {
            inline_keyboard: [
                [
                    { text: '⏭️ Skip', callback_data: 'skip_partner' },
                    { text: '❌ Stop', callback_data: 'disconnect' }
                ]
            ]
        };
        
        await sendMessage(userId,
            '🔗 <b>TERHUBUNG!</b>\n\n' +
            'Kamu terhubung dengan seseorang secara anonymous.\n' +
            'Ketik pesan untuk mulai chat!\n\n' +
            '📸 Bisa kirim foto juga lho!',
            chatKeyboard
        );
        
        await sendMessage(partnerId,
            '🔗 <b>TERHUBUNG!</b>\n\n' +
            'Seseorang ingin chat denganmu!\n' +
            'Ketik pesan untuk mulai chat!\n\n' +
            '📸 Bisa kirim foto juga lho!',
            chatKeyboard
        );
        
    } else {
        // Masuk queue
        db.queue.push(userId);
        db.users[userId].status = 'searching';
        await saveDB(db);
        
        const keyboard = {
            inline_keyboard: [
                [{ text: '❌ Batal Mencari', callback_data: 'cancel_search' }]
            ]
        };
        
        await sendMessage(msg.chat.id,
            '🔍 <b>MENCARI PARTNER...</b>\n\n' +
            'Tunggu sebentar ya, sedang dicarikan teman random.\n\n' +
            `📊 Queue saat ini: <b>${db.queue.length}</b> orang`,
            keyboard
        );
    }
}

async function handleMessage(msg) {
    const userId = msg.from.id;
    const db = await getDB();
    const user = db.users[userId];
    
    if (!user || !user.pairedWith) return;
    
    const partnerId = user.pairedWith;
    const pairId = Object.keys(db.pairs).find(id => {
        const pair = db.pairs[id];
        return (pair.user1 === userId && pair.user2 === partnerId) ||
               (pair.user1 === partnerId && pair.user2 === userId);
    });
    
    // Simpan pesan
    if (pairId) {
        db.pairs[pairId].messages.push({
            from: userId,
            timestamp: new Date().toISOString(),
            type: 'text'
        });
    }
    
    db.stats.totalMessages++;
    await saveDB(db);
    
    // Forward pesan ke partner (anonymous)
    if (msg.text) {
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '⏭️ Skip', callback_data: 'skip_partner' },
                    { text: '❌ Stop', callback_data: 'disconnect' }
                ]
            ]
        };
        await sendMessage(partnerId,
            `💌 <b>Pesan Anonymous:</b>\n\n<i>${msg.text}</i>`,
            keyboard
        );
    }
    
    // Handle foto
    if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
        const fileData = await fileRes.json();
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
        
        // Upload ke Catbox
        const catboxUrl = await uploadToCatbox(fileUrl);
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '⏭️ Skip', callback_data: 'skip_partner' },
                    { text: '❌ Stop', callback_data: 'disconnect' }
                ]
            ]
        };
        
        if (catboxUrl) {
            await sendPhoto(partnerId, catboxUrl,
                '📸 <b>Foto Anonymous</b>',
                keyboard
            );
        } else {
            await sendPhoto(partnerId, fileId,
                '📸 <b>Foto Anonymous</b>',
                keyboard
            );
        }
    }
    
    // Handle dokumen
    if (msg.document) {
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '⏭️ Skip', callback_data: 'skip_partner' },
                    { text: '❌ Stop', callback_data: 'disconnect' }
                ]
            ]
        };
        await sendDocument(partnerId, msg.document.file_id,
            '📁 <b>File Anonymous</b>',
            keyboard
        );
    }
}

async function handleDisconnect(userId) {
    const db = await getDB();
    const user = db.users[userId];
    
    if (!user || !user.pairedWith) return;
    
    const partnerId = user.pairedWith;
    
    // Hapus pairing
    user.pairedWith = null;
    user.status = 'idle';
    user.totalChats++;
    
    if (db.users[partnerId]) {
        db.users[partnerId].pairedWith = null;
        db.users[partnerId].status = 'idle';
        db.users[partnerId].totalChats++;
        
        await sendMessage(partnerId,
            '🔌 <b>PARTNER TELAH PERGI</b>\n\n' +
            'Partner kamu mengakhiri chat.\n' +
            'Ketik /find untuk mencari partner baru!',
            {
                inline_keyboard: [
                    [{ text: '🔍 Cari Partner Baru', callback_data: 'find_partner' }]
                ]
            }
        );
    }
    
    await saveDB(db);
    
    await sendMessage(userId,
        '✅ <b>CHAT BERAKHIR</b>\n\n' +
        'Kamu sudah tidak terhubung.\n' +
        'Ketik /find untuk mencari partner baru!',
        {
            inline_keyboard: [
                [{ text: '🔍 Cari Partner Baru', callback_data: 'find_partner' }]
            ]
        }
    );
}

async function handleSkip(userId) {
    await handleDisconnect(userId);
    // Langsung cari partner baru
    const db = await getDB();
    db.queue.push(userId);
    db.users[userId].status = 'searching';
    await saveDB(db);
}

async function handleCallback(callback) {
    const userId = callback.from.id;
    const data = callback.data;
    const msg = callback.message;
    
    switch(data) {
        case 'check_member':
            const isMember = await checkChannelMembership(userId);
            if (isMember) {
                await handleStart({ from: callback.from, chat: { id: msg.chat.id } });
            } else {
                await sendMessage(msg.chat.id, '⚠️ Kamu masih belum join @LeguminY!');
            }
            break;
            
        case 'find_partner':
            await handleFindPartner(msg, userId);
            break;
            
        case 'disconnect':
            await handleDisconnect(userId);
            break;
            
        case 'skip_partner':
            await handleSkip(userId);
            await sendMessage(msg.chat.id,
                '⏭️ <b>SKIP!</b>\n\nMencari partner baru...',
                {
                    inline_keyboard: [
                        [{ text: '❌ Batal', callback_data: 'cancel_search' }]
                    ]
                }
            );
            break;
            
        case 'cancel_search':
            const db = await getDB();
            db.queue = db.queue.filter(id => id !== userId);
            db.users[userId].status = 'idle';
            await saveDB(db);
            await sendMessage(msg.chat.id, '✅ Pencarian dibatalkan.');
            break;
            
        case 'stats':
            const statsDB = await getDB();
            await sendMessage(msg.chat.id,
                `📊 <b>STATISTIK BOT</b>\n\n` +
                `👥 Total User: <b>${statsDB.stats.totalUsers}</b>\n` +
                `💬 Total Chat: <b>${statsDB.stats.totalPairs}</b>\n` +
                `📨 Pesan: <b>${statsDB.stats.totalMessages}</b>\n` +
                `🔍 Mencari: <b>${statsDB.queue.length}</b>\n\n` +
                `📢 Channel: @LeguminY`
            );
            break;
            
        case 'rules':
            await sendMessage(msg.chat.id,
                `📋 <b>ATURAN PENGGUNAAN</b>\n\n` +
                `1. Dilarang spam\n` +
                `2. Dilarang kirim konten 18+\n` +
                `3. Hormati sesama user\n` +
                `4. Jangan share data pribadi\n` +
                `5. Laporkan penyalahgunaan\n\n` +
                `⚠️ Pelanggaran = Banned permanen!`
            );
            break;
            
        case 'help':
            await sendMessage(msg.chat.id,
                `ℹ️ <b>BANTUAN</b>\n\n` +
                `/start - Mulai bot\n` +
                `/find - Cari partner chat\n` +
                `/skip - Skip partner saat ini\n` +
                `/stop - Akhiri chat\n` +
                `/stats - Lihat statistik\n` +
                `/rules - Aturan main\n\n` +
                `📸 Kirim foto langsung untuk share ke partner!\n` +
                `📁 Kirim file untuk share dokumen!`
            );
            break;
    }
}

// ==================== MAIN HANDLER ====================
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(200).json({ status: 'OK', message: 'Bot is running!' });
    }
    
    const body = req.body;
    
    // Handle callback query
    if (body.callback_query) {
        await handleCallback(body.callback_query);
        return res.status(200).json({ status: 'OK' });
    }
    
    // Handle message
    if (body.message) {
        const msg = body.message;
        const text = msg.text || '';
        const userId = msg.from.id;
        
        // Initialize DB if needed
        try {
            await getDB();
        } catch {
            await saveDB(initDB());
        }
        
        // Commands
        if (text.startsWith('/start')) {
            await handleStart(msg);
        } else if (text.startsWith('/find')) {
            // Cek membership dulu
            const isMember = await checkChannelMembership(userId);
            if (!isMember) {
                await sendMessage(msg.chat.id,
                    '⚠️ Kamu harus join @LeguminY dulu!'
                );
            } else {
                await handleFindPartner(msg, userId);
            }
        } else if (text.startsWith('/skip')) {
            await handleSkip(userId);
        } else if (text.startsWith('/stop')) {
            await handleDisconnect(userId);
        } else if (text.startsWith('/stats')) {
            const db = await getDB();
            await sendMessage(msg.chat.id,
                `📊 <b>STATISTIK</b>\n\n` +
                `👥 Users: <b>${db.stats.totalUsers}</b>\n` +
                `💬 Chats: <b>${db.stats.totalPairs}</b>\n` +
                `📨 Messages: <b>${db.stats.totalMessages}</b>`
            );
        } else if (text.startsWith('/rules')) {
            await sendMessage(msg.chat.id,
                `📋 <b>RULES:</b>\n- No spam\n- No 18+\n- Be nice\n- @LeguminY`
            );
        } else if (msg.photo || msg.document || msg.text) {
            // Forward message
            await handleMessage(msg);
        }
    }
    
    res.status(200).json({ status: 'OK' });
};
