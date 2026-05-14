const fetch = require('node-fetch');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;
const GIST_API = `https://api.github.com/gists/${GIST_ID}`;

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    try {
        const gistRes = await fetch(GIST_API, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        const gist = await gistRes.json();
        const db = JSON.parse(gist.files['database.json'].content);
        
        // Ambil user online (status != idle)
        const onlineUsers = Object.entries(db.users)
            .filter(([_, user]) => user.status !== 'idle')
            .map(([id, user]) => ({
                id: id,
                username: user.username,
                status: user.status
            }));
        
        // Hitung user aktif hari ini
        const today = new Date().toISOString().split('T')[0];
        const activeToday = Object.values(db.users).filter(user => 
            user.joinedAt?.startsWith(today)
        ).length;
        
        res.status(200).json({
            success: true,
            data: {
                totalUsers: db.stats.totalUsers || 0,
                totalMessages: db.stats.totalMessages || 0,
                totalPairs: db.stats.totalPairs || 0,
                queueLength: db.queue?.length || 0,
                activeToday: activeToday,
                onlineUsers: onlineUsers
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
