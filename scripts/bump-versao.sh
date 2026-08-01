#!/bin/sh
# Bump da versao dos assets do index.html.
#
# POR QUE: o dono abre o painel por um icone na tela de inicio do iPhone, que
# roda num WebView com cache proprio e ignora o must-revalidate. Sem URL nova,
# ele serve codigo velho calado -- e fechar a folha com dado velho e decisao de
# dinheiro em cima de dado velho.
#
# POR QUE CARIMBO DE TEMPO E NAO O HASH DO COMMIT: o hash so existe DEPOIS do
# commit; rodando antes, ele repete o da versao anterior e a URL nao muda. Foi o
# que aconteceu em 01/ago/2026 -- dois deploys seguidos com o mesmo ?v=, e o
# celular continuou no codigo velho.
#
# USO: ./scripts/bump-versao.sh   (antes de commitar mudanca em js/ ou css/)
set -e
cd "$(dirname "$0")/.."
V=$(date +%Y%m%d-%H%M)
grep -q '?v=' index.html || { echo "index.html sem ?v= -- nada a fazer" >&2; exit 1; }
sed -i '' -E "s/\?v=[0-9a-zA-Z.-]+/?v=$V/g" index.html 2>/dev/null \
  || sed -i -E "s/\?v=[0-9a-zA-Z.-]+/?v=$V/g" index.html
echo "versao dos assets -> $V  ($(grep -c '?v=' index.html) tags)"
