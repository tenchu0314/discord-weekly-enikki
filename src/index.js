import {
    createDiscordClient,
    getTargetPeriod,
    collectAllMessages,
    formatMessagesForSummary,
    postSummary,
} from "./discord.js";
import { generateSummary } from "./summarizer.js";
import { generateImage } from "./imageGenerator.js";
import { redactSecrets } from "./retry.js";

/**
 * メイン処理
 * 1. Discordにログイン
 * 2. 過去1週間の会話を収集
 * 3. Gemini APIでまとめを生成
 * 4. Nano Banana Proで画像を生成
 * 5. 指定チャンネルに投稿
 * 6. Discordクライアントを切断して終了
 */
async function main() {
    console.log("🚀 Discord 週間絵日記 Bot を開始します...\n");

    let client;

    try {
        // 1. Discordにログイン
        client = await createDiscordClient();

        // 2. 対象期間を計算
        const { start, end } = getTargetPeriod();

        // 3. 全サーバーの会話を収集
        const serverData = await collectAllMessages(client, start, end);

        if (serverData.size === 0) {
            console.log("\n📭 対象期間のメッセージが見つかりませんでした。投稿をスキップします。");
            return;
        }

        // 4. メッセージを整形
        const formattedMessages = formatMessagesForSummary(serverData);
        console.log(`\n📊 合計メッセージ数: ${countTotalMessages(serverData)} 件`);

        // 5. Gemini APIでまとめを生成
        const summary = await generateSummary(formattedMessages);

        // 6. Nano Banana Proで画像を生成
        const imageBuffer = await generateImage(summary);

        // 7. Discordに投稿
        await postSummary(client, summary, imageBuffer);

        console.log("\n🎉 全ての処理が完了しました！");
    } catch (error) {
        console.error("\n❌ エラーが発生しました:", redactSecrets(error));
        process.exitCode = 1;
    } finally {
        // Discordクライアントを切断
        if (client) {
            client.destroy();
            console.log("🔌 Discordから切断しました");
        }
    }
}

/**
 * 全サーバーの合計メッセージ数をカウント
 * @param {Map<string, Array>} serverData
 * @returns {number}
 */
function countTotalMessages(serverData) {
    let total = 0;
    for (const channels of serverData.values()) {
        for (const { messages } of channels) {
            total += messages.length;
        }
    }
    return total;
}

main();
