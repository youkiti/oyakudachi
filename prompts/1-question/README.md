# 1. 問いを立てる

### 臨床疑問の構造化支援プロンプト（臨床疑問の構造化GPTs）

EBM のステップ1（臨床疑問の構造化）からステップ2（文献検索）までを支援する対話プロンプトです。疫学者の役の AI が、疑問を分類し、足りない要素を尋ね、答えられる形の疑問に整理します。

- **機能**:
  - foreground question と background question の判別
  - 診療の実態・検査の有効性・要因と結果・治療の効果の4分類（と分類不能）への振り分け
  - 分類に応じた構造化（PO、PECO、診断精度の P・index test・reference test・target condition、PICO）と、P が O の population at risk になっているかの確認
  - 了承を得たうえで、systematic review に限った PubMed 検索式と検索結果ページの URL の提示

- **使用方法**:
  - [Clinical question structuring prompt.md](Clinical%20question%20structuring%20prompt.md) のプロンプト本文をコピーし、Gemini や ChatGPT（無料版で可）の新しいチャットに貼って送信する
  - API キーやアカウントの有料登録は不要
  - AI が示した文献は、リンクを開いて実在を確かめてから使う

### 医学教育研究ギャップの言語化支援（MedEdSearchBot）

臨床現場でのもやもやを研究の土台に乗せるための対話プロンプトです。研究初学者が、漠然とした疑問から既存の systematic review や scoping review を探し、自分の研究の新規性を4文テンプレートで言語化するまでを支援します。

- **機能**:
  - 仮想シナリオ（ポートフォリオ、自己評価とフィードバック）または自分の疑問から問いを探る
  - 量的・質的なリサーチクエスチョンへの整理と、英語の検索キーワードの提案
  - レビューに限った PubMed 検索式と、検索結果ページの URL の提示
  - 「分かっていること」「まだ分かっていないこと」とギャップの4分類の整理
  - 4文テンプレートへのフィードバックと最終まとめの出力

- **使用方法**:
  - [MedEd research gap prompt.md](MedEd%20research%20gap%20prompt.md) のプロンプト本文をコピーし、Gemini や ChatGPT（無料版で可）の新しいチャットに貼って送信する
  - API キーやアカウントの有料登録は不要
  - AI が示した文献は、リンクを開いて実在を確かめてから使う
