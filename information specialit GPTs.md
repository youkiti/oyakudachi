# 承前
【AI】ChatGPTとAPIを使って網羅的なPubMed検索できるGPT「PubMed Searcher」
https://drmagician.exblog.jp/31031028/
が面白かったので、PubMedでのMeSHを使った検索式を作ってくれるGPTsを作成しました。
PubMed APIは自前で取得する必要があるのでプロンプトを共有します。

# システムプロンプト
```
You are an information specialist. You help users construct a search formula for a systematic review in PubMed. Using the PMID or specific query provided by the user, you must search PubMed and return the relevant search formula. Use NCBI account details and API key to access PubMed data.
あなたは検索式の提示を部分を除いて、日本語で会話します。

Clinical Questionへの対応:
clinical_question:
  steps:
    - Extract as many relevant terms (synonyms or quasi-synonyms) as possible from the clinical question provided by the user. The terms must be in English.
    - If the user provides a PMID, generate the search formula using only the PMID.
    - Create a PubMed search query using the extracted terms (e.g., hand[tiab] OR lung[tiab]).
    - Ensure the search query is highly sensitive but not highly specific.
    - Do not include concepts about outcomes, such as "outcome", "prognosis", or "survival".
    - If more than two concepts are identified, ask the user to select two concepts.
    - Ask the user for confirmation before performing the search.

search_results1:
  steps:
    - Indicate the number of results found.
    - List the 5 newest and 5 oldest articles, including their MeSH terms.
      The output style should be:
      - 5 newest articles:
        - PMID: 
        - Title:
      - 5 oldest articles:
        - PMID: 
        - Title:

search_results2:
  steps:
    - From the results in search_results1, search each abstracts and extract relevant MeSH terms and keywords using efetch function.
    - Create search blocks using MeSH terms.
    - Ask the user for confirmation before proceeding.
    - If no relevant MeSH terms are found, respond accordingly.
    - The output style should be:
      - PMID:
      - Title:
      - MeSH:
      - Relevant keywords:

Development of systematic search formula:
  steps:
    - Create search blocks using keywords and MeSH terms.
    - Output the number of search results for each line.
    - Provide the final output as a PubMed link with the search formula.

efetch:
  usage: Use EFetch only when abstract and MeSH information are needed.
```
# アクションの設定
```
openapi: 3.0.0
info:
  title: PubMed API
  description: API to search and retrieve literature from PubMed using esearch, esummary, and efetch endpoints.
  version: 1.0.0
servers:
  - url: https://eutils.ncbi.nlm.nih.gov/entrez/eutils
    description: NCBI E-utilities server
paths:
  /esearch.fcgi:
    get:
      operationId: searchLiterature
      summary: Searches for literature in PubMed.
      parameters:
        - name: db
          in: query
          required: true
          schema:
            type: string
          description: The database to search (e.g., pubmed).
        - name: term
          in: query
          required: true
          schema:
            type: string
          description: The search term(s).
        - name: retmax
          in: query
          required: false
          schema:
            type: integer
          description: The maximum number of results to return.
        - name: retmode
          in: query
          required: false
          schema:
            type: string
          description: The return mode (e.g., xml, json).
        - name: api_key
          in: query
          required: true
          schema:
            type: string
          description: Your NCBI API key.
    responses:
      '200':
        description: Search results
        content:
          application/json:
            schema:
              type: object
              properties:
                count:
                  type: integer
                retmax:
                  type: integer
                retstart:
                  type: integer
                ids:
                  type: array
                  items:
                    type: string
  /esummary.fcgi:
    get:
      operationId: getSummary
      summary: Retrieves the summary of literature based on search results.
      parameters:
        - name: db
          in: query
          required: true
          schema:
            type: string
          description: The database to search (e.g., pubmed).
        - name: id
          in: query
          required: true
          schema:
            type: string
          description: A comma-separated list of UIDs of the articles.
        - name: retmode
          in: query
          required: false
          schema:
            type: string
          description: The return mode (e.g., xml, json).
        - name: api_key
          in: query
          required: true
          schema:
            type: string
          description: Your NCBI API key.
    responses:
      '200':
        description: Summary details of the search results
        content:
          application/json:
            schema:
              type: object
              properties:
                uid:
                  type: string
                title:
                  type: string
                source:
                  type: string
                pubdate:
                  type: string
                authors:
                  type: array
                  items:
                    type: string
                volume:
                  type: string
                issue:
                  type: string
                pages:
                  type: string
                doi:
                  type: string
  /efetch.fcgi:
    get:
      operationId: fetchDetails
      summary: Fetches the details including abstracts for specified UIDs.
      parameters:
        - name: db
          in: query
          required: true
          schema:
            type: string
          description: The database to search (e.g., pubmed).
        - name: id
          in: query
          required: true
          schema:
            type: string
          description: A comma-separated list of UIDs of the articles.
        - name: rettype
          in: query
          required: false
          schema:
            type: string
          description: The return type (e.g., medline). #←ここを元のからMeSHを検索するために変更
        - name: retmode
          in: query
          required: false
          schema:
            type: string
          description: The return mode (e.g., xml, text).
        - name: api_key
          in: query
          required: true
          schema:
            type: string
          description: Your NCBI API key.
    responses:
      '200':
        description: Detailed information including abstracts
        content:
          text/plain:
            schema:
              type: string
