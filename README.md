# 🤖 Anonymous Telegram Bot

Bot Telegram anonymous chat user-to-user. Wajib join channel @LeguminY.

## 🚀 Deploy ke Vercel

1. **Fork repo ini ke GitHub kamu**
2. **Buka [Vercel](https://vercel.com) & import repo**
3. **Setting Environment Variables:**
   - `BOT_TOKEN` = Token dari @BotFather
   - `GITHUB_TOKEN` = Personal Access Token GitHub
   - `GIST_ID` = ID Gist untuk database
4. **Deploy!**

## 📦 Setup Database Gist

1. Buka [gist.github.com](https://gist.github.com)
2. Buat gist baru dengan file `database.json`
3. Isi dengan:
```json
{"users":{},"pairs":{},"stats":{"totalMessages":0,"totalPairs":0,"totalUsers":0},"queue":[]}
