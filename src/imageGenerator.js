import { GoogleGenAI } from "@google/genai";
import { config } from "./config.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

// プロジェクトルートからリファレンス画像のパスを解決
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STYLE_REF_PATH = path.join(__dirname, "..", "references", "style.png");
const CHARACTERS_DIR = path.join(__dirname, "..", "references", "characters");

// 対応する画像拡張子
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// Gemini 3 Pro Image のキャラクター参照上限
const MAX_CHARACTER_REFS = 5;

/**
 * 拡張子からMIMEタイプを返す
 * @param {string} ext - 拡張子（ドット付き、小文字）
 * @returns {string}
 */
function getMimeType(ext) {
    const mimeMap = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    };
    return mimeMap[ext] || "image/png";
}

/**
 * スタイル参照画像を読み込む
 * ファイルが存在しない場合は null を返す
 * @returns {{ mimeType: string, data: string } | null}
 */
function loadStyleReference() {
    if (!fs.existsSync(STYLE_REF_PATH)) {
        return null;
    }

    const imageBuffer = fs.readFileSync(STYLE_REF_PATH);
    const base64Data = imageBuffer.toString("base64");
    const ext = path.extname(STYLE_REF_PATH).toLowerCase();

    console.log(`  🖼️ スタイル参照画像を読み込みました: ${path.basename(STYLE_REF_PATH)} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
    return { mimeType: getMimeType(ext), data: base64Data };
}

/**
 * まとめテキストに登場するキャラクターの参照画像を読み込む
 * references/characters/ 内の画像ファイル名（拡張子なし）とまとめテキストを照合する
 * @param {string} summary - 週間まとめテキスト
 * @returns {Array<{ name: string, mimeType: string, data: string }>}
 */
function loadCharacterReferences(summary) {
    if (!fs.existsSync(CHARACTERS_DIR)) {
        return [];
    }

    const files = fs.readdirSync(CHARACTERS_DIR);
    const matched = [];

    for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) continue;

        // ファイル名（拡張子なし）= キャラクター名
        const characterName = path.basename(file, ext);

        // まとめテキストにキャラクター名が含まれているか
        if (summary.includes(characterName)) {
            const filePath = path.join(CHARACTERS_DIR, file);
            const imageBuffer = fs.readFileSync(filePath);
            const base64Data = imageBuffer.toString("base64");

            matched.push({
                name: characterName,
                mimeType: getMimeType(ext),
                data: base64Data,
            });

            console.log(`  � キャラクター参照: ${characterName} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
        }
    }

    // 上限を超える場合は先頭から MAX_CHARACTER_REFS 枚まで
    if (matched.length > MAX_CHARACTER_REFS) {
        console.warn(`  ⚠️ キャラクター参照が${matched.length}件ありますが、上限の${MAX_CHARACTER_REFS}件に絞ります。`);
        return matched.slice(0, MAX_CHARACTER_REFS);
    }

    return matched;
}

/**
 * Nano Banana Pro (Gemini 3 Pro Image) を使ってまとめの内容から画像を生成する
 * references/style.png が存在する場合、スタイル参照として画像生成に使用する
 * references/characters/ 内にキャラクター画像がある場合、まとめに登場するキャラクターの参照画像を渡す
 * @param {string} summary - 週間まとめテキスト
 * @returns {Promise<Buffer>} 生成された画像の Buffer
 */
export async function generateImage(summary) {
    const MAX_RETRIES = 3;
    let attempt = 0;

    console.log("\n🎨 Nano Banana Pro で画像を生成中...");

    // リファレンス画像の読み込み（ループの外で1回だけ）
    const styleRef = loadStyleReference();
    if (!styleRef) {
        console.log("  ℹ️ スタイル参照画像なし。references/style.png を配置すると画風を統一できます。");
    }

    const characterRefs = loadCharacterReferences(summary);
    if (characterRefs.length === 0) {
        console.log("  ℹ️ キャラクター参照画像なし。references/characters/ に画像を配置するとキャラクターを統一できます。");
    }

    while (attempt < MAX_RETRIES) {
        attempt++;
        if (attempt > 1) {
            console.log(`\n🔄 画像生成リトライ中... (試行 ${attempt}/${MAX_RETRIES})`);
        }

        try {
            // 1. まとめテキストから画像生成用のプロンプトを作成する（テキストモデルを使用）
            console.log("  💭 画像生成用プロンプトを考案中...");

            // リファレンス画像に関する追加指示
            let refInstructions = "";
            if (styleRef) {
                refInstructions += "\n- 添付されるスタイル参照画像の画風・色彩・タッチに合わせてください。プロンプトにスタイルの特徴も含めてください。";
            }
            if (characterRefs.length > 0) {
                const charList = characterRefs.map(c => c.name).join("、");
                refInstructions += `\n- 以下のキャラクターの参照画像が添付されます: ${charList}。これらのキャラクターが登場する場合、参照画像に基づいた外見で描写してください。`;
            }

            const promptForImagePrompt = `あなたはAI画像生成のプロンプトエンジニアです。
以下のDiscordサーバーの週間まとめを読み、その週を象徴する1枚のイラストを生成するためのプロンプトを作成してください。

## 週間まとめ
${summary}

## プロンプト生成の要件
- 出力は【日本語のプロンプトのみ】にしてください。解説は不要です。
- 画風や雰囲気は、まとめの内容に最も適したものを選んでください（例: 楽しい話題なら明るく、真面目な議論なら落ち着いた雰囲気、ゲームの話題ならファンタジー風など）。
- 特定のスタイル（「絵日記風」など）に固執する必要はありません。
- まとめの中で最も印象的な出来事やシーンを具体的に描写してください。
- キャラクターや背景、照明などの詳細を含めてください。${refInstructions}`;

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

            console.log(`  📝 生成されたプロンプト: ${imagePrompt.substring(0, 80)}...`);

            // 2. 画像を生成する
            // キャラクター参照画像のラベリング指示を構築
            let charLabelInstruction = "";
            if (characterRefs.length > 0) {
                const labels = characterRefs
                    .map((c, i) => `Reference image ${i + (styleRef ? 2 : 1)} is the character "${c.name}".`)
                    .join(" ");
                charLabelInstruction = `\nCharacter references: ${labels} Depict these characters based on their reference images.`;
            }

            const finalImagePrompt = `[Generate an image directly based on this prompt. Do not output any text plan.]
${styleRef ? "Match the artistic style of the first reference image." : ""}${charLabelInstruction}
${imagePrompt}`;

            // contents を構築（テキスト + スタイル参照 + キャラクター参照）
            const contents = [{ text: finalImagePrompt }];

            // スタイル参照画像を先に追加
            if (styleRef) {
                contents.push({
                    inlineData: {
                        mimeType: styleRef.mimeType,
                        data: styleRef.data,
                    },
                });
            }

            // キャラクター参照画像を追加
            for (const charRef of characterRefs) {
                contents.push({
                    inlineData: {
                        mimeType: charRef.mimeType,
                        data: charRef.data,
                    },
                });
            }

            const response = await ai.models.generateContent({
                model: config.gemini.imageModel,
                contents: contents,
                config: {
                    responseModalities: ["TEXT", "IMAGE"],
                    temperature: 0.4,
                },
            });

            // レスポンスから画像データを探す
            if (response.candidates && response.candidates.length > 0) {
                const candidate = response.candidates[0];

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
