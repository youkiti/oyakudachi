/**
 * DocFeedbackBatch.gs  —  v2025‑04‑19d  （Flag 列なし・タイムスタンプのみ判定版）
 *
 * このスクリプトは指定されたGoogle Driveフォルダ内のGoogle Docsファイル（レポート）を監視し、
 * 新規作成や更新があった文書に対して自動的にClaudeを用いたフィードバックコメントを追加します。
 * フィードバック状況を管理するためのスプレッドシートを自動作成し、処理状況を記録します。
 * 
 * ─ 必要なスクリプトプロパティ ────────────────────────────────
 * - FOLDER_ID: 監視するGoogle DriveフォルダのID（必須）
 * - SHEET_ID: フィードバック管理用スプレッドシートのID（未設定時は自動作成）
 * - API_KEY: Claude APIキー（必須、Anthropic APIから取得）
 *
 * ─ スクリプトプロパティの設定方法 ────────────────────────────────
 * 1. スクリプトエディタで「ファイル」→「プロジェクトのプロパティ」→「スクリプトプロパティ」を選択
 * 2. 「行を追加」ボタンをクリックし、以下のプロパティを設定：
 *    - プロパティ: FOLDER_ID、値: フォルダのID（URLの「folders/」以降の部分）
 *    - プロパティ: API_KEY、値: Anthropic APIから取得したClaudeのAPIキー
 * 3. 「保存」ボタンをクリック
 * 4. SHEET_IDは最初の実行時に自動生成されるため、初期設定では不要
 *
 * ─ 管理スプレッドシート列構成 ────────────────────────────────
 *  A  Doc ID         → Google Docファイルの一意識別子
 *  B  File Name      → ファイル名（表示用）
 *  C  Last Feedback Time   ← 空欄なら必ずフィードバック、日時が入っていれば更新時のみフィードバック
 */

function runBatchFeedback() {
  const props  = PropertiesService.getScriptProperties();
  const folder = DriveApp.getFolderById(validOrThrow(props.getProperty('FOLDER_ID'), 'FOLDER_ID'));
  const sheet  = getOrCreateSheet(folder);
  const map    = buildRecordMap(sheet);                // 既存行をマップ化

  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() !== MimeType.GOOGLE_DOCS) continue;

    const docId       = file.getId();
    const name        = file.getName();
    const lastUpdated = file.getLastUpdated();

    /* ─ 新規ドキュメント行を追加 ─ */
    if (!map[docId]) {
      sheet.appendRow([docId, name, '']);              // C=空欄
      map[docId] = { row: sheet.getLastRow(), lastFeedback: null };
    }

    const rec = map[docId];
    const needsComment =
          rec.lastFeedback === null                    // 1回目（C 空欄）
          || lastUpdated > rec.lastFeedback;           // 2回目以降で更新あり

    if (needsComment) {
      const feedback = generateFeedback(getDocText(docId));
      appendFeedback(docId, feedback);                 // Doc へ追記

      const newStamp = DriveApp.getFileById(docId).getLastUpdated();
      sheet.getRange(rec.row, 3).setValue(newStamp);  // C列を更新
    }
  }
}

/* ───────── ヘルパ ───────── */
function getOrCreateSheet(folder) {
  const props   = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('SHEET_ID');
  let   ss;

  if (sheetId) {
    ss = SpreadsheetApp.openById(sheetId);
  } else {
    ss = SpreadsheetApp.create('Doc Feedback Control');
    const file = DriveApp.getFileById(ss.getId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
    ss.getSheets()[0].appendRow(['Doc ID','File Name','Last Feedback Time']);
    props.setProperty('SHEET_ID', ss.getId());
  }
  return ss.getSheets()[0];
}

function buildRecordMap(sheet) {
  const data = sheet.getDataRange().getValues();
  const map  = {};
  for (let i = 1; i < data.length; i++) {
    const [id,, stamp] = data[i];
    map[id] = {
      row:          i + 1,
      lastFeedback: stamp instanceof Date ? stamp : null
    };
  }
  return map;
}

function getDocText(id) {
  return DocumentApp.openById(id).getBody().getText();
}

function appendFeedback(id, text) {
  const doc   = DocumentApp.openById(id);
  const body  = doc.getBody();
  const now   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  body.appendParagraph(`[Claudeによるコメント ${now}]`)
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(text);
  doc.saveAndClose();
}

function generateFeedback(docText) {
  const systemPrompt = '<?xml version="1.0"?>\n<prompt>…（略）</prompt>'; // ← 適宜差し替え
  const userPrompt   = `${systemPrompt}\n\n<document>\n${docText}\n</document>`;
  return callClaude(userPrompt, 'quality-check');
}

function validOrThrow(v, k) {
  if (!v) throw new Error(`Property ${k} missing`);
  return v;
}

/* ───────── Claude caller (unchanged) ───────── */
let API_KEY = null;
function callClaude(prompt, mode = 'challenge') {
  const apiUrl = 'https://api.anthropic.com/v1/messages';
  if (!API_KEY) {
    API_KEY = PropertiesService.getScriptProperties().getProperty('API_KEY');
    if (!API_KEY) throw new Error('API_KEY not set in Script Properties');
  }

const systemMessage = mode === 'quality-check'
    ? `<?xml version="1.0"?>
<prompt>
    <role>症例レポート作成支援AIアシスタント</role>
    <task>医学生や研修医が作成する症例レポートの質を向上させるためのアドバイスの提供</task>
    <guidelines>
        <category>基本的記載</category>
        <instructions>
            <instruction>病歴要約の記述が作成の手引きに従っているか確認</instruction>
            <instruction>誤字・脱字、検査データ等の転記ミス、単位の間違い、文章表現の誤りがないか確認</instruction>
            <instruction>医学的不整合性、基本的誤りまたは不備がないか確認</instruction>
            <instruction>患者個人情報や紹介元病院の情報が匿名化されているか確認</instruction>
            <instruction>レポートが適切な分量に収まっているか確認</instruction>
        </instructions>
        <category>症例選択の適切さ</category>
        <instructions>
            <instruction>主病名が提出分野に適しているか確認</instruction>
        </instructions>
        <category>診断プロセスの適切さ</category>
        <instructions>
            <instruction>現病歴の聴取が陰性所見も含めて十分か確認</instruction>
            <instruction>経過や身体診察が十分に記載されているか確認</instruction>
            <instruction>必要な検査や画像所見が十分に記載されているか確認</instruction>
            <instruction>鑑別診断が十分に言及されているか確認</instruction>
            <instruction>診断名が適切か確認</instruction>
        </instructions>
        <category>治療法の適切さ</category>
        <instructions>
            <instruction>治療薬は一般名で記載されているか確認</instruction>
            <instruction>適切な治療法であるか確認</instruction>
            <instruction>入院後の経過や治療が適切に記載されているか確認</instruction>
        </instructions>
        <category>考察の十分さ</category>
        <instructions>
            <instruction>EBMが重視され、適切な文献が引用されているか確認</instruction>
            <instruction>考察が妥当な長さで論理的か確認</instruction>
        </instructions>
        <category>倫理的妥当性</category>
        <instructions>
            <instruction>患者の人権、希望、社会的背景に配慮されているか確認</instruction>
        </instructions>
        <category>レポートの構成</category>
        <instructions>
            <instruction>レポートが指定の順序で構成されているか確認</instruction>
        </instructions>
        <category>良い例と悪い例の差分</category>
        <instructions>
            <instruction>病歴や検査結果の詳細さ、鑑別診断や考察の深さ、引用文献の正確さ、患者背景への配慮を確認</instruction>
        </instructions>
        <category>検査所見の書き方</category>
        <instructions>
            <instruction>数値と単位の間に半角スペースが挿入されているか確認</instruction>
            <instruction>複数の項目がカンマで適切に区切られているか確認</instruction>
            <instruction>小数点以下の桁数が統一されているか確認</instruction>
        </instructions>
        <category>改善提案</category>
        <instructions>
            <instruction>レポートの強みを指摘し、改善が必要な点に対する具体的な提案を提供</instruction>
        </instructions>
    </guidelines>
    <adviceStructure>
        <positivePoints>{良かった点}</positivePoints>
        <copyPaste>{改善箇所のコピペ}</copyPaste>
        <improvementPoints>{改善ポイント}</improvementPoints>
    </adviceStructure>
    <note>
        <reminder>このアシスタントはアドバイスを提供するものであり、最終的な判断や責任は医療専門家にあることを伝える</reminder>
        <reminder>症例レポートは症例の記録だけでなく、患者から学び取れる教訓や考察を示すことが重要であると強調</reminder>
    </note>
</prompt>`
    : 'あなたは内科専門医です。ユーザーの入力したレポートへのフィードバックを行ってください。症例の概略と自己省察だけのものについては、そういう様式なので追加情報よりもロジックに対する評価を重点的に行なってください';

  const payload = {
    model:      "claude-3-7-sonnet-20250219",
    max_tokens: 30000,
    temperature: 1,
    thinking: {
    "type": "enabled",
    "budget_tokens": 7000},
    system:     systemMessage,
    messages:   [{ role: 'user', content: prompt }]
  };
  const options = {
    method: 'post',
    headers: {
      'x-api-key':          API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type':       'application/json'
    },
    payload: JSON.stringify(payload)
  };

  try {
    const res = UrlFetchApp.fetch(apiUrl, options);
    const parsedResponse = JSON.parse(res.getContentText());
    
    // 変更点: content配列から適切なテキスト要素を探す
    if (parsedResponse.content && Array.isArray(parsedResponse.content)) {
      // content配列内のtextタイプの要素を探す
      for (const item of parsedResponse.content) {
        if (item.type === 'text' && item.text) {
          return item.text;
        }
      }
      // textタイプが見つからない場合は最初の要素のテキストを試みる
      if (parsedResponse.content[0] && parsedResponse.content[0].text) {
        return parsedResponse.content[0].text;
      }
    }
    
    // フォールバック: レスポンス全体を文字列化して返す
    return `API response structure changed: ${JSON.stringify(parsedResponse)}`;
  } catch (e) {
    return `Claude API error: ${e}`;
  }
}
