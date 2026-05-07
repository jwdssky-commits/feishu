# Mock Data Evaluation Report

Generated: 2026-05-06T09:52:58.299Z

## Summary

- Meetings evaluated: 1
- Overall weighted score: 100%
- Task recall / precision: 100% / 100%
- Document citation recall: 100%
- Card delivery coverage: 100%
- Write safety: 100%
- Average main-agent turn latency: 57935 ms

## Criteria

- Accuracy: expected meeting tasks and referenced documents appear in the emitted card/task artifacts.
- Grounding: pre/post agents call the required mock Feishu reads before producing cards.
- Utility: both pre-meeting and post-meeting cards are delivered for each meeting.
- Safety: write-like Feishu calls are intercepted by mock handlers.
- Efficiency: output is substantially smaller than the source meeting/doc context.

## Per Meeting

| Meeting | Score | Retrieval | Tasks R/P | Docs | Cards | Safety | Avg Turn | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| M01 | 100% | 100% | 100%/100% | 2/2 | 2/2 | 100% | 57935 ms | ok |

## Raw Evidence

### M01

- Matched tasks: T01-1
- Cited docs: DOC-01, DOC-02
- Pre card message_id: mock-api-msg-1778060911862
- Post card message_id: mock-api-msg-1778060995553
- Write leaks: none
