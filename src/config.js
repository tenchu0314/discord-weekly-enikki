import dotenv from "dotenv";
dotenv.config();

/**
 * アプリケーション設定
 * 環境変数から読み込み、必須項目が未設定の場合はエラーを投げる
 */

const requiredEnvVars = [
    "DISCORD_BOT_TOKEN",
    "DISCORD_TARGET_CHANNEL_ID",
    "GEMINI_API_KEY",
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`環境変数 ${envVar} が設定されていません。.env ファイルを確認してください。`);
    }
}

export const config = {
    discord: {
        botToken: process.env.DISCORD_BOT_TOKEN,
        targetChannelId: process.env.DISCORD_TARGET_CHANNEL_ID,
    },
    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        textModel: process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash",
        imageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview",
    },
};
