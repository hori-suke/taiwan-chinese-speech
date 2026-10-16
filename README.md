# 🇹🇼 台湾華語 音声学習 Webアプリ (Gemini TTS)

台湾華語のリスニングとスピーキング学習に特化した、軽量・高機能なWebアプリケーションです。  
テキストを貼り付けるだけで、台湾華語の正確な発音による音声生成、ピンイン（声調記号付き）、日本語訳の同時取得、歌詞情報（ID3タグ）が埋め込まれた軽量MP3のダウンロードが可能です。

---

## 🌟 主な機能と特徴

1. **台湾華語の高品質な音声生成 (Gemini TTS)**
   - Google Gemini APIの音声合成（Audio出力モダリティ）を活用。
   - 女性音声（`Aoede`, `Kore`）、男性音声（`Puck`, `Fenrir`, `Charon`）から選択可能。
   - `gemini-3.8-flash`（推奨・最新）、`gemini-2.5-flash-preview-tts` など任意のモデルを指定可能。

2. **軽量MP3生成＆歌詞タグ（ID3v2 USLT）埋め込み**
   - Web Audio APIとブラウザ内MP3エンコーダにより、約数十KB〜数百KBの超軽量MP3ファイルを生成。
   - MP3内部の歌詞情報（ID3タグのUSLTフレーム）に「台湾華語（繁体字）」「ピンイン」「日本語訳」を自動埋め込み。
   - iPhoneのミュージックアプリ、Androidの各種プレーヤー、PCの音楽再生ソフトで歌詞表示しながら学習可能。

3. **完全クライアントサイド動作（安全・情報漏洩ゼロ）**
   - バックエンドサーバーを一切持たない純粋な静的HTMLアプリケーション。
   - APIキーはご自身のブラウザ（`localStorage`）にのみ安全に保存され、Google APIとブラウザ間で直接暗号化通信（HTTPS）されます。
   - 第三者のサーバーを経由しないため、APIキーや学習文章が外部に漏洩する心配はありません。

4. **API使用量（トークン数＆概算金額）のリアルタイム表示**
   - Google AI Studioキーの仕様上、API経由で直接残高を取得するエンドポイントは提供されていません。
   - その代替として、各リクエストで消費したトークン数、累計消費トークン数、リクエスト回数に加え、**各モデルの公式料金に基づいた概算金額（日本円・USD）** をリアルタイムに計算して併記。
   - Google AI StudioのAPIキー管理・残高確認ダッシュボードへの直接リンクも配置。

5. **ワンクリック文字クリア＆シンプルな操作性**
   - 文章貼り付けエリアにワンクリックで全文消去できる「テキストをクリア」ボタンを設置。
   - PC・スマートフォン（iOS Safari, Android Chrome）両対応のレスポンシブデザイン。

---

## 📁 ファイル構成

```text
taiwan-chinese-speech/
├── index.html                  # 通常版HTML（CSS/JS分割構成）
├── taiwan-chinese-speech.html  # 単一完結版HTML（CSS・JSを1ファイルに統合、Google Drive設置推奨）
├── css/
│   └── style.css               # スタイルシート（FLOCSS設計・レスポンシブ）
├── js/
│   └── app.js                  # アプリケーションロジック（Gemini API、MP3エンコード、ID3埋込）
└── README.md                   # 本ドキュメント
```

---

## 🚀 使い方・クラウドへの設置方法

### 1. Google Driveに設置して利用する場合（最も簡単）
1. `taiwan-chinese-speech.html` をご自身のGoogle Driveフォルダにアップロードします。
2. **PCから使う場合:**
   - Google Drive上のファイルをダウンロード、またはダブルクリックしてブラウザで開きます。
3. **スマートフォンから使う場合:**
   - Google Driveアプリで `taiwan-chinese-speech.html` を開き、「アプリで開く」または「ブラウザ（Safari / Chrome）で開く」を選択します。
   - または、Google Driveの「リンクを知っている全員」で共有リンクを発行し、スマートフォンのブラウザで直接アクセスすることも可能です（サーバーを介さずクライアント側で動くため、自分専用のAPIキーを入力した端末でのみ利用できます）。

### 2. 自分専用の無料Webホスティングに設置する場合（おすすめ）
スマートフォンからブックマーク1つでいつでも開きたい場合、GitHub PagesやCloudflare Pagesに設置するのが最も快適です：
1. 本フォルダの内容をGitHubのPrivateリポジトリ（またはPublic）にプッシュします。
2. GitHub Pages、または Cloudflare Pages / Vercel に静的サイトとして接続します。
3. 発行されたURLにPCやスマホからアクセスし、ホーム画面に追加すれば、アプリ感覚でいつでも使えます。
   ※APIキーは各端末のブラウザ内にのみ保存されるため、URLをどこにホスティングしても安全です。

### 3. ローカルPCで直接開く場合
`index.html` または `taiwan-chinese-speech.html` をダブルクリックするだけで、そのままブラウザ上で起動します。

---

## 🔑 Gemini APIキーの取得方法

1. [Google AI Studio](https://aistudio.google.com/) にアクセスし、Googleアカウントでログインします。
2. 画面左上の **「Get API key」** をクリックします。
3. **「Create API key」** をクリックして新しいキーを生成し、コピーします。
4. 本アプリの「Gemini APIキー」入力欄に貼り付けます（一度入力するとブラウザに自動保存されます）。

---

## 🎧 MP3の歌詞情報の確認方法

ダウンロードした `.mp3` ファイルにはID3v2の歌詞（USLT）タグが埋め込まれています：
- **iPhone / Mac:** 「ミュージック」アプリに取り込み、曲を再生中に「歌詞」ボタンを押すと表示されます。
- **Android:** 「Musicolet」「Poweramp」などの歌詞表示対応プレーヤーで表示されます。
- **Windows:** 「Groove ミュージック」や「Media Player」で歌詞表示を有効にすると確認できます。

---

## 🛠 技術仕様
- **音声合成:** Google Gemini API (`responseModalities: ["AUDIO"]`, `speechConfig`)
- **テキスト解析:** Gemini API (繁体字・拼音・日本語訳のJSON抽出)
- **音声エンコード:** Web Audio API + `lamejs` (64kbps モノラル MP3)
- **タグ埋め込み:** `browser-id3-writer` (ID3v2.3 USLT フレーム)
