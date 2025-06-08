---
trigger: always_on
description: executing a terminal/bash command
---

- To run a command or test use the docker machine named ti2 and run them under the folder /ti2-events2url like:
% docker exec -it ti2 bash  -c 'cd /ti2-events2url && ls'
- If the docker machine ti2 is not up bring it up using:
% docker compose -f ../bbtesting/docker-compose.yml up -d ti2