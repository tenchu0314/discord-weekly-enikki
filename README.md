# Discord 週間絵日記 Bot 📰🎨

Discordサーバーの過去1週間の会話を自動でまとめ、**Gemini API** でサマリーを生成し、**Nano Banana Pro** でイラストを生成して、指定チャンネルに投稿するBotです。

## 🌟 機能

- Botが所属する **全サーバーの全テキスト・フォーラムチャンネル** から会話を収集
- **先週日曜12:00 〜 今週日曜12:00** の1週間分のメッセージを取得
- Botの投稿は **自動除外**（循環参照防止）
- **Gemini API** で週間まとめテキストを生成
- まとめテキストから **画像生成用プロンプトを自動考案**（2段階生成）
- **Nano Banana Pro (Gemini 3 Pro Image)** でイラストを生成
- Gemini API呼び出しエラー時は **指数バックオフで自動リトライ（最大3時間）**
- **スタイル参照画像** による画風の統一
- **キャラクター参照画像** によるユーザーの見た目の統一
- 指定チャンネルに **テキスト + 画像** をセットで投稿
- cron で **毎週日曜12:00** に自動実行

## 📁 プロジェクト構成

```text
discord-weekly-enikki/
├── src/
│   ├── index.js          # メインエントリーポイント
│   ├── config.js         # 設定管理
│   ├── discord.js        # Discord会話取得・投稿
│   ├── summarizer.js     # Gemini APIでまとめ生成
│   ├── imageGenerator.js # Nano Banana Proで画像生成
│   └── retry.js          # Gemini API リトライ処理（指数バックオフ）
├── references/
│   ├── style.png         # スタイル参照画像（任意）
│   └── characters/       # キャラクター参照画像（任意）
│       ├── MEG.png
│       ├── yusuga.png
│       ├── おっちょこちょい.png
│       ├── にょーそくん.png
│       ├── ふぐ.png
│       └── リンカ.png
├── .env.example          # 環境変数テンプレート
├── .gitignore
├── package.json
└── README.md
```

## 🔄 処理フロー

```text
1. Discordにログイン
2. 全サーバー・全テキストチャンネルおよびフォーラムチャンネルから過去1週間のメッセージを収集
   - Bot投稿は除外
   - フォーラムはアクティブ・アーカイブ済みスレッドを両方対象
   - レート制限対策のウェイト付き
3. 会話ログをGemini API（テキストモデル）に送信し、週間まとめを生成
4. まとめテキストをGemini API（テキストモデル）に送信し、画像生成用の日本語プロンプトを考案
5. 考案されたプロンプト + 参照画像をNano Banana Pro（画像モデル）に送信し、イラストを生成
   - ステップ3〜5のGemini API呼び出しに失敗した場合、それぞれ指数バックオフでリトライ（最大3時間）
6. まとめテキスト + イラストを指定チャンネルに投稿（2000文字を超える場合は自動分割）
7. Discordから切断して終了
```

## 🚀 セットアップ

### 前提条件

- **Node.js** v22 以上

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

# 任意: 使用モデルの指定（.env.example で設定済み）
GEMINI_TEXT_MODEL=gemini-2.5-flash
GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview
```

### 4. 依存パッケージのインストール

```bash
npm install
```

### 5. 実行

```bash
npm start
```

## 🎨 参照画像（任意）

画像生成の品質と一貫性を高めるために、参照画像を配置できます。

### スタイル参照画像

毎週生成される画像の画風を統一したい場合に使用します。

```bash
# お好みの画風の画像を references/style.png として配置
cp your-favorite-style.png references/style.png
```

- `references/style.png`（または `.jpg` / `.jpeg` / `.webp`）が存在する場合、画像生成時にスタイル参照として自動的に渡されます
- 存在しない場合は従来通りテキストのみで画像を生成します
- 前回の生成画像が気に入ったら、それを `style.png` に上書きすればテイストを引き継げます
- PNG / JPEG / WebP 形式に対応しています

### キャラクター参照画像

Discordユーザーの見た目をイラスト上で統一したい場合に使用します。
**ファイル名（拡張子なし）= Discordの表示名** で紐づけます。

```bash
# 例: references/characters/ にユーザーごとの画像を配置
references/characters/
├── リンカ.png
├── ふぐ.png
└── にょーそくん.png
```

- まとめテキスト内にファイル名と一致するユーザー名が **登場した場合のみ** 参照画像が渡されます
- 登場しないユーザーの画像は無視されます（不要なAPI負荷を避けます）
- Gemini 3 Pro Image の制限により、**最大5枚** まで渡されます
- PNG / JPEG / WebP 形式に対応しています

## ⏰ cron設定（本番運用）

毎週日曜12:00（JST）に実行する場合:

```bash
crontab -e
```

以下を追加:

```cron
0 12 * * 0 cd /path/to/discord-weekly-enikki && /usr/bin/node src/index.js >> /var/log/discord-enikki.log 2>&1
```

> **注意**: cron環境では `PATH` が通常と異なるため、Node.js のフルパス（`/usr/bin/node` など）を指定してください。`which node` で確認できます。

## 🔧 設定オプション

| 環境変数 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `DISCORD_BOT_TOKEN` | ✅ | - | Discord Bot トークン |
| `DISCORD_TARGET_CHANNEL_ID` | ✅ | - | まとめ投稿先チャンネルID |
| `GEMINI_API_KEY` | ✅ | - | Google Gemini API キー |
| `GEMINI_TEXT_MODEL` | ❌ | `gemini-2.5-flash` | テキスト要約・画像プロンプト生成モデル |
| `GEMINI_IMAGE_MODEL` | ❌ | `gemini-2.5-flash` | 画像生成モデル |

> **ヒント**: Nano Banana Pro を使用する場合は `.env` に `GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview` を設定してください（`.env.example` では設定済みです）。

## ⚠️ 注意事項

- Discord APIにはレート制限があります。大量のチャンネルやフォーラムスレッドがある場合、取得に時間がかかることがあります
- Gemini APIのトークン制限により、非常に大量のメッセージがある場合は一部が切り捨てられる可能性があります
- Nano Banana Pro のAPIはプレビュー版のため、モデル名が変更される可能性があります
- Bot の **Message Content Intent** が有効でないとメッセージ内容を取得できません
- Gemini APIの呼び出し（まとめ生成・プロンプト考案・画像生成）に失敗した場合、指数バックオフによるリトライが最大3時間行われます（認証エラー等の復旧不可能なエラーを除く）
- キャラクター参照画像のファイル名はDiscordの **表示名と完全一致** する必要があります
