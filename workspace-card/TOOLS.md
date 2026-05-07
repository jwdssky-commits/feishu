# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## 会议纪要卡片模版（card workspace）

- **Schema 2.0 完整卡片底稿**：`skills/lark-card/templates/meeting_minutes_card.schema2.json`（飞书「会议纪要」版式示例）。
- **发送步骤**：Read `skills/lark-card/SKILL.md`，用 `lark-cli im +messages-send --msg-type interactive`；动态内容在副本 JSON 里改各 `markdown.content` / `img_key` 后再发。
- **会前简报收件人**：一般在 **`../workspace-pre-meeting/TOOLS.md`** 配置 **`target_user_open_id`**（发给自己，`ou_xxx`）或 **`target_chat_id`**（群）。

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.
