# 会話と身体データ

感情スコアは発話内の表現から推定した `loneliness`、`anxiety`、`positive_affect`、`interest` の 0〜1 の値です。診断や確定した感情ではありません。会話ごとに `Message.emotionScores` に保存し、直近の値を会話画面にも表示します。

身体データは `HealthSample` に日付・利用者・取得元ごとに保存します。現在の共通取り込み口は、ログイン済み利用者の `POST /api/health` です。JSON で `date`（東京の日付、`YYYY-MM-DD`）、`sleepMinutes`、`steps`、`restingHeartRate` を渡します。数値は取得できた項目だけ渡せます。`GET /api/health` は当日の最新データを返します。取り込み口から送信した値の取得元は `import` です。

```json
{
  "date": "2026-09-27",
  "sleepMinutes": 420,
  "steps": 3200,
  "restingHeartRate": 68
}
```

会話生成は数値と提案方針を参考にします。不安や孤独が高ければ質問を控え、楽しさや関心が高ければ話題を広げます。関心が高かった会話の具体的な話題は、次回以降の「今日の話題」にも使います。身体データだけで病気や感情を判断しません。

## Pixel Watch の接続

Pixel Watch とスマートフォンの Google Health アプリを同期してください。このアプリは Google Health API v4 を使い、読み取り権限だけで当日の歩数、主睡眠の睡眠時間、安静時心拍を取得します。接続後は会話時に最大30分間隔で自動更新します。画面の「今すぐ同期」でも更新できます。連携を解除すると、保存していた OAuth トークンは削除されます。

Google Cloud で Google Health API を有効にし、OAuth の「ウェブ アプリケーション」クライアントを作成してください。テスト公開中は、Pixel Watch に使用している Google アカウントをテストユーザーに追加します。次の読み取りスコープを OAuth 同意画面に登録します。

- `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
- `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
- `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`

`.env` に次を設定します。リダイレクト URI は Google Cloud の「承認済みのリダイレクト URI」と完全に一致させます。ローカル開発なら `http://localhost:3000/api/health/google/callback` です。暗号鍵は32バイトのランダム値を Base64 にしたもので、変更すると既存の接続トークンは復号できなくなります。

暗号鍵はローカルの端末で `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` を実行して生成できます。値は `.env` だけに保存してください。

```dotenv
GOOGLE_HEALTH_CLIENT_ID=
GOOGLE_HEALTH_CLIENT_SECRET=
GOOGLE_HEALTH_REDIRECT_URI=http://localhost:3000/api/health/google/callback
GOOGLE_HEALTH_ENCRYPTION_KEY=
```

DB には `prisma/manual-migrations/phase12_wellbeing_signals.sql` と `phase13_google_health_connection.sql` を順に適用し、`npm run prisma:generate` を実行します。Google Cloud の認証情報とユーザーの OAuth 同意がそろうまでは、実機からの取得は始まりません。
