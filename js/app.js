/**
 * 台湾華語 TTS ＆ スピーキング学習アプリ
 * 完全クライアントサイド動作 (APIキーの外部流出なし)
 */

(() => {
  'use strict';

  // ローカルストレージのキー定数
  const STORAGE_KEYS = {
    API_KEY: 'tw_speech_gemini_api_key',
    MODEL: 'tw_speech_model',
    VOICE: 'tw_speech_voice',
    STATS: 'tw_speech_usage_stats'
  };

  // デフォルト設定
  const DEFAULT_CONFIG = {
    model: 'gemini-3.8-flash-tts',
    voice: 'Aoede', // 女性: Aoede, 男性: Puck
  };

  // 為替レート（概算: 1 USD = 155 JPY）
  const USD_JPY_RATE = 155;

  // 100万トークンあたりの公式標準料金（USD）
  const PRICING = {
    // テキスト解析用 (gemini-3.8-flash)
    text: {
      promptPerM: 0.75,     // $0.75 / 100万入力トークン
      candidatePerM: 3.75   // $3.75 / 100万出力トークン
    },
    // 音声TTS用モデル
    tts: {
      'gemini-3.8-flash-tts': {
        promptPerM: 0.75,     // $0.75 / 100万入力トークン
        audioPerM: 9.00       // $9.00 / 100万音声トークン
      },
      'gemini-3.8-flash-lite-tts': {
        promptPerM: 0.375,    // $0.375 / 100万入力トークン
        audioPerM: 4.50       // $4.50 / 100万音声トークン
      },
      'gemini-2.5-flash-preview-tts': {
        promptPerM: 0.75,     // $0.75 / 100万入力トークン
        audioPerM: 10.00      // $10.00 / 100万音声トークン
      },
      default: {
        promptPerM: 0.75,
        audioPerM: 9.00
      }
    }
  };

  // DOM要素の参照
  const elements = {
    apiKeyInput: document.getElementById('apiKeyInput'),
    toggleApiKeyBtn: document.getElementById('toggleApiKeyBtn'),
    modelSelect: document.getElementById('modelSelect'),
    customModelInput: document.getElementById('customModelInput'),
    voiceSelect: document.getElementById('voiceSelect'),
    chineseTextInput: document.getElementById('chineseTextInput'),
    clearTextBtn: document.getElementById('clearTextBtn'),
    generateBtn: document.getElementById('generateBtn'),
    statusText: document.getElementById('statusText'),
    statusSpinner: document.getElementById('statusSpinner'),
    
    // 使用状況表示
    statCurrentTokens: document.getElementById('statCurrentTokens'),
    statCurrentCost: document.getElementById('statCurrentCost'),
    statTotalTokens: document.getElementById('statTotalTokens'),
    statTotalCost: document.getElementById('statTotalCost'),
    statTotalCalls: document.getElementById('statTotalCalls'),
    resetStatsBtn: document.getElementById('resetStatsBtn'),

    // 結果表示エリア
    resultContainer: document.getElementById('resultContainer'),
    audioPlayer: document.getElementById('audioPlayer'),
    downloadBtn: document.getElementById('downloadBtn'),
    fileSizeText: document.getElementById('fileSizeText'),
    displayChinese: document.getElementById('displayChinese'),
    displayPinyin: document.getElementById('displayPinyin'),
    displayTranslation: document.getElementById('displayTranslation')
  };

  // アプリケーション状態
  let currentAudioBlob = null;
  let currentAudioUrl = null;

  /**
   * 金額の概算計算（USDおよびJPY）
   */
  function calculateCost(analysisUsage = {}, ttsUsage = {}, ttsModel = 'gemini-3.8-flash-tts') {
    const textRates = PRICING.text;
    const ttsRates = PRICING.tts[ttsModel] || PRICING.tts.default;

    const textPromptTokens = analysisUsage.promptTokenCount || 0;
    const textCandidateTokens = analysisUsage.candidatesTokenCount || 0;
    const ttsPromptTokens = ttsUsage.promptTokenCount || 0;
    const ttsAudioTokens = ttsUsage.candidatesTokenCount || 0;

    const textCostUsd = (textPromptTokens * textRates.promptPerM + textCandidateTokens * textRates.candidatePerM) / 1000000;
    const ttsCostUsd = (ttsPromptTokens * ttsRates.promptPerM + ttsAudioTokens * ttsRates.audioPerM) / 1000000;

    const totalUsd = textCostUsd + ttsCostUsd;
    const totalJpy = totalUsd * USD_JPY_RATE;

    return { totalUsd, totalJpy };
  }

  /**
   * 金額を読みやすくフォーマット
   */
  function formatCost(jpy, usd) {
    if (!jpy || jpy === 0) {
      return '約¥0.00';
    }
    if (jpy < 0.01) {
      return `約¥${jpy.toFixed(3)} ($${usd.toFixed(4)})`;
    }
    return `約¥${jpy.toFixed(2)} ($${usd.toFixed(4)})`;
  }

  /**
   * 初期化処理
   */
  function init() {
    loadSettings();
    loadStats();
    attachEventListeners();
  }

  /**
   * 保存された設定を復元
   */
  function loadSettings() {
    const savedKey = localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    elements.apiKeyInput.value = savedKey;

    let savedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || DEFAULT_CONFIG.model;
    // 廃止された旧モデルや非TTSモデル名が保存されていた場合は最新のgemini-3.8-flash-ttsに更新
    if (savedModel === 'gemini-2.0-flash' || savedModel === 'gemini-3.8-flash' || savedModel === 'gemini-2.5-flash-preview-tts') {
      savedModel = 'gemini-3.8-flash-tts';
      localStorage.setItem(STORAGE_KEYS.MODEL, savedModel);
    }
    const modelOptions = Array.from(elements.modelSelect.options).map(o => o.value);
    if (modelOptions.includes(savedModel)) {
      elements.modelSelect.value = savedModel;
      elements.customModelInput.classList.add('u-hidden');
    } else {
      elements.modelSelect.value = 'custom';
      elements.customModelInput.value = savedModel;
      elements.customModelInput.classList.remove('u-hidden');
    }

    const savedVoice = localStorage.getItem(STORAGE_KEYS.VOICE) || DEFAULT_CONFIG.voice;
    elements.voiceSelect.value = savedVoice;
  }

  /**
   * 使用状況（トークン統計・累積金額）を復元
   */
  function loadStats() {
    try {
      const statsJson = localStorage.getItem(STORAGE_KEYS.STATS);
      const stats = statsJson ? JSON.parse(statsJson) : { totalTokens: 0, totalCalls: 0, totalUsd: 0, totalJpy: 0 };
      elements.statTotalTokens.textContent = Number(stats.totalTokens || 0).toLocaleString();
      elements.statTotalCalls.textContent = Number(stats.totalCalls || 0).toLocaleString();
      if (elements.statTotalCost) {
        elements.statTotalCost.textContent = formatCost(stats.totalJpy || 0, stats.totalUsd || 0);
      }
    } catch {
      elements.statTotalTokens.textContent = '0';
      elements.statTotalCalls.textContent = '0';
      if (elements.statTotalCost) {
        elements.statTotalCost.textContent = '約¥0.00';
      }
    }
  }

  /**
   * 使用状況の加算保存（トークン数と金額）
   */
  function recordUsage(tokenCount, costObj) {
    try {
      const statsJson = localStorage.getItem(STORAGE_KEYS.STATS);
      const stats = statsJson ? JSON.parse(statsJson) : { totalTokens: 0, totalCalls: 0, totalUsd: 0, totalJpy: 0 };
      stats.totalTokens = (stats.totalTokens || 0) + tokenCount;
      stats.totalCalls = (stats.totalCalls || 0) + 1;
      stats.totalUsd = (stats.totalUsd || 0) + (costObj.totalUsd || 0);
      stats.totalJpy = (stats.totalJpy || 0) + (costObj.totalJpy || 0);

      localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));

      elements.statCurrentTokens.textContent = Number(tokenCount).toLocaleString();
      if (elements.statCurrentCost) {
        elements.statCurrentCost.textContent = formatCost(costObj.totalJpy, costObj.totalUsd);
      }
      elements.statTotalTokens.textContent = Number(stats.totalTokens).toLocaleString();
      if (elements.statTotalCost) {
        elements.statTotalCost.textContent = formatCost(stats.totalJpy, stats.totalUsd);
      }
      elements.statTotalCalls.textContent = Number(stats.totalCalls).toLocaleString();
    } catch (e) {
      console.warn('使用統計の更新に失敗しました:', e);
    }
  }

  /**
   * イベントリスナーの登録
   */
  function attachEventListeners() {
    // APIキー保存
    elements.apiKeyInput.addEventListener('input', () => {
      localStorage.setItem(STORAGE_KEYS.API_KEY, elements.apiKeyInput.value.trim());
    });

    // APIキーの表示・非表示切り替え
    elements.toggleApiKeyBtn.addEventListener('click', () => {
      const isPassword = elements.apiKeyInput.type === 'password';
      elements.apiKeyInput.type = isPassword ? 'text' : 'password';
      elements.toggleApiKeyBtn.textContent = isPassword ? '非表示' : '表示';
    });

    // モデル切り替え
    elements.modelSelect.addEventListener('change', () => {
      if (elements.modelSelect.value === 'custom') {
        elements.customModelInput.classList.remove('u-hidden');
        elements.customModelInput.focus();
        localStorage.setItem(STORAGE_KEYS.MODEL, elements.customModelInput.value.trim());
      } else {
        elements.customModelInput.classList.add('u-hidden');
        localStorage.setItem(STORAGE_KEYS.MODEL, elements.modelSelect.value);
      }
    });

    // カスタムモデル入力
    elements.customModelInput.addEventListener('input', () => {
      localStorage.setItem(STORAGE_KEYS.MODEL, elements.customModelInput.value.trim());
    });

    // 声の種類切り替え
    elements.voiceSelect.addEventListener('change', () => {
      localStorage.setItem(STORAGE_KEYS.VOICE, elements.voiceSelect.value);
    });

    // テキスト一括クリアボタン
    elements.clearTextBtn.addEventListener('click', () => {
      elements.chineseTextInput.value = '';
      elements.chineseTextInput.focus();
    });

    // 統計リセットボタン
    if (elements.resetStatsBtn) {
      elements.resetStatsBtn.addEventListener('click', () => {
        if (confirm('トークン統計および金額カウントをリセットしますか？')) {
          localStorage.removeItem(STORAGE_KEYS.STATS);
          elements.statCurrentTokens.textContent = '0';
          if (elements.statCurrentCost) elements.statCurrentCost.textContent = '約¥0.00';
          loadStats();
        }
      });
    }

    // 生成ボタン押下
    elements.generateBtn.addEventListener('click', handleGenerate);

    // ダウンロードボタン押下
    elements.downloadBtn.addEventListener('click', handleDownload);
  }

  /**
   * 現在選択中のモデル名を取得
   */
  function getSelectedModel() {
    if (elements.modelSelect.value === 'custom') {
      const custom = elements.customModelInput.value.trim();
      return custom || 'gemini-3.8-flash-tts';
    }
    return elements.modelSelect.value;
  }

  /**
   * ステータス表示の更新
   */
  function setStatus(text, isLoading = false) {
    elements.statusText.textContent = text;
    if (isLoading) {
      elements.statusSpinner.classList.remove('u-hidden');
      elements.generateBtn.disabled = true;
    } else {
      elements.statusSpinner.classList.add('u-hidden');
      elements.generateBtn.disabled = false;
    }
  }

  /**
   * 音声生成およびテキスト解析の主処理
   */
  async function handleGenerate() {
    const apiKey = elements.apiKeyInput.value.trim();
    if (!apiKey) {
      alert('Gemini APIキーを入力してください。\n（APIキーはブラウザ内にのみ保存され、外部送信されません）');
      elements.apiKeyInput.focus();
      return;
    }

    const text = elements.chineseTextInput.value.trim();
    if (!text) {
      alert('台湾華語の文章を入力または貼り付けてください。');
      elements.chineseTextInput.focus();
      return;
    }

    const model = getSelectedModel();
    const voice = elements.voiceSelect.value;

    try {
      setStatus('テキスト解析と音声を生成中...', true);
      elements.resultContainer.classList.add('u-hidden');

      // 1. テキスト解析（繁体字・ピンイン・日本語訳）と 2. 音声生成(TTS) を並列処理
      const [analysisResult, ttsResult] = await Promise.all([
        fetchTextAnalysis(apiKey, text),
        fetchTtsAudio(apiKey, model, voice, text)
      ]);

      setStatus('軽量MP3のエンコード中...', true);

      // Web Audio APIで音声データをデコード
      const audioBuffer = await decodeAudioData(ttsResult.audioBuffer);

      // lamejs で軽量MP3（64kbps モノラル）にエンコード
      const mp3ArrayBuffer = await encodeToMp3(audioBuffer, 64);

      setStatus('歌詞情報（ピンイン・訳）を埋め込み中...', true);

      // ID3v2タグ（USLT歌詞フレーム）の埋め込み
      const lyricsText = [
        '【台湾華語】',
        analysisResult.chinese,
        '',
        '【拼音】',
        analysisResult.pinyin,
        '',
        '【日本語訳】',
        analysisResult.translation
      ].join('\n');

      const taggedMp3Blob = embedId3Lyrics(mp3ArrayBuffer, {
        title: analysisResult.chinese.slice(0, 30),
        artist: 'Gemini TTS (台湾華語)',
        lyrics: lyricsText
      });

      // 状態を保持しオーディオプレーヤーと表示を更新
      if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
      }
      currentAudioBlob = taggedMp3Blob;
      currentAudioUrl = URL.createObjectURL(taggedMp3Blob);

      elements.audioPlayer.src = currentAudioUrl;
      elements.displayChinese.textContent = analysisResult.chinese;
      elements.displayPinyin.textContent = analysisResult.pinyin;
      elements.displayTranslation.textContent = analysisResult.translation;

      // ファイルサイズ表示（KB単位）
      const sizeKb = (taggedMp3Blob.size / 1024).toFixed(1);
      elements.fileSizeText.textContent = `サイズ: 約 ${sizeKb} KB (軽量MP3 / 歌詞タグ付)`;

      elements.resultContainer.classList.remove('u-hidden');

      // トークン使用量と概算金額を合算して記録
      const totalTokens = (analysisResult.tokens || 0) + (ttsResult.tokens || 0);
      const costObj = calculateCost(analysisResult.usage, ttsResult.usage, ttsResult.ttsModel);
      recordUsage(totalTokens, costObj);

      setStatus('生成が完了しました！');
    } catch (err) {
      console.error('処理エラー:', err);
      let message = err.message || '生成中にエラーが発生しました。';
      if (message.includes('429')) {
        message = 'APIクォータ制限（レートリミット: 429）に達しました。しばらく待ってから再試行してください。';
      } else if (message.includes('400') || message.includes('API_KEY_INVALID')) {
        message = 'APIキーが無効であるか、選択したモデルが対応していません。APIキーおよびモデル名をご確認ください。';
      }
      setStatus(`エラー: ${message}`);
      alert(`エラーが発生しました:\n${message}`);
    }
  }

  /**
   * Gemini APIでテキスト解析（ピンイン・日本語訳）を取得
   */
  async function fetchTextAnalysis(apiKey, text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

    const prompt = `あなたは台湾華語（台湾の繁体字中国語）の専門教師です。
以下の文章について、台湾現地で一般的に用いられる繁体字、台湾の発音に基づく声調符号付きピンイン(漢語拼音)、および自然な日本語訳を作成してください。
必ず以下のJSONフォーマットのみを返してください。マークダウンの\`\`\`jsonブロックなどで囲まず、プレーンなJSONオブジェクトのみを出力してください。

{"chinese": "繁体字テキスト", "pinyin": "ピンイン（声調記号付き）", "translation": "自然な日本語訳"}

対象文章:
${text}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      throw new Error(`テキスト解析APIエラー (${response.status}): ${errorJson.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const usage = data.usageMetadata || {};
    const tokens = usage.totalTokenCount || 0;

    let parsed = {
      chinese: text,
      pinyin: '',
      translation: ''
    };

    try {
      parsed = JSON.parse(candidateText.trim());
    } catch {
      parsed.translation = candidateText || '';
    }

    return {
      chinese: parsed.chinese || text,
      pinyin: parsed.pinyin || '',
      translation: parsed.translation || '',
      tokens,
      usage
    };
  }

  /**
   * Gemini APIのAudioモダリティ(TTS)で音声バイナリを取得
   */
  async function fetchTtsAudio(apiKey, model, voiceName, text) {
    // モデル名が通常のgemini-3.8-flash等の場合はTTSモデル名に正規化
    let ttsModel = model;
    if (ttsModel === 'gemini-3.8-flash') {
      ttsModel = 'gemini-3.8-flash-tts';
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `以下の台湾華語（繁体字）を、標準的な台湾華語の自然な発音と適切なスピードで明瞭に読み上げてください:\n\n${text}`
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName
            }
          }
        }
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      throw new Error(`音声生成APIエラー (${response.status}): ${errorJson.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find(p => p.inlineData && p.inlineData.data);

    if (!audioPart) {
      const textPart = parts.find(p => p.text);
      const detail = textPart ? ` (モデル返却テキスト: ${textPart.text.slice(0, 100)})` : '';
      throw new Error(`APIから音声データが返されませんでした。(モデル: ${ttsModel})${detail}。TTS対応モデル(gemini-3.8-flash-tts)が有効かご確認ください。`);
    }

    const base64Audio = audioPart.inlineData.data;
    const mimeType = audioPart.inlineData.mimeType || 'audio/wav';
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const usage = data.usageMetadata || {};
    const tokens = usage.totalTokenCount || 0;

    return {
      audioBuffer: bytes.buffer,
      mimeType,
      tokens,
      usage,
      ttsModel
    };
  }

  /**
   * Web Audio APIによる音声デコード
   */
  async function decodeAudioData(arrayBuffer) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();

    try {
      // 標準WAV/OGG等のデコード
      return await ctx.decodeAudioData(arrayBuffer.slice(0));
    } catch {
      // もしヘッダーなしRAW PCM (24kHz, 16bit, mono) だった場合のフォールバック
      const int16 = new Int16Array(arrayBuffer);
      const audioBuf = ctx.createBuffer(1, int16.length, 24000);
      const channelData = audioBuf.getChannelData(0);
      for (let i = 0; i < int16.length; i++) {
        channelData[i] = int16[i] / 32768.0;
      }
      return audioBuf;
    } finally {
      if (ctx.state !== 'closed') {
        ctx.close();
      }
    }
  }

  /**
   * lamejs を使用して軽量モノラルMP3へエンコード
   */
  async function encodeToMp3(audioBuffer, kbps = 64) {
    if (typeof lamejs === 'undefined') {
      throw new Error('MP3エンコーダ(lamejs)の読み込みに失敗しました。インターネット接続を確認してください。');
    }

    const sampleRate = audioBuffer.sampleRate;
    const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, kbps);

    // モノラルチャンネルを取得
    const floatSamples = audioBuffer.getChannelData(0);
    const sampleCount = floatSamples.length;
    const int16Samples = new Int16Array(sampleCount);

    // Float32 [-1.0, 1.0] から Int16 [-32768, 32767] へ変換
    for (let i = 0; i < sampleCount; i++) {
      const s = Math.max(-1, Math.min(1, floatSamples[i]));
      int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    const mp3Chunks = [];
    const chunkSize = 1152; // MP3フレームサンプルサイズ

    for (let i = 0; i < int16Samples.length; i += chunkSize) {
      const chunk = int16Samples.subarray(i, i + chunkSize);
      const mp3buf = mp3encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) {
        mp3Chunks.push(mp3buf);
      }
    }

    const finishBuf = mp3encoder.flush();
    if (finishBuf.length > 0) {
      mp3Chunks.push(finishBuf);
    }

    // 全チャンクを結合して単一のArrayBufferを作成
    const totalLength = mp3Chunks.reduce((acc, cur) => acc + cur.length, 0);
    const resultBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of mp3Chunks) {
      resultBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    return resultBuffer.buffer;
  }

  /**
   * ID3v2タグ（歌詞USLTフレーム）の埋め込み
   */
  function embedId3Lyrics(mp3ArrayBuffer, metadata) {
    // browser-id3-writer が利用可能な場合はこれを使用
    if (typeof ID3Writer !== 'undefined') {
      try {
        const writer = new ID3Writer(mp3ArrayBuffer);
        writer.setFrame('TIT2', metadata.title || '台湾華語 音声')
              .setFrame('TPE1', [metadata.artist || 'Gemini TTS'])
              .setFrame('USLT', {
                description: 'Taiwan Chinese / Pinyin / Japanese',
                lyrics: metadata.lyrics,
                language: 'zho'
              });
        writer.addTag();
        return writer.getBlob();
      } catch (err) {
        console.warn('browser-id3-writer での埋め込みに失敗したためフォールバックを使用します:', err);
      }
    }

    // フォールバック: ピュアJavaScriptによるID3v2.3 USLTタグ生成
    return createId3TaggedBlob(mp3ArrayBuffer, metadata);
  }

  /**
   * フォールバック用: ID3v2.3 USLTタグ手動エンコード
   */
  function createId3TaggedBlob(mp3Buffer, { title, artist, lyrics }) {
    const encodeUtf16 = (str) => {
      const buf = new Uint8Array(2 + str.length * 2);
      buf[0] = 0xFF; // BOM
      buf[1] = 0xFE;
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        buf[2 + i * 2] = code & 0xFF;
        buf[3 + i * 2] = (code >> 8) & 0xFF;
      }
      return buf;
    };

    // USLT フレーム作成: Encoding(1byte: 0x01 UTF-16) + Language(3byte: "zho") + ContentDescriptor(BOM+null: 2+2=4byte) + Lyrics(UTF-16)
    const lyricsUtf16 = encodeUtf16(lyrics);
    const usltData = new Uint8Array(1 + 3 + 4 + lyricsUtf16.length);
    usltData[0] = 0x01; // UTF-16 with BOM
    usltData[1] = 0x7A; // 'z'
    usltData[2] = 0x68; // 'h'
    usltData[3] = 0x6F; // 'o'
    usltData[4] = 0xFF; // BOM for empty description
    usltData[5] = 0xFE;
    usltData[6] = 0x00; // null terminator (UTF-16)
    usltData[7] = 0x00;
    usltData.set(lyricsUtf16, 8);

    const makeFrame = (id, data) => {
      const frame = new Uint8Array(10 + data.length);
      for (let i = 0; i < 4; i++) {
        frame[i] = id.charCodeAt(i);
      }
      const len = data.length;
      frame[4] = (len >> 24) & 0xFF;
      frame[5] = (len >> 16) & 0xFF;
      frame[6] = (len >> 8) & 0xFF;
      frame[7] = len & 0xFF;
      frame[8] = 0x00; // flags
      frame[9] = 0x00;
      frame.set(data, 10);
      return frame;
    };

    const usltFrame = makeFrame('USLT', usltData);
    const tagSize = usltFrame.length;

    // ID3v2 ヘッダー (10 bytes)
    const header = new Uint8Array(10);
    header[0] = 0x49; // 'I'
    header[1] = 0x44; // 'D'
    header[2] = 0x33; // '3'
    header[3] = 0x03; // version 2.3
    header[4] = 0x00; // revision
    header[5] = 0x00; // flags
    // Synchsafe integer size (7 bits per byte)
    header[6] = (tagSize >> 21) & 0x7F;
    header[7] = (tagSize >> 14) & 0x7F;
    header[8] = (tagSize >> 7) & 0x7F;
    header[9] = tagSize & 0x7F;

    return new Blob([header, usltFrame, mp3Buffer], { type: 'audio/mp3' });
  }

  /**
   * MP3ダウンロード処理
   */
  function handleDownload() {
    if (!currentAudioBlob) {
      alert('ダウンロード可能な音声がありません。先に音声を生成してください。');
      return;
    }

    const text = elements.chineseTextInput.value.trim();
    const safeTitle = text.slice(0, 15).replace(/[\\/:*?"<>|]/g, '_') || 'taiwan_chinese';
    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `${safeTitle}_${timestamp}.mp3`;

    const a = document.createElement('a');
    a.href = currentAudioUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // 初期化実行
  document.addEventListener('DOMContentLoaded', init);
})();
