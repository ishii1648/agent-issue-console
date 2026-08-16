# ADR 0001: wrapper所有のGatekeeperへプロダクトを拡張する

- 状態: superseded by ADR 0005
- 日付: 2026-08-16

## 背景

Cloudflare OS starter は custom Gatekeeper、service binding、agent instructions、Blueprint という拡張境界を
提供し、upstream 本体を submodule として固定します。Agent Issue Console は GitHub の限定 read/write、永続
会話、LLM、browser evidence、Monitor を必要とします。

## 当初の決定

policy と integration を wrapper 所有の Custom Gatekeeper に置き、Workshop chat capability と Gatekeeper
App UI を使い、submodule は変更しないことにしました。

## 変更

upstream を変更しない決定は維持しますが、supply-chain risk を減らすため業務ロジックは Rust core Worker
へ移しました。Custom Gatekeeper は Cloudflare OS 互換 bridge のみです。現行決定は ADR 0005 を参照します。
