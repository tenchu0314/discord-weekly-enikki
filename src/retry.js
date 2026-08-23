/**
 * Gemini API 向け 指数バックオフリー試行ユーティリティ
 */

// デフォルト設定定数
const DEFAULT_MAX_RETRY_DURATION_MS = 3 * 60 * 60 * 1000; // 最大3時間 (10,800,000 ms)
const DEFAULT_INITIAL_DELAY_MS = 10 * 1000; // 初期待機 10秒
const DEFAULT_BACKOFF_FACTOR = 1.5; // 指数倍率 1.5倍
const DEFAULT_MAX_DELAY_MS = 5 * 60 * 1000; // 1回の最大待機 5分 (300,000 ms)

/**
 * 経過時間を人間が読みやすい文字列 (例: "12分34秒" or "45秒") に変換する
 * @param {number} ms - ミリ秒
 * @returns {string}
 */
export function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) {
        return `${seconds}秒`;
    }
    return `${minutes}分${seconds.toString().padStart(2, "0")}秒`;
}

/**
 * リトライしても復旧しない致命的エラー（無効なAPIキーなど）かどうかを判定する
 * @param {any} error
 * @returns {boolean}
 */
export function isNonRetryableError(error) {
    if (!error) return false;
    const msg = (error.message || "").toLowerCase();
    const status = error.status || error.code || error.statusCode;

    if (status === 401 || status === 403) {
        return true;
    }

    if (
        msg.includes("api_key_invalid") ||
        msg.includes("api key not valid") ||
        msg.includes("api key expired") ||
        msg.includes("permission_denied") ||
        msg.includes("unauthenticated")
    ) {
        return true;
    }

    return false;
}

/**
 * Gemini API 呼び出しを最大3時間の指数バックオフでリトライする高階関数
 * @template T
 * @param {() => Promise<T>} operation - 実行する非同期処理
 * @param {string} [operationName="Gemini API 呼び出し"] - ログ表示用の処理名
 * @param {object} [options] - 設定オーバーライド用（テストや特殊要件用）
 * @param {number} [options.maxDurationMs] - 最大試行継続時間（ms）
 * @param {number} [options.initialDelayMs] - 初期待機時間（ms）
 * @param {number} [options.backoffFactor] - 指数バックオフ乗数
 * @param {number} [options.maxDelayMs] - 1回あたりの最大待機時間（ms）
 * @returns {Promise<T>}
 */
export async function withGeminiRetry(
    operation,
    operationName = "Gemini API 呼び出し",
    options = {}
) {
    const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_RETRY_DURATION_MS;
    const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    const backoffFactor = options.backoffFactor ?? DEFAULT_BACKOFF_FACTOR;
    const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

    const startTime = Date.now();
    let attempt = 0;
    let currentDelayMs = initialDelayMs;

    while (true) {
        attempt++;
        try {
            return await operation();
        } catch (error) {
            const elapsedMs = Date.now() - startTime;

            // 認証エラーなどの致命的エラーはリトライせずに即時 throw
            if (isNonRetryableError(error)) {
                console.error(
                    `\n🚫 [${operationName}] 復旧不可能なエラーを検出したため、リトライを中断します: ${error.message}`
                );
                throw error;
            }

            // 最大制限時間を超えた場合は終了
            if (elapsedMs >= maxDurationMs) {
                console.error(
                    `\n⏱️ [${operationName}] 最大リトライ時間 (${formatDuration(maxDurationMs)}) を超過しました (試行回数: ${attempt}回)。`
                );
                throw error;
            }

            // ジッター (±10%) を加えた待機時間を計算
            const jitterMultiplier = 0.9 + Math.random() * 0.2;
            const targetDelayMs = Math.min(
                Math.round(currentDelayMs * jitterMultiplier),
                maxDelayMs
            );
            // 残りリトライ時間を超えないよう調整
            const actualDelayMs = Math.min(targetDelayMs, Math.max(1000, maxDurationMs - elapsedMs));

            const nextWaitSec = Math.max(1, Math.round(actualDelayMs / 1000));
            console.warn(
                `\n⚠️ [${operationName}] エラーが発生しました: ${error.message}\n` +
                `⏳ 次回リトライまで ${nextWaitSec}秒 待機します (試行 ${attempt}回目 | 経過時間: ${formatDuration(elapsedMs)} / 上限: ${formatDuration(maxDurationMs)})`
            );

            await new Promise((resolve) => setTimeout(resolve, actualDelayMs));

            // 次の待機時間を指数増加
            currentDelayMs = Math.min(currentDelayMs * backoffFactor, maxDelayMs);
        }
    }
}
