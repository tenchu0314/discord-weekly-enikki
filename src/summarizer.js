import { GoogleGenAI } from "@google/genai";
import { config } from "./config.js";

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

/**
 * Gemini API を使って会話ログのまとめを生成する
 * @param {string} formattedMessages - チャンネルごとに整形済みの会話テキスト
 * @returns {Promise<string>} まとめテキスト
 */
export async function generateSummary(formattedMessages) {
    console.log("\n🤖 Gemini API でまとめを生成中...");

    const prompt = `あなたはDiscordサーバーの週間レポートライターです。
以下はDiscordサーバーの過去1週間の会話ログです。
これを読んで、サーバーの1週間の出来事をまとめた「週間絵日記」のテキストを作成してください。

## ルール
- 各チャンネルの主要なトピックや盛り上がったポイントをまとめる
- 参加者の名前はそのまま使用する
- 楽しく読めるようなトーンで書く
- 絵文字を適度に使って読みやすくする
- 長すぎず、1500文字以内にまとめる
- Discordに投稿するので、Markdownの太字(**テキスト**)を使ってよい
- 重要な会話がなかったチャンネルは省略してよい

## 会話ログ
${formattedMessages}

## 出力
上記の会話に基づいた週間まとめを日本語で書いてください。`;

    const response = await ai.models.generateContent({
        model: config.gemini.textModel,
        contents: prompt,
    });

    /* レスポンスからテキストを抽出 */
    let summary;

    // SDKのバージョンやレスポンス形式によって取得方法が異なるため分岐
    if (typeof response.text === 'function') {
        summary = response.text();
    } else if (response.text) {
        summary = response.text;
    } else if (response.candidates && response.candidates.length > 0) {
        // candidatesから直接テキストを結合して取得
        const candidate = response.candidates[0];
        if (candidate.content && candidate.content.parts) {
            summary = candidate.content.parts
                .filter(part => part.text)
                .map(part => part.text)
                .join('');
        }
    }

    if (!summary) {
        console.error("Gemini API Response:", JSON.stringify(response, null, 2));
        throw new Error("Gemini APIからのレスポンスに有効なテキストが含まれていません。");
    }

    console.log(`✅ まとめ生成完了 (${summary.length} 文字)`);
    return summary;
}
