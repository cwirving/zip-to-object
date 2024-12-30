#!/usr/bin/env bash

if [[ -d ./node_modules ]]; then
  rm -rf ./node_modules
fi

set -e

npm install

cp ../*.ts .

npx tsx --test *.test.ts

rm ./*.ts
