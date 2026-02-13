# Discord 週間絵日記 Bot 📰🎨

Discordサーバーの過去1週間の会話を自動でまとめ、 **Gemini API** でサマリーを生成し、 **Nano Banana Pro** で絵日記風のイラストを生成して、指定チャンネルに投稿するBotです。

## 🌟 機能

- Botが所属する **全サーバーの全テキストチャンネル** から会話を収集
- **先週日曜12:00 〜 今週日曜12:00** の1週間分のメッセージを取得
- Botの投稿は **自動除外**（循環参照防止）
- **Gemini API** で週間まとめテキストを生成
- **Nano Banana Pro (Gemini 3 Pro Image)** で絵日記風のイラストを生成
- 指定チャンネルに **テキスト + 画像** をセットで投稿
- cron で **毎週日曜12:00** に自動実行

## 📁 プロジェクト構成

```
discord-weekly-enikki/
├── src/
│   ├── index.js          # メインエントリーポイント
│   ├── config.js         # 設定管理
│   ├── discord.js        # Discord会話取得・投稿
│   ├── summarizer.js     # Gemini APIでまとめ生成
│   └── imageGenerator.js # Nano Banana Proで画像生成
├── .env.example          # 環境変数テンプレート
├── .gitignore
├── package.json
└── README.md
```

## 🚀 セットアップ

### 1. Discord Botの作成

1. [Discord Developer Portal](https://discord.com/developers/applications) でアプリケーションを作成
2. Bot セクションで Bot を追加
3. 以下の **Privileged Gateway Intents** を有効にする:
   - **Message Content Intent** ✅
   - **Server Members Intent** ✅（任意）
4. Bot Token をコピー
5. OAuth2 > URL Generator で以下の権限でBotを招待:
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Attach Files`, `Read Message History`, `View Channels`

### 2. Gemini API キーの取得

1. [Google AI Studio](https://aistudio.google.com/apikey) で API キーを作成

### 3. 環境変数の設定

```bash
cp .env.example .env
```

`.env` ファイルを編集:

```env
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_TARGET_CHANNEL_ID=your_channel_id_here
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. 依存パッケージのインストール

```bash
npm install
```

### 5. 実行

```bash
npm start
```

## ⏰ cron設定（本番運用）

毎週日曜12:00（JST）に実行する場合:

```bash
crontab -e
```

以下を追加:

```cron
0 12 * * 0 cd /path/to/discord-weekly-enikki && /usr/bin/node src/index.js >> /var/log/discord-enikki.log 2>&1
```

## 🔧 設定オプション

| 環境変数 | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `DISCORD_BOT_TOKEN` | ✅ | - | Discord Bot トークン |
| `DISCORD_TARGET_CHANNEL_ID` | ✅ | - | まとめ投稿先チャンネルID |
| `GEMINI_API_KEY` | ✅ | - | Google Gemini API キー |
| `GEMINI_TEXT_MODEL` | ❌ | `gemini-2.5-flash` | テキスト要約モデル |
| `GEMINI_IMAGE_MODEL` | ❌ | `gemini-3-pro-image-preview` | 画像生成モデル |

## ⚠️ 注意事項

- Discord APIにはレート制限があります。大量のチャンネルがある場合、取得に時間がかかることがあります
- Gemini APIのトークン制限により、非常に大量のメッセージがある場合は一部が切り捨てられる可能性があります
- Nano Banana Pro のAPIはプレビュー版のため、モデル名が変更される可能性があります
- Bot の **Message Content Intent** が有効でないとメッセージ内容を取得できません
