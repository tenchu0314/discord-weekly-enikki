import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import { config } from "./config.js";

/**
 * Discord クライアントを作成してログインする
 * @returns {Promise<Client>} ログイン済みのDiscordクライアント
 */
export async function createDiscordClient() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
        ],
    });

    await client.login(config.discord.botToken);

    // ready イベントを待つ
    await new Promise((resolve) => {
        if (client.isReady()) {
            resolve();
        } else {
            client.once("ready", resolve);
        }
    });

    console.log(`✅ Botとしてログインしました: ${client.user.tag}`);
    return client;
}

/**
 * 先週日曜12:00 〜 今週日曜12:00 の期間を計算する
 * cron で日曜12:00に実行される想定なので、「今」が今週日曜12:00扱い
 * @returns {{ start: Date, end: Date }}
 */
export function getTargetPeriod() {
    const now = new Date();

    // 今週日曜12:00 (JST) = 実行時刻を end とする
    const end = new Date(now);

    // 先週日曜12:00 (JST) = 7日前
    const start = new Date(end);
    start.setDate(start.getDate() - 7);

    console.log(`📅 対象期間: ${start.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} 〜 ${end.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`);

    return { start, end };
}

/**
 * 指定チャンネルから期間内のメッセージを全件取得する
 * Discord API は1回のリクエストで最大100件なのでページネーションが必要
 * @param {import("discord.js").TextChannel} channel
 * @param {Date} start
 * @param {Date} end
 * @param {string} botUserId - 除外するBotのユーザーID
 * @returns {Promise<Array<{author: string, content: string, timestamp: Date}>>}
 */
async function fetchMessagesInPeriod(channel, start, end, botUserId) {
    const messages = [];
    let lastMessageId = null;

    while (true) {
        const fetchOptions = { limit: 100 };
        if (lastMessageId) {
            fetchOptions.before = lastMessageId;
        }

        let fetched;
        try {
            fetched = await channel.messages.fetch(fetchOptions);
        } catch (error) {
            // 権限不足などでメッセージを取得できないチャンネルはスキップ
            console.warn(`  ⚠️ #${channel.name} のメッセージ取得に失敗: ${error.message}`);
            return messages;
        }

        if (fetched.size === 0) break;

        for (const msg of fetched.values()) {
            // 期間より古いメッセージに到達したら終了
            if (msg.createdAt < start) {
                return messages;
            }

            // 期間内かつBotの投稿でない場合のみ収集
            if (msg.createdAt >= start && msg.createdAt <= end) {
                // Botの投稿を除外（循環参照防止）
                if (msg.author.id === botUserId) continue;
                // 他のBotの投稿も除外
                if (msg.author.bot) continue;
                // 空メッセージはスキップ
                if (!msg.content || msg.content.trim() === "") continue;

                messages.push({
                    author: msg.author.displayName || msg.author.username,
                    content: msg.content,
                    timestamp: msg.createdAt,
                });
            }
        }

        // 次のページへ
        lastMessageId = fetched.last().id;

        // レート制限対策: 少し待機
        await sleep(500);
    }

    return messages;
}

/**
 * フォーラムチャンネルの全スレッド（アクティブ＋アーカイブ済み）から
 * 対象期間内のメッセージを収集する
 * @param {import("discord.js").ForumChannel} forumChannel
 * @param {Date} start
 * @param {Date} end
 * @param {string} botUserId - 除外するBotのユーザーID
 * @returns {Promise<Array<{channelName: string, messages: Array}>>}
 */
async function fetchForumMessages(forumChannel, start, end, botUserId) {
    const results = [];

    // アクティブなスレッドとアーカイブ済みスレッドを両方取得
    let allThreads = [];
    try {
        const activeThreads = await forumChannel.threads.fetchActive();
        allThreads.push(...activeThreads.threads.values());
    } catch (error) {
        console.warn(`  ⚠️ [${forumChannel.name}] アクティブスレッドの取得に失敗: ${error.message}`);
    }
    try {
        const archivedThreads = await forumChannel.threads.fetchArchived();
        allThreads.push(...archivedThreads.threads.values());
    } catch (error) {
        console.warn(`  ⚠️ [${forumChannel.name}] アーカイブスレッドの取得に失敗: ${error.message}`);
    }

    for (const thread of allThreads) {
        // スレッドの作成日時が対象期間より明らかに古い場合はスキップ（高速化）
        if (thread.createdAt && thread.createdAt < start) {
            // アーカイブ済みスレッドで最終投稿が期間内の可能性があるためスキップしない
        }

        console.log(`  💬 [${forumChannel.name}] スレッド: ${thread.name} のメッセージを取得中...`);
        const messages = await fetchMessagesInPeriod(thread, start, end, botUserId);

        if (messages.length > 0) {
            messages.sort((a, b) => a.timestamp - b.timestamp);
            results.push({
                channelName: `${forumChannel.name} > ${thread.name}`,
                messages,
            });
            console.log(`    → ${messages.length} 件のメッセージを取得`);
        } else {
            console.log(`    → メッセージなし`);
        }

        // レート制限対策
        await sleep(300);
    }

    return results;
}

/**
 * Botが所属する全サーバーの全テキストチャンネル・フォーラムチャンネルから
 * 対象期間のメッセージを収集する
 * @param {Client} client
 * @param {Date} start
 * @param {Date} end
 * @returns {Promise<Map<string, Array<{channelName: string, messages: Array}>>>}
 *   サーバー名 => チャンネルごとのメッセージ配列のMap
 */
export async function collectAllMessages(client, start, end) {
    const botUserId = client.user.id;
    const serverData = new Map();

    for (const guild of client.guilds.cache.values()) {
        console.log(`\n🏠 サーバー: ${guild.name}`);
        const channelMessages = [];

        // テキストチャンネルを対象にする
        const textChannels = guild.channels.cache.filter(
            (ch) => ch.type === ChannelType.GuildText
        );

        for (const channel of textChannels.values()) {
            console.log(`  📝 #${channel.name} のメッセージを取得中...`);
            const messages = await fetchMessagesInPeriod(channel, start, end, botUserId);

            if (messages.length > 0) {
                // 時系列順にソート（古い順）
                messages.sort((a, b) => a.timestamp - b.timestamp);
                channelMessages.push({
                    channelName: channel.name,
                    messages,
                });
                console.log(`    → ${messages.length} 件のメッセージを取得`);
            } else {
                console.log(`    → メッセージなし`);
            }
        }

        // フォーラムチャンネルを対象にする
        const forumChannels = guild.channels.cache.filter(
            (ch) => ch.type === ChannelType.GuildForum
        );

        for (const forumChannel of forumChannels.values()) {
            console.log(`  📋 [フォーラム] ${forumChannel.name} のスレッドを取得中...`);
            const forumResults = await fetchForumMessages(forumChannel, start, end, botUserId);
            channelMessages.push(...forumResults);
        }

        if (channelMessages.length > 0) {
            serverData.set(guild.name, channelMessages);
        }
    }

    return serverData;
}

/**
 * 収集したメッセージをGemini APIに送るためのテキスト形式に変換する
 * @param {Map<string, Array>} serverData
 * @returns {string}
 */
export function formatMessagesForSummary(serverData) {
    const parts = [];

    for (const [serverName, channels] of serverData) {
        parts.push(`\n===== サーバー: ${serverName} =====\n`);

        for (const { channelName, messages } of channels) {
            parts.push(`\n--- #${channelName} ---`);

            for (const msg of messages) {
                const time = msg.timestamp.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
                parts.push(`[${time}] ${msg.author}: ${msg.content}`);
            }
        }
    }

    return parts.join("\n");
}

/**
 * 指定チャンネルにまとめテキストと画像を投稿する
 * @param {Client} client
 * @param {string} summary - まとめテキスト
 * @param {Buffer} imageBuffer - 生成された画像のBuffer
 */
export async function postSummary(client, summary, imageBuffer) {
    const channel = await client.channels.fetch(config.discord.targetChannelId);

    if (!channel) {
        throw new Error(
            `チャンネル ${config.discord.targetChannelId} が見つかりません。Bot がアクセスできるチャンネルIDを確認してください。`
        );
    }

    // Discordのメッセージ文字数制限は2000文字
    const MAX_LENGTH = 2000;
    const header = "📰 **今週のサーバーまとめ**\n\n";

    // まとめが長い場合は分割して送信
    if ((header + summary).length <= MAX_LENGTH) {
        await channel.send({
            content: header + summary,
            files: [{ attachment: imageBuffer, name: "weekly-enikki.png" }],
        });
    } else {
        // まず画像付きヘッダーを送信
        await channel.send({
            content: header,
            files: [{ attachment: imageBuffer, name: "weekly-enikki.png" }],
        });

        // まとめテキストを分割して送信
        const chunks = splitText(summary, MAX_LENGTH);
        for (const chunk of chunks) {
            await channel.send({ content: chunk });
            await sleep(500);
        }
    }

    console.log(`✅ チャンネル #${channel.name} にまとめを投稿しました`);
}

/**
 * テキストを指定文字数以内に分割する
 * @param {string} text
 * @param {number} maxLength
 * @returns {string[]}
 */
function splitText(text, maxLength) {
    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }

        // 改行の位置で切る
        let splitIndex = remaining.lastIndexOf("\n", maxLength);
        if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
            // 改行が見つからないか遠すぎる場合はスペースで切る
            splitIndex = remaining.lastIndexOf(" ", maxLength);
        }
        if (splitIndex === -1) {
            splitIndex = maxLength;
        }

        chunks.push(remaining.slice(0, splitIndex));
        remaining = remaining.slice(splitIndex).trimStart();
    }

    return chunks;
}

/**
 * 指定ミリ秒だけ待機する
 * @param {number} ms
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
