/**
 * @OnlyCurrentDoc
 * GASで実行のこと
 */

// --- 定数設定 ---
// ※ 必要に応じて、スクリプトプロパティから取得するか直接設定してください。
const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY'); 
// ※ もしプロパティに設定していない場合は、下記のように直接代入してもよい
// const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE';

// 今回は処理対象フォルダのIDを取得
const PARENT_FOLDER_ID = PropertiesService.getScriptProperties().getProperty('PARENT_FOLDER_ID'); 

// Gemini APIで利用するモデル指定（必要に応じて変更）
const GEMINI_MODEL = 'gemini-2.5-pro-exp-03-25'; 


/**
 * メイン関数  
 * ・親フォルダ(PARENT_FOLDER_ID)の直下に、今日の日付（yyyyMMdd形式）のサブフォルダを作成  
 * ・そのサブフォルダ内に、シート名 [yyyyMM立て替え払い] のスプレッドシートを作成  
 * ・親フォルダ内にあるすべてのPDFファイルを対象に、Gemini API で処理を行い、結果をスプレッドシートへ記録  
 * ・同時に、処理済みPDFのファイル名を抽出結果の「研究費の使途 (Purpose)」に変更し、処理済みPDFは当該サブフォルダに移動
 */
function processAndArchivePdfs() {
  // APIキーのチェック
  if (!GEMINI_API_KEY) {
    Logger.log('エラー: GEMINI_API_KEY が設定されていません。');
    return;
  }

  // 親フォルダの取得
  let parentFolder;
  try {
    parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
  } catch (e) {
    Logger.log('エラー: ' + e.message);
    return;
  }

  // 1. 処理月フォルダ（例："202504"）の作成（既に存在する場合は再利用）
  const processFolderName = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMM");
  let processFolder;
  const folders = parentFolder.getFoldersByName(processFolderName);
  if (folders.hasNext()) {
    processFolder = folders.next();
    Logger.log(`既存のフォルダ "${processFolderName}" を使用します。`);
  } else {
    processFolder = parentFolder.createFolder(processFolderName);
    Logger.log(`新規フォルダ "${processFolderName}" を作成しました。`);
  }

  // 2. スプレッドシートの取得または作成  
  // シート名例： "202504立て替え払い" （年+月部分）
  const sheetName = processFolderName + "立て替え払い";
  let spreadsheet;
  let sheet;
  
  // 同一フォルダ内でシート名に一致するファイルを検索
  const ssFiles = processFolder.getFilesByName(sheetName);
  if (ssFiles.hasNext()) {
    // 既存のスプレッドシートがある場合
    const existingFile = ssFiles.next();
    spreadsheet = SpreadsheetApp.openById(existingFile.getId());
    sheet = spreadsheet.getSheets()[0];
    Logger.log(`既存のスプレッドシート "${sheetName}" を使用します。`);
    
    // ヘッダーの有無を確認し、無ければ追加（例：行数が0の場合）
    const expectedHeaders = [
      'ファイル名 (Filename)',
      '研究費の使途 (Purpose)',
      '請求日 (Billing Date)',
      '金額 (ドル) (Amount USD)',
      '金額 (円) (Amount JPY)',
      'API応答 (API Response)',
      'エラー (Error)',
      '実行日 (Execution Date)',
      '予算元',
      '課題番号'
    ];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(expectedHeaders);
      sheet.getRange(1, 1, 1, expectedHeaders.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
      Logger.log('ヘッダー行を追加しました。');
    }
  } else {
    // 新規作成
    spreadsheet = SpreadsheetApp.create(sheetName);
    Logger.log(`新しいスプレッドシート "${sheetName}" を作成しました。`);
    
    // 作成したスプレッドシートを処理フォルダに移動
    const ssFile = DriveApp.getFileById(spreadsheet.getId());
    processFolder.addFile(ssFile);
    DriveApp.getRootFolder().removeFile(ssFile);
    
    sheet = spreadsheet.getSheets()[0];
    const expectedHeaders = [
      'ファイル名 (Filename)',
      '研究費の使途 (Purpose)',
      '請求日 (Billing Date)',
      '金額 (ドル) (Amount USD)',
      '金額 (円) (Amount JPY)',
      'API応答 (API Response)',
      'エラー (Error)',
      '実行日 (Execution Date)',
      '予算元',
      '課題番号'
    ];
    sheet.appendRow(expectedHeaders);
    sheet.getRange(1, 1, 1, expectedHeaders.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
    Logger.log('ヘッダー行を追加しました。');
  }
  
    // 3. 親フォルダ内のPDFファイルを処理  
  const pdfFiles = parentFolder.getFilesByType(MimeType.PDF);
  let filesProcessedCount = 0;
  while (pdfFiles.hasNext()) {
    const file = pdfFiles.next();
    const originalName = file.getName();
    Logger.log(`処理中のファイル: ${originalName}`);
    
    // 行データの初期セットアップ
    const executionDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    // ※「研究費の使途」は仮セット（後でGemini APIの結果で上書き）
    const rowData = [originalName, '処理中...', '', '', '', '', '', executionDate, ''];
    // 既存シートでは appendRow で行を追加
    const currentRow = sheet.appendRow(rowData);
    const currentRowNum = sheet.getLastRow();
    
    try {
      // PDFのBlob取得
      const pdfBlob = file.getBlob();
      // Gemini APIへリクエストし、結果（JSON文字列）を取得
      const resultText = callGeminiApiWithPdf(pdfBlob);
      
      if (resultText) {
        // 結果のログ出力
        Logger.log(`${originalName} のAPI生レスポンス: ${resultText}`);
        // レスポンスから情報を抽出
        const extractedData = parseGeminiResponse(resultText);
        
        // シートに追記するための更新データ（ファイル名・実行日は既にセット済）
        const updateData = [
          extractedData.purpose,
          extractedData.date,
          extractedData.usdAmount,
          extractedData.jpyAmount,
          resultText.substring(0, 500), // 念のため生レスポンスの一部を記録
          '' // エラー列（成功時は空文字）
        ];
        // 2列目～7列目を更新
        sheet.getRange(currentRowNum, 2, 1, updateData.length).setValues([updateData]);
        
        // ファイル名を、抽出結果の「研究費の使途 (Purpose)」に変更（値が存在する場合）
        if (extractedData.purpose && extractedData.purpose !== "N/A") {
          file.setName(extractedData.purpose);
          Logger.log(`ファイル名を "${extractedData.purpose}" に変更しました。`);
        }
      } else {
        // API応答が得られなかった場合の処理
        sheet.getRange(currentRowNum, 2).setValue('APIから応答なし');
        sheet.getRange(currentRowNum, 7).setValue('APIから応答なし');
        Logger.log(`${originalName} についてAPI応答がありませんでした。`);
      }
      
      filesProcessedCount++;
      
    } catch (error) {
      Logger.log(`ファイル "${originalName}" の処理中にエラー発生: ${error.message}`);
      // エラー発生時は「研究費の使途」と「エラー」列に情報を記録
      sheet.getRange(currentRowNum, 2).setValue('エラー');
      sheet.getRange(currentRowNum, 7).setValue(`エラー: ${error.message}`);
    }
    
    // 移動処理: PDFファイルを処理フォルダへ追加し、親フォルダからは削除
    processFolder.addFile(file);
    parentFolder.removeFile(file);
    
    // APIのレート制限を避けるために短い遅延
    Utilities.sleep(1500);
  }
  
  // 列幅の自動調整（データがある場合のみ）
  if (filesProcessedCount > 0 && sheet.getLastRow() > 1) {
    try {
      sheet.autoResizeColumns(1, 9);
    } catch (resizeError) {
      Logger.log(`列幅自動調整でエラーが発生: ${resizeError}. 続行します。`);
    }
  }
  
  Logger.log(`${filesProcessedCount} 個のPDFを処理しました。`);
}


/**
 * PDFのBlobを用いてGemini APIを呼び出します（JSONモード）。
 * @param {Blob} pdfBlob PDFファイルのBlobオブジェクト
 * @return {string|null} GeminiからのJSON形式のテキストレスポンス。エラー時は例外を投げます。
 */
function callGeminiApiWithPdf(pdfBlob) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  // PDFデータをBase64にエンコード
  const pdfData = Utilities.base64Encode(pdfBlob.getBytes());
  
  // Geminiへのプロンプト（PDFの内容に基づき必要情報を抽出）
  const prompt = `
添付されたPDFの領収書/請求書を分析し、以下の情報を抽出してください:
1.  費用のサービス名 (例: "Claude Pro", "Posit", "OpenAI API")。利用可能な最も具体的な説明を使用してください。
2.  支払いが行われた日または請求書の日付 (YYYY-MM-DD形式が望ましい)。
3.  支払われた合計金額。通貨記号を含めた形式 (例: "$20.00"、"¥3000")。

指定スキーマに従い、見つからない情報は null にしてください。
`;

  // レスポンス用のスキーマ定義
  const responseSchema = {
    type: "OBJECT",
    properties: {
      purpose: { type: "STRING", description: "抽出された費用のサービス名", nullable: true },
      date: { type: "STRING", description: "抽出された請求日または支払日", nullable: true },
      amount_str: { type: "STRING", description: "抽出された合計金額文字列", nullable: true }
    }
  };
  
  // リクエストボディを作成
  const requestBody = {
    contents: [
      { parts: [ { text: prompt },
          { inline_data: { mime_type: 'application/pdf', data: pdfData } }
        ]
      }
    ],
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: responseSchema
    }
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true,
    escaping: false,
    validateHttpsCertificates: true
  };
  
  let response;
  try {
    response = UrlFetchApp.fetch(url, options);
  } catch (fetchError) {
    Logger.log(`UrlFetchApp.fetchエラー: ${fetchError.message}`);
    throw new Error(`APIへの接続に失敗しました: ${fetchError.message}`);
  }
  
  const responseCode = response.getResponseCode();
  const responseBody = response.getContentText();
  
  if (responseCode === 200) {
    let jsonResponse;
    try {
      jsonResponse = JSON.parse(responseBody);
    } catch (parseError) {
      Logger.log(`JSON解析エラー: ${parseError}. レスポンス: ${responseBody}`);
      throw new Error('APIレスポンスのJSON解析に失敗しました。');
    }
    
    if (jsonResponse.candidates && jsonResponse.candidates.length > 0 &&
        jsonResponse.candidates[0].content && jsonResponse.candidates[0].content.parts &&
        jsonResponse.candidates[0].content.parts.length > 0 &&
        jsonResponse.candidates[0].content.parts[0].text != null) {
      let textResult = jsonResponse.candidates[0].content.parts[0].text;
      textResult = textResult.trim();
      if (textResult.startsWith('{') && textResult.endsWith('}')) {
        return textResult;
      } else {
        Logger.log(`予期しないテキスト形式: ${textResult}`);
        throw new Error(`APIが期待しないテキスト形式を返しました: ${textResult.substring(0,100)}...`);
      }
    } else if (jsonResponse.promptFeedback && jsonResponse.promptFeedback.blockReason) {
      Logger.log(`APIブロック: ${jsonResponse.promptFeedback.blockReason}`);
      throw new Error(`API呼び出しがブロックされました: ${jsonResponse.promptFeedback.blockReason}`);
    } else {
      Logger.log(`不明なAPIレスポンス: ${responseBody}`);
      throw new Error('予期しないAPIレスポンス構造または空のコンテンツ。');
    }
  } else {
    Logger.log(`APIエラー: コード ${responseCode}, レスポンス: ${responseBody}`);
    let errorMessage = `APIリクエストがコード ${responseCode} で失敗しました。`;
    try {
      const errorJson = JSON.parse(responseBody);
      if (errorJson.error && errorJson.error.message) {
        errorMessage += ` メッセージ: ${errorJson.error.message}`;
      } else {
        errorMessage += ` レスポンス: ${responseBody}`;
      }
    } catch(e) {
      errorMessage += ` レスポンス: ${responseBody}`;
    }
    throw new Error(errorMessage);
  }
}


/**
 * GeminiからのJSONレスポンス文字列を解析します。  
 * @param {string} responseText Geminiが返したJSON形式の文字列  
 * @return {object} { purpose, date, usdAmount, jpyAmount } のオブジェクト
 */
function parseGeminiResponse(responseText) {
  let purpose = 'N/A';
  let date = 'N/A';
  let amountStr = null;
  let usdAmount = '';
  let jpyAmount = '';
  
  try {
    if (typeof responseText !== 'string' ||
        !responseText.trim().startsWith('{') ||
        !responseText.trim().endsWith('}')) {
      Logger.log(`parseGeminiResponseへ無効な入力: ${responseText}`);
      throw new Error("無効な入力: JSON文字列ではありません。");
    }
    
    const data = JSON.parse(responseText);
    purpose = data.purpose || 'N/A';
    date = data.date || 'N/A';
    amountStr = data.amount_str;
    
    if (amountStr) {
      const cleanedAmountStr = String(amountStr).replace(/,/g, '');
      if (cleanedAmountStr.includes('$')) {
        const match = cleanedAmountStr.match(/\$?(\d*\.?\d+)/);
        usdAmount = match ? parseFloat(match[1]) : '';
      } else if (cleanedAmountStr.includes('¥') || cleanedAmountStr.match(/円/)) {
        const match = cleanedAmountStr.match(/[¥円]?(\d+)[¥円]?/);
        jpyAmount = match ? parseInt(match[1], 10) : '';
      } else {
        Logger.log(`認識できない通貨記号: ${amountStr}`);
        const genericMatch = cleanedAmountStr.match(/(\d*\.?\d+)/);
        if (genericMatch) {
          usdAmount = parseFloat(genericMatch[1]);
          Logger.log(`通貨記号なし、USDと仮定: ${usdAmount}`);
        } else {
          purpose = purpose + ` (金額形式不明: ${amountStr})`;
          Logger.log(`金額解析失敗: ${amountStr}`);
        }
      }
    } else {
      Logger.log("金額情報 (amount_str) が見つかりませんでした。");
    }
    
  } catch (e) {
    Logger.log(`レスポンス解析エラー: ${e}. レスポンス: ${responseText}`);
    purpose = '解析エラー';
    date = '解析エラー';
  }
  
  return {
    purpose,
    date,
    usdAmount: usdAmount === '' ? '' : Number(usdAmount),
    jpyAmount: jpyAmount === '' ? '' : Number(jpyAmount)
  };
}  
