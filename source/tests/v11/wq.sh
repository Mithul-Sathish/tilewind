#!/bin/bash
# wq.sh NAME [file]: queue file (or stdin) as NAME.js, wait until done
cd /home/user/w2
if [ -n "$2" ]; then cp "$2" q/$1.tmp; else cat > q/$1.tmp; fi
mv q/$1.tmp q/$1.js
for i in $(seq 1 110); do [ -f q/$1.done ] && break; sleep 1; done
grep -E "^($1|DONE $1|FAIL $1|ERR)" ld.log | tail -5
