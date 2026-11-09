// =================================================================
// 準備するもの
// - Google driveのフォルダ内にpngもしくはpdfの論文ファイル
// - GeminiのAPIキー 
// 出力されるもの
// - 論文ファイル名、著者 year表記、ファイルURL、抽出データの入ったGoogle spreadsheet
// =================================================================

// =================================================================
// 設定項目
// =================================================================

// Google DriveのフォルダID
const FOLDER_ID = "YOUR_FOLDER_ID";

// Gemini APIキー propertyで渡すようにする
const geminiApiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');

// ★★★ 今後のモデルの進化にあわせて修正を ★★★
const MODEL_ID = "gemini-2.5-flash";
// 有料版APIキーを持っているなら　gemini-2.5-pro

// 結果を保存するスプレッドシートの固定名
const RESULT_SHEET_NAME = "ファイル情報抽出結果";


// =================================================================
// メインの処理関数
// =================================================================

/**
 * この関数を実行してください。
 * フォルダ内のファイルをリストアップし、未処理のファイルに対して情報抽出を行います。
 * 処理が中断されても、次回実行時に未処理の行から再開します。
 */
function mainProcess() {
  try {
    // 1. スプレッドシートの準備（新規作成または既存のものを取得）
    const sheet = setupSheet();
    
    // 2. C列までの初期データを投入（シートに未登録のファイルのみ）
    populateInitialData(sheet);
    
    // 3. 未処理の行をAPIで処理（時間制限あり）
    processPendingRows(sheet);
    
    Logger.log("今回の処理が完了しました。未処理の行が残っている場合は、再度この関数を実行してください。");

  } catch (e) {
    Logger.log(`致命的なエラーが発生しました: ${e.toString()}\n${e.stack}`);
    // ユーザーにエラーを通知
    SpreadsheetApp.getUi().alert(`処理が中断されました。エラー: ${e.toString()}`);
  }
}

// =================================================================
// フェーズ別処理関数
// =================================================================

/**
 * 結果を記録するスプレッドシートを準備または取得する関数
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} シートオブジェクト
 */
function setupSheet() {
  const targetFolder = DriveApp.getFolderById(FOLDER_ID);
  if (!targetFolder) {
    throw new Error(`指定されたフォルダIDが見つかりません: ${FOLDER_ID}`);
  }
  
  const files = targetFolder.getFilesByName(RESULT_SHEET_NAME);
  let spreadsheet;

  if (files.hasNext()) {
    // 既存のスプレッドシートを使用
    const file = files.next();
    spreadsheet = SpreadsheetApp.openById(file.getId());
    Logger.log(`既存のスプレッドシート「${RESULT_SHEET_NAME}」を使用します: ${spreadsheet.getUrl()}`);
  } else {
    // 新規作成
    spreadsheet = SpreadsheetApp.create(RESULT_SHEET_NAME);
    const ssFile = DriveApp.getFileById(spreadsheet.getId());
    targetFolder.addFile(ssFile);
    DriveApp.getRootFolder().removeFile(ssFile); // ルートフォルダから移動
    Logger.log(`スプレッドシート「${RESULT_SHEET_NAME}」を新規作成しました: ${spreadsheet.getUrl()}`);
  }
  
  const sheet = spreadsheet.getSheets()[0];
  
  // ヘッダー行がなければ作成
  if (sheet.getLastRow() < 1) {
    const headers = [
      "元のファイル名",             // A
      "提案ファイル名 (著者の姓 年)", // B
      "ファイルのURL",              // C
      "抽出データ",                // D
      "ファイル形式",               // E
      "処理ステータス",             // F
      "エラー情報"                // G
    ];
    sheet.appendRow(headers);
    sheet.getRange("A1:G1").setFontWeight("bold");
    sheet.setFrozenRows(1); // ヘッダー行を固定
  }
  
  return sheet;
}

/**
 * フェーズ1: フォルダ内のファイルをリストアップし、未登録のものをシートに追加する
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 結果を書き込むシートオブジェクト
 */
function populateInitialData(sheet) {
  Logger.log("フェーズ1: ファイルリストの更新を開始します。");
  const targetFolder = DriveApp.getFolderById(FOLDER_ID);
  
  // シートに既にあるファイルURLをSetに格納して高速チェック
  const existingUrls = new Set();
  if (sheet.getLastRow() > 1) {
    // C列（ファイルのURL）のデータを取得
    const urlColumn = sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).getValues();
    urlColumn.forEach(row => {
      if (row[0]) existingUrls.add(row[0]);
    });
  }
  
  const filesToAdd = [];
  const fileIterator = targetFolder.getFiles();
  
  while (fileIterator.hasNext()) {
    const file = fileIterator.next();
    const mimeType = file.getMimeType();
    
    // PNGとPDFのみ対象
    if (mimeType === MimeType.PNG || mimeType === MimeType.PDF) {
      const fileUrl = file.getUrl();
      // まだシートにないファイルのみ追加リストへ
      if (!existingUrls.has(fileUrl)) {
        const fileType = mimeType === MimeType.PNG ? "PNG" : "PDF";
        filesToAdd.push([
          file.getName(),
          "", // B: 提案ファイル名 (空)
          fileUrl,
          "", // D: risk of bias (空)
          fileType,
          "未処理", // F: 処理ステータス
          ""  // G: エラー情報 (空)
        ]);
        Logger.log(`新規ファイルを追加リストに登録: ${file.getName()}`);
      }
    }
  }
  
  // 新規ファイルがあれば一括でシートに書き込み
  if (filesToAdd.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, filesToAdd.length, filesToAdd[0].length).setValues(filesToAdd);
    Logger.log(`${filesToAdd.length}件の新規ファイルをリストに追加しました。`);
  } else {
    Logger.log("リストに追加する新規ファイルはありませんでした。");
  }
  
  SpreadsheetApp.flush();
}

/**
 * フェーズ2: シート上の「未処理」の行をAPIで処理する
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 処理対象のシートオブジェクト
 */
function processPendingRows(sheet) {
  Logger.log("フェーズ2: 未処理行のAPI処理を開始します。");
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const startTime = new Date();
  // 実行時間上限の少し手前で処理を止める (5分 = 300秒)
  const TIME_LIMIT_SECONDS = 300; 

  // ヘッダー行を除いてループ (i=1から)
  for (let i = 1; i < values.length; i++) {
    const rowData = values[i];
    const status = rowData[5]; // F列: 処理ステータス
    
    // 実行時間が迫ってきたら安全にループを抜ける
    const elapsedTime = (new Date() - startTime) / 1000;
    if (elapsedTime > TIME_LIMIT_SECONDS) {
      Logger.log(`実行時間が${TIME_LIMIT_SECONDS}秒に近づいたため、処理を中断します。次回実行時に再開されます。`);
      break;
    }

    if (status === "未処理") {
      const rowIndex = i + 1; // シート上の実際の行番号 (1-based)
      const fileName = rowData[0];
      const fileUrl = rowData[2];
      
      Logger.log(`処理中 (行 ${rowIndex}): ${fileName}`);
      
      try {
        // ステータスを「処理中」に更新し、多重実行を防止
        sheet.getRange(rowIndex, 6).setValue("処理中");
        SpreadsheetApp.flush();

        // URLからファイルIDを抽出し、ファイルオブジェクトを取得
        const fileId = fileUrl.match(/d\/(.+?)\//)[1];
        const file = DriveApp.getFileById(fileId);
        
        // Gemini APIを呼び出し
        const result = callGeminiApi(file);
        
        // 成功結果をシートに書き込み
        const resultRow = [
          result.suggestedName,     // B列
          result.handlingDescription, // D列
          "成功",                     // F列
          ""                          // G列
        ];
        sheet.getRange(rowIndex, 2).setValue(resultRow[0]); // B
        sheet.getRange(rowIndex, 4).setValue(resultRow[1]); // D
        sheet.getRange(rowIndex, 6).setValue(resultRow[2]); // F
        sheet.getRange(rowIndex, 7).setValue(resultRow[3]); // G
        
        Logger.log(`  -> 成功`);

      } catch (e) {
        Logger.log(`  -> エラー発生: ${e.message}`);
        // 失敗結果をシートに書き込み
        sheet.getRange(rowIndex, 6).setValue("失敗");
        sheet.getRange(rowIndex, 7).setValue(e.message.substring(0, 50000)); // セルの文字数制限対策
      }
      SpreadsheetApp.flush();
    }
  }
  
  // 最後に列幅を自動調整
  sheet.autoResizeColumns(1, sheet.getLastColumn());
}


/**
 * Gemini APIを呼び出してファイルから情報を抽出する関数
 * @param {GoogleAppsScript.Drive.File} file - 分析対象のファイルオブジェクト
 * @returns {{suggestedName: string, handlingDescription: string}} - 抽出された情報を含むオブジェクト
 */
function callGeminiApi(file) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${geminiApiKey}`;
  
  const fileBlob = file.getBlob();
  const base64Data = Utilities.base64Encode(fileBlob.getBytes());
  // ★★★★★★★★★★最重要ポイント　必要な変数については、Gemini等に書きなおしてもらう　★★★★★★★★★★★★★★★★
const promptText = `
  このファイル（PNG画像またはPDF）を分析してください。
  以下の情報を抽出し、指定された形式で出力してください。

  1. **ファイル名案:** ファイル内容から「著者の姓」と「発行年」を特定し、
     「著者の姓 年」という形式の文字列を作成してください。
     情報が見つからない場合は、見つかった情報だけを使うか
     「情報なし」としてください。（例: 「田中 2023」「不明 2023」
     「田中 不明」「情報なし」）

  2. **ROBINS-I に基づくmortalityのリスク・オブ・バイアス評価（7 ドメイン）:**
     各ドメインについて、次の 4 段階のいずれかで判定し、
     判定根拠（1～3 行）を添えてください。
       **Low risk / Moderate risk / Serious risk / Critical risk**

     **ドメイン一覧**
       D1  Bias due to confounding  
       D2  Bias in selection of participants  
       D3  Bias in classification of interventions  
       D4  Bias due to deviations from intended interventions  
       D5  Bias due to missing data  
       D6  Bias in measurement of outcomes  
       D7  Bias in selection of the reported result  

     ***欠損データへの言及が一切ない場合*** は  
       - D5 を **Serious risk** と判定し  
       - 根拠に「欠損データ処理に関する記述なし」と明記してください。

  3. **Overall 判定:** 7 ドメインのうち最も高い（＝最悪の）リスクレベルを
     そのまま Overall としてください。

  **【重要】出力形式（この形式を厳守してください）**
  \`\`\`
  [ファイル名案]|||D1:[判定]—[根拠]; D2:[判定]—[根拠]; ...; D7:[判定]—[根拠]|||Overall:[判定]
  \`\`\`

  **出力例1（すべて記述がある場合）**
  Sato 2022|||D1:Low—交絡は傾向スコアで調整しバランス良好; D2:Moderate—登録過程がやや不透明; D3:Low—介入分類は診療記録で確認; D4:Low—逸脱解析は ITT; D5:Low—多重代入と感度分析を実施; D6:Moderate—アウトカム測定者が盲検でない; D7:Low—解析計画通り報告|||Overall:Moderate

  **出力例2（欠損データの記述がない場合）**
  Tanaka 2023|||D1:Moderate—主要交絡の一部が未調整; D2:Low—全症例連続登録; D3:Low—介入は明確; D4:Low—実施ズレなし; D5:Serious—欠損データ処理に関する記述なし; D6:Low—客観的アウトカム; D7:Low—事前登録済み|||Overall:Serious
`;

  const requestBody = {
    "contents": [
      {
        "parts": [
          { "text": promptText },
          {
            "inlineData": {
              "mimeType": fileBlob.getContentType(),
              "data": base64Data
            }
          }
        ]
      }
    ],
    "generationConfig": {
       "temperature": 0,
       "maxOutputTokens": 40000, 
    }
  };

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(requestBody),
    'muteHttpExceptions': true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode !== 200) {
    throw new Error(`APIリクエスト失敗。ステータスコード: ${responseCode}, レスポンス: ${responseText}`);
  }

  const jsonResponse = JSON.parse(responseText);

  // ★★★ 変更点 ③ ★★★
  // より堅牢なエラーハンドリング
  if (!jsonResponse.candidates || jsonResponse.candidates.length === 0) {
    if (jsonResponse.promptFeedback && jsonResponse.promptFeedback.blockReason) {
      throw new Error(`APIエラー: プロンプトが安全性の設定によりブロックされました。理由: ${jsonResponse.promptFeedback.blockReason}`);
    }
    throw new Error(`APIからの予期しないレスポンス形式です（candidatesなし）。レスポンス: ${responseText}`);
  }
  
  const candidate = jsonResponse.candidates[0];

  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    let reasonMessage = `APIが正常に完了しませんでした。理由: ${candidate.finishReason}`;
    if (candidate.finishReason === 'MAX_TOKENS') {
      reasonMessage += '。解決策: generationConfigのmaxOutputTokensの値を大きくしてください。';
    } else if (candidate.finishReason === 'SAFETY') {
      reasonMessage += '。プロンプトやファイルの内容が安全性のポリシーに違反している可能性があります。';
    }
    throw new Error(reasonMessage);
  }
  
  if (!candidate.content || !candidate.content.parts || !candidate.content.parts[0] || !candidate.content.parts[0].text) {
    throw new Error(`APIからの予期しないレスポンス形式です（回答本文なし）。レスポンス: ${responseText}`);
  }
  
  const content = candidate.content.parts[0].text.trim().replace(/```/g, ''); // ```を削除
  
  const parts = content.split('|||');
  if (parts.length < 2) { // 少なくとも2つの部分があることを確認
    throw new Error(`APIの出力形式が不正です。期待したセパレーター'|||'が見つかりません。出力: ${content}`);
  }

  return {
    suggestedName: parts[0].trim(),
    // 2番目以降の部分を結合して返す（将来的に出力形式が変わっても対応しやすくするため）
    handlingDescription: parts.slice(1).join('|||').trim() 
  };
}
