import { GoogleGenAI } from "@google/genai";
import { config } from "./config.js";

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

/**
 * Nano Banana Pro (Gemini 3 Pro Image) を使ってまとめの内容から画像を生成する
 * @param {string} summary - 週間まとめテキスト
 * @returns {Promise<Buffer>} 生成された画像の Buffer
 */
export async function generateImage(summary) {
    console.log("\n🎨 Nano Banana Pro で画像を生成中...");

    // まとめテキストから画像生成用のプロンプトを作る
    const imagePrompt = `あなたはイラストレーターです。以下のDiscordサーバーの週間まとめの内容を表現した、
1枚の「週間絵日記」風のイラストを描いてください。

## スタイル指示
- かわいいポップなイラスト風
- 明るく楽しい雰囲気
- サーバーの1週間の活動を象徴するシーンを描く
- 日本語のテキストは画像内に入れない（文字化けを防ぐため）

## 週間まとめの内容
${summary.slice(0, 1000)}

上記の内容を象徴する1枚のイラストを生成してください。`;

    const response = await ai.models.generateContent({
        model: config.gemini.imageModel,
        contents: imagePrompt,
    });

    // レスポンスから画像データを探す
    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            const imageBuffer = Buffer.from(part.inlineData.data, "base64");
            console.log(`✅ 画像生成完了 (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
            return imageBuffer;
        }
    }

    throw new Error("画像の生成に失敗しました。レスポンスに画像データが含まれていません。");
}
