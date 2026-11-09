# oyakudachi - 臨床研究者のためのお役立ちツール集

このリポジトリでは、臨床研究者、医療従事者、および健康科学の専門家にとって役立つ様々なツールやスクリプトを公開しています。研究計画の作成から文献検索、データ処理まで、研究プロセスの様々な段階で利用できるツールを提供しています。

## フォルダの構成

| フォルダ | 中身 |
|---------|------|
| [prompts/](prompts/) | AI に貼って使うプロンプト。研究の段階ごとに5つのフォルダに分けています |
| [notebooks/](notebooks/) | Google Colab などで動かす Jupyter Notebook |
| [gas/](gas/) | Google Apps Script（Google ドライブ・スプレッドシート・ドキュメントの自動処理） |

## プロンプト（AI に貼って使う）

「無料版で可」と書いたものは、無料版の Gemini や ChatGPT の新しいチャットにプロンプト本文を貼って送信するだけで使えます。API キーや有料登録は要りません。

### 1. 問いを立てる（[prompts/1-question/](prompts/1-question/)）

| ツール名 | 概要 |
|---------|------|
| [臨床疑問の構造化支援](prompts/1-question/Clinical%20question%20structuring%20prompt.md) | 臨床疑問を PICO・PECO などに構造化し、関連する systematic review を PubMed で探す（EBM のステップ1〜2）。無料版で可 |
| [医学教育研究ギャップの言語化支援](prompts/1-question/MedEd%20research%20gap%20prompt.md) | 臨床現場のもやもやから、既存レビューをもとに研究の新規性を4文で言語化する。無料版で可 |

### 2. 文献を探す（[prompts/2-search/](prompts/2-search/)）

| ツール名 | 概要 |
|---------|------|
| [PubMed検索支援GPTs](prompts/2-search/information%20specialit%20GPTs.md) | MeSH を活用した、系統的レビュー向けの PubMed 検索式を作る GPTs の設定。PubMed の API キーが必要 |

### 3. 結果を読む（[prompts/3-appraisal/](prompts/3-appraisal/)）

| ツール名 | 概要 |
|---------|------|
| [統計的有意と臨床的意義の読み解き](prompts/3-appraisal/bottom%20line%20message%20builder.md) | p 値でなく、臨床的な閾値（MCID）と信頼区間から研究結果の意味を判断する手助けをする |

### 4. 書く・投稿する（[prompts/4-writing/](prompts/4-writing/)）

| ツール名 | 概要 |
|---------|------|
| [PDF Phrase Extraction](prompts/4-writing/PDF%20Phrase%20Extraction.md) | 学術論文から有用な英語フレーズを抽出し、分類する |
| [ビジュアルアブストラクト作成](prompts/4-writing/visual-abstract-generator-for-4o.md) | SNS で発信するためのビジュアルアブストラクトを、画像生成つきの ChatGPT で作る |
| [査読者候補探し](prompts/4-writing/Reviewer%20finder%20prompt.md) | 論文のタイトルから PubMed を検索し、過去5年以内に類似研究を発表した研究者を、所属・根拠の論文つきで一覧にする。無料版で可 |

### 5. 教える・会を開く（[prompts/5-teaching/](prompts/5-teaching/)）

| ツール名 | 概要 |
|---------|------|
| [ワークショップ開催の計画支援](prompts/5-teaching/workshop%20planning%20prompt.md) | 研修会やセミナーの開催に当たって考えるべき12項目を、行動目標と評価を軸に対話で漏れなく整理する。無料版で可 |

## コード

### Notebook（[notebooks/](notebooks/)）

| ツール名 | 概要 |
|---------|------|
| [科研費用DMP下書きコード](notebooks/%E3%80%90%E7%A7%91%E7%A0%94%E8%B2%BB%E7%94%A8%E3%80%91%E7%A0%94%E7%A9%B6%E3%83%87%E3%83%BC%E3%82%BF%E3%83%9E%E3%83%8D%E3%82%B8%E3%83%A1%E3%83%B3%E3%83%88%E3%83%97%E3%83%A9%E3%83%B3%EF%BC%88DMP%EF%BC%89%E4%B8%8B%E6%9B%B8%E3%81%8D%E3%82%B3%E3%83%BC%E3%83%89.ipynb) | 科研費申請用の研究データマネジメントプランを自動生成 |
| [XML to Word変換（CDtodocx）](notebooks/CDtodocx.ipynb) | Cochrane Review などの XML ファイルを Word 文書に変換 |
| [PEDroスクレイパー](notebooks/pedro_scraper_progress.ipynb) | 理学療法エビデンスデータベース(PEDro)から文献情報を取得し BibTeX 形式に変換 |
| [学生と病院のマッチング最適化](notebooks/%E4%BD%8F%E6%89%80%E3%83%9E%E3%83%83%E3%83%81%E3%83%B3%E3%82%B0%E6%9C%80%E9%81%A9%E5%8C%96_ver1_1.ipynb) | 公共交通機関での移動時間のばらつきが最小になるよう、学生と病院を1対1で割り当てる |

### Google Apps Script（[gas/](gas/)）

| ツール名 | 概要 |
|---------|------|
| [領収書処理自動化](gas/Receipt_Summary.js) | PDF 領収書を Gemini API で解析し、内容をスプレッドシートに記録 |
| [論文データ抽出](gas/gas-data-extraction.js) | Google ドライブの論文ファイル（PDF・PNG）から、Gemini API でデータを抽出してスプレッドシートにまとめる |
| [レポートへの自動フィードバック](gas/%E3%83%AC%E3%83%9D%E3%83%BC%E3%83%88%E3%83%95%E3%82%A3%E3%83%BC%E3%83%89%E3%83%90%E3%83%83%E3%82%AFGAS.js) | フォルダ内の Google ドキュメント（レポート）の新規作成や更新を見つけ、Claude によるフィードバックをコメントで付ける |

各ツールの機能と使い方は、それぞれのフォルダの README に書いています。

## ライセンス

本リポジトリのコンテンツはリポジトリのLICENSEファイルの条件に従います。
