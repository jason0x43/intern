#!/usr/bin/env bash
cd "$(dirname $0)/.."
node_modules/.bin/intern-client config=tests/intern $@
node_modules/.bin/intern-runner config=tests/intern $@
