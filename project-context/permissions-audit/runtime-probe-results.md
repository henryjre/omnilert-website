# Runtime Permission Probe Results

Generated: 2026-03-17T17:35:01.798Z

- Total probes: 17
- Passed: 0
- Failed: 17

| Probe | Kind | Passed | Expected | Actual |
| --- | --- | --- | --- | --- |
| http.peer-evaluations.pending-mine | http | no | Negative token => 403, Positive token => non-403/non-401 | probe error: fetch failed |
| http.employee-shifts.list | http | no | Negative token => 403, Positive token => non-403/non-401 | probe error: fetch failed |
| http.pos-sessions.list | http | no | Negative token => 403, Positive token => non-403/non-401 | probe error: fetch failed |
| http.pos-verifications.list | http | no | Negative token => 403, Positive token => non-403/non-401 | probe error: fetch failed |
| http.account.profile | http | no | Negative token => 403, Positive token => non-403/non-401 | probe error: fetch failed |
| http.account.notifications.count | http | no | Negative token => 403, Positive token => non-403/non-401 | probe error: fetch failed |
| http.account.schedule | http | no | Negative token => 403, Positive token => non-403/non-401 | probe error: fetch failed |
| branch.scope.probe | branch-scope | no | Branch-scope probes complete | probe error: fetch failed |
| socket.pos-verification | socket | no | Negative token fails socket auth, positive token connects | negative=websocket error, positive=websocket error |
| socket.pos-session | socket | no | Negative token fails socket auth, positive token connects | negative=websocket error, positive=websocket error |
| socket.employee-shifts | socket | no | Negative token fails socket auth, positive token connects | negative=websocket error, positive=websocket error |
| socket.employee-verifications | socket | no | Negative token fails socket auth, positive token connects | negative=websocket error, positive=websocket error |
| socket.store-audits | socket | no | Negative token fails socket auth, positive token connects | negative=websocket error, positive=websocket error |
| socket.case-reports | socket | no | Negative token fails socket auth, positive token connects | negative=websocket error, positive=websocket error |
| socket.violation-notices | socket | no | Negative token fails socket auth, positive token connects | negative=websocket error, positive=websocket error |
| socket.employee-requirements | socket | no | Negative token fails socket auth, positive token connects | negative=websocket error, positive=websocket error |
| socket.peer-evaluations | socket | no | Negative token fails socket auth, positive token connects | negative=websocket error, positive=websocket error |
