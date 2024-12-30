#!/usr/bin/env bash

if [[ -d ./node_modules ]]; then
  rm -rf ./node_modules
fi

set -e

bun install

cp ../*.ts .

for testfile in ./*.test.ts; do
  bun test $testfile
done

rm ./*.ts
