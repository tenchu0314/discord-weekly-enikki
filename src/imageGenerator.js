import { GoogleGenAI } from "@google/genai";
import { config } from "./config.js";

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

/**
 * Nano Banana Pro (Gemini 3 Pro Image) を使ってまとめの内容から画像を生成する
 * @param {string} summary - 週間まとめテキスト
 * @returns {Promise<Buffer>} 生成された画像の Buffer
 */
export async function generateImage(summary) {
    const MAX_RETRIES = 3;
    let attempt = 0;

    console.log("\n🎨 Nano Banana Pro で画像を生成中...");

    while (attempt < MAX_RETRIES) {
        attempt++;
        if (attempt > 1) {
            console.log(`\n🔄 画像生成リトライ中... (試行 ${attempt}/${MAX_RETRIES})`);
        }

        try {
            // 1. まとめテキストから画像生成用のプロンプトを作成する（テキストモデルを使用）
            // リトライ時はプロンプト生成からやり直すことで、違う結果を期待する
            console.log("  💭 画像生成用プロンプトを考案中...");
            const promptForImagePrompt = `あなたはAI画像生成のプロンプトエンジニアです。
以下のDiscordサーバーの週間まとめを読み、その週を象徴する1枚のイラストを生成するためのプロンプトを作成してください。

## 週間まとめ
${summary}

## プロンプト生成の要件
- 出力は【日本語のプロンプトのみ】にしてください。解説は不要です。
- 画風や雰囲気は、まとめの内容に最も適したものを選んでください（例: 楽しい話題なら明るく、真面目な議論なら落ち着いた雰囲気、ゲームの話題ならファンタジー風など）。
- 特定のスタイル（「絵日記風」など）に固執する必要はありません。
- まとめの中で最も印象的な出来事やシーンを具体的に描写してください。
- キャラクターや背景、照明などの詳細を含めてください。`;

            const promptResponse = await ai.models.generateContent({
                model: config.gemini.textModel,
                contents: promptForImagePrompt,
            });

            // SDKのバージョン差異吸収
            let imagePrompt;
            if (typeof promptResponse.text === 'function') {
                imagePrompt = promptResponse.text();
            } else {
                imagePrompt = promptResponse.text || promptResponse.candidates?.[0]?.content?.parts?.[0]?.text || "";
            }

            if (!imagePrompt) {
                throw new Error("画像生成用プロンプトの作成に失敗しました。");
            }

            console.log(`  📝 生成されたプロンプト: ${imagePrompt.substring(0, 50)}...`);

            // 2. 画像を生成する
            // gemini-3-pro-image-preview がテキストで応答するのを防ぐための強力な指示
            const finalImagePrompt = `[Generate an image directly based on this prompt. Do not output any text plan.]
${imagePrompt}`;

            const response = await ai.models.generateContent({
                model: config.gemini.imageModel,
                contents: finalImagePrompt,
                generationConfig: {
                    // temperatureを下げて指示に従いやすくする
                    temperature: 0.4,
                }
            });

            // レスポンスから画像データを探す
            if (response.candidates && response.candidates.length > 0) {
                const candidate = response.candidates[0];

                // 生成が何らかの理由で停止したか確認
                if (candidate.finishReason && candidate.finishReason !== "STOP") {
                    console.warn(`⚠️ 画像生成の Finish Reason: ${candidate.finishReason}`);
                }

                if (candidate.content && candidate.content.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.inlineData) {
                            const imageBuffer = Buffer.from(part.inlineData.data, "base64");
                            console.log(`✅ 画像生成完了 (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
                            return imageBuffer;
                        }
                    }
                }
            }

            // 失敗時のログ出力
            console.warn(`❌ 画像生成失敗 (試行 ${attempt}/${MAX_RETRIES}): レスポンスに画像が含まれていませんでした。`);

            // デバッグ用にレスポンスの一部を出力
            if (attempt === MAX_RETRIES) {
                console.error("❌ 最終エラー: レスポンス詳細");
                console.error(JSON.stringify(response, null, 2));
            }

        } catch (error) {
            console.warn(`❌ 予期せぬエラー (試行 ${attempt}/${MAX_RETRIES}):`, error.message);
            if (attempt === MAX_RETRIES) throw error;
        }

        // 次の試行まで少し待つ
        if (attempt < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    throw new Error("画像の生成に失敗しました。最大リトライ回数を超えました。");
}
