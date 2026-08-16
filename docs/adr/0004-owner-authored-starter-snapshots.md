# ADR 0004: starterをowner自身のsnapshot commitとして取り込む

- 状態: accepted
- 日付: 2026-08-16

## 背景

Agent Issue Console は `cloudflare/cloudflare-os-starter` を使いますが、root repository の reachable history と
contributor 表示には locally authored commit だけを残します。`upstream/main` から branch/merge すると upstream
author の履歴を引き継ぎます。

## 決定

`cloudflare/cloudflare-os-starter@93f14dfd68ed1c218d2a7c2168753a6d9b22e145` と同じ tree を持つ、owner
authored かつ parentless な root commit で初期化します。starter SHA と `cloudflare-os` gitlink SHA を trailer に
記録します。`upstream` remote は更新発見用に保持しますが履歴を merge しません。将来更新は snapshot 全差分を
reviewし、受け入れた tree delta を old/new provenance 付きの local commit として適用します。

## 結果

root history は Agent Issue Console author だけを表示します。通常の upstream merge/rebase は使えないため、tool と
reviewer は明示 SHA 間を比較します。submodule 自身の upstream history は root graph と分離されており維持します。
