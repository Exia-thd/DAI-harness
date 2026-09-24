# DAI Nexus — Hướng Dẫn Cài Đặt cho Claude CLI

> **Mục tiêu:** Biến DAI Nexus thành một bộ công cụ sản xuất phần mềm chuyên nghiệp tích hợp vào Claude CLI, với 56 kỹ năng AI, pipeline 6 pha, và 4 cấp độ power tùy nhu cầu.

## Mục Lục

- [Tổng Quan](#tổng-quan)
- [Cấp Độ Power](#cấp-độ-power)
- [Cài Đặt Nhanh (3 Phút)](#cài-đặt-nhanh-3-phút)
- [Chi Tiết Từng Cấp Độ](#chi-tiết-từng-cấp-độ)
  - [Level 1 — Cơ Bản](#level-1--cơ-bản)
  - [Level 2 — Thông Minh (Code Intelligence)](#level-2--thông-minh-code-intelligence)
  - [Level 3 — Bộ Nhớ (Persistent Memory)](#level-3--bộ-nhớ-persistent-memory)
  - [Level 4 — Toàn Diện (MCP Server)](#level-4--toàn-diện-mcp-server)
- [Xác Minh Cài Đặt](#xác-minh-cài-đặt)
- [Xử Lý Sự Cố](#xử-lý-sự-cố)

---

## Tổng Quan

**DAI Nexus là gì?**

DAI Nexus là một orchestrator (người điều phối) với 56 kỹ năng AI chuyên biệt, bao phủ toàn bộ vòng đời phát triển phần mềm:

| Nhóm Kỹ Năng | Số Lượng | Ví Dụ |
|---------------|----------|--------|
| Core Engineering | 23 | Business Analyst, PM, Architect, Software/FE/BE Engineer, QA, Security |
| Game Development | 18 | Unity/Unreal/Godot/Roblox Engineer, Level/Narrative Designer, Audio |
| AI & Data | 6 | AI Engineer, Prompt Engineer, Data Scientist, NotebookLM Researcher |
| DevOps & Ship | 6 | DevOps, SRE, Database Engineer, Performance Engineer |
| Meta & Orchestration | 3 | Polymath, Parallel Dispatch, Memory Manager |

**Pipeline chính:** `INTERPRET → DEFINE → BUILD → HARDEN → SHIP → SUSTAIN`

**24 chế độ hoạt động:** Full Build, Feature, Harden, Ship, Game Build, AI Build, Test, Review, Debug, Design, Research, Optimize, Marketing, v.v.

---

## Cấp Độ Power

Chọn cấp độ phù hợp với nhu cầu của bạn:

```
┌─────────────────────────────────────────────────────────┐
│  ⚡ Level 1 — Cơ Bản                                     │
│     56 kỹ năng AI • Tự động chọn chế độ                 │
│     ✓ Mặc định khi cài đặt                              │
├─────────────────────────────────────────────────────────┤
│  ⚡⚡ Level 2 — Thông Minh                               │
│     + Code Intelligence (DAI Nexus Node)                    │
│     + Phân tích blast radius tự động                    │
│     + Tra cứu code tức thì                              │
│     Yêu cầu: Node.js 18+                               │
├─────────────────────────────────────────────────────────┤
│  ⚡⚡⚡ Level 3 — Bộ Nhớ                                  │
│     + Ghi nhớ mọi thứ giữa các phiên chat               │
│     + Lưu quyết định, kiến trúc, blockers              │
│     Yêu cầu: Python 3.8+                               │
├─────────────────────────────────────────────────────────┤
│  ⚡⚡⚡⚡ Level 4 — Toàn Diện                             │
│     + 12 DAI Nexus Node tools trong chat                    │
│     + MCP server tùy chỉnh theo project                │
│     + Query, context, impact, rename, cypher           │
│     Yêu cầu: MCP server                                │
└─────────────────────────────────────────────────────────┘
```

---

## Cài Đặt Nhanh (3 Phút)

### Cách 1: Thêm vào project có sẵn (submodule)

```bash
# 1. Thêm submodule
git submodule add -b main https://github.com/Exia-thd/DAI-nexus dai-nexus

# 2. Copy 2 file bắt buộc vào thư mục gốc project
cp dai-nexus/AGENTS.md .
cp dai-nexus/CLAUDE.md .

# 3. Commit
git add .gitmodules dai-nexus AGENTS.md CLAUDE.md
git commit -m "feat: add dai-nexus"

# 4. Khởi tạo submodule
git submodule update --init --recursive
```

### Cách 2: Dùng trực tiếp (standalone)

```bash
# Clone repo
git clone https://github.com/Exia-thd/DAI-nexus
cd dai-nexus

# Mở Claude CLI và paste đường dẫn vào config
# (xem phần "Kích hoạt" bên dưới)
```

---

## Chi Tiết Từng Cấp Độ

### Level 1 — Cơ Bản

Cài đặt ở trên đã bao gồm Level 1. Không cần thêm bước nào.

**Xác minh:**
```bash
ls -la CLAUDE.md AGENTS.md
```

**Đã có gì:**
- 56 kỹ năng AI sẵn sàng
- Pipeline 6 pha tự động
- 24 chế độ hoạt động
- Step 0 bắt buộc (Request Interpretation)

---

### Level 2 — Thông Minh (Code Intelligence)

Yêu cầu: **Node.js 18+**

```bash
# Kiểm tra Node.js
node --version

# Nếu chưa có → cài đặt:
# macOS:  brew install node
# Windows: nodejs.org
# Linux:  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs
```

Sau đó, phân tích codebase:

```bash
# Từ thư mục project của bạn
npx --yes dainexus-node analyze "$(pwd)"

# Lần đầu mất 1-2 phút. Các lần sau nhanh hơn nhờ incremental indexing.
```

**Kết quả:** Graph database với ~2868 symbols, ~3021 relationships, 25 execution flows.

**Cách dùng trong Claude CLI:**

```
# Trước khi sửa bất kỳ function nào, hỏi:
"What does validateUser affect?" 
→ DAI Nexus Node trả lời: d=1 WILL BREAK (4 direct callers), d=2 LIKELY AFFECTED (12 indirect deps)

# Tra cứu code theo ý tưởng:
"How does the auth flow work?"
→ DAI Nexus Node trả lời: execution flow với 8 bước, các file liên quan

# Trước khi commit:
"Check what changes affect this PR"
→ DAI Nexus Node warn: HIGH risk — 3 direct callers sẽ break nếu đổi API này
```

---

### Level 3 — Bộ Nhớ (Persistent Memory)

Yêu cầu: **Python 3.8+**

```bash
# Kiểm tra Python
python3 --version

# Nếu chưa có → cài đặt:
# macOS:  brew install python3
# Windows: python.org/downloads
# Linux:  sudo apt install python3 python3-pip
```

Khởi tạo bộ nhớ:

```bash
# Cài engine (một lần, cài ra ngoài repo)
python3 dai-nexus/scripts/lite/dai_memory.py install

# Từ thư mục project của bạn: tạo kho + code graph
node "$(python3 dai-nexus/scripts/lite/dai_memory.py where)/bin/dai-memory.mjs" init
```

**Kết quả:** Thư mục `.memory/` được tạo (code graph + bộ nhớ dự án).

**Cách dùng:**
- Mọi quyết định kiến trúc được ghi nhớ
- Không cần lặp lại context giữa các phiên chat
- Lưu blockers, trade-offs, pattern decisions

---

### Level 4 — Toàn Diện (MCP Server)

Tạo MCP server tùy chỉnh theo project:

```bash
# Từ thư mục project của bạn
bash dai-nexus/scripts/mcp-generate.sh
```

Script này:
1. Đọc `project-profile.json` (chạy `/onboard` nếu chưa có)
2. Tạo `.dainexus/mcp-server/` với TypeScript server
3. Cài đặt dependencies
4. In ra hướng dẫn kết nối

**Kết nối vào Claude CLI:**

Tìm file config Claude CLI:

```bash
# Tìm vị trí config
ls ~/.config/claude/  # Linux
ls ~/Library/Application\ Support/Claude/  # macOS
```

Thêm vào `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dai-nexus": {
      "command": "npx",
      "args": ["tsx", "/path/to/dai-nexus/.dainexus/mcp-server/server.ts"]
    }
  }
}
```

**Hoặc thêm vào project-specific config:**

```json
{
  "mcpServers": {
    "my-project": {
      "command": "npx",
      "args": ["tsx", ".dainexus/mcp-server/server.ts"]
    }
  }
}
```

Khởi động lại Claude CLI.

---

## Xác Minh Cài Đặt

Chạy script xác minh:

```bash
bash dai-nexus/scripts/dai-validate.sh
```

Hoặc kiểm tra thủ công:

```bash
echo "=== DAI Nexus Verification ==="
echo "CLAUDE.md:       $([ -f CLAUDE.md ] && echo 'OK' || echo 'MISSING')"
echo "AGENTS.md:       $([ -f AGENTS.md ] && echo 'OK' || echo 'MISSING')"
echo "Skills count:    $(ls dai-nexus/skills/*/SKILL.md 2>/dev/null | wc -l | tr -d ' ')"
echo "MCP:             $([ -d dai-nexus/.dainexus/mcp-server ] && echo 'OK' || echo 'MISSING')"
echo "Memory:          $([ -f .dainexus/memory.jsonl ] && echo 'OK' || echo 'MISSING')"
```

---

## Xử Lý Sự Cố

| Vấn Đề | Giải Pháp |
|--------|-----------|
| `dainexus-node: command not found` | Dùng `dai-memory ingest` thay vì `dainexus-node` |
| `npm install` thất bại trong submodule | Kiểm tra `node --version` (cần 18+) |
| Không thấy MCP tools | Khởi động lại Claude CLI sau khi đổi config |
| Index cũ | Chạy `dai-memory ingest` để cập nhật |
| Submodule chưa khởi tạo | `git submodule update --init --recursive` |
| `realpath` không tìm thấy (macOS) | `brew install coreutils` |
| `python3` không tìm thấy | Cài Python 3.8+ cho tính năng memory |
| Windows: `bash` không tìm thấy | Dùng lệnh PowerShell tương đương |
| Windows: Lỗi đường dẫn DAI memory hoặc TSX (`ERR_MODULE_NOT_FOUND`) | **1. DAI memory**: Sử dụng `"command": "node"` và file `bin/dai-memory.mjs` trong thư mục `python3 scripts/lite/dai_memory.py where` in ra, kèm `"serve"`. <br/> **2. TSX (dai-nexus)**: Tránh gọi trực tiếp `/c/Users/...`, hãy đổi cấu hình chạy sang `"command": "npx"` và `"args": ["tsx", "C:/Users/<Username>/.dainexus/mcp-server/src/index.ts"]`. |
| Windows: Claude Code Hook không chạy | Thêm tiền tố `bash` trước đường dẫn script hook (Ví dụ: `"PostMessage": "bash D:/path/to/script.sh tick"`). |

---

## Cập Nhật

```bash
# Từ thư mục project
cd dai-nexus
git pull origin main

# Commit thay đổi
git add .
git commit -m "chore: update dai-nexus submodule"
```

---

## Lệnh Tắt (Shortcuts)

Khi đang trong Claude CLI:

| Lệnh | Mô Tả |
|------|--------|
| `/setup` | Cài đặt lần đầu |
| `/update` | Kiểm tra và cài cập nhật |
| `/pipeline` | Xem pipeline đầy đủ |
| `/onboard` | Phân tích sâu project |
| `/mcp` | Tạo/regenerate MCP server |

---

## Nâng Cao (Tùy Chọn)

### DAI Nexus Node cho Multi-Repo

```bash
# Tạo nhóm repos để query đồng thời
dainexus-node group create my-team
dainexus-node group add repo1
dainexus-node group add repo2

# Query cross-repo
dainexus-node group query my-team "authentication"
```

### GitHub Actions (Enterprise)

```yaml
# .github/workflows/dai-nexus.yml
- name: DAI Nexus Node Analyze
  uses: Exia-thd/dai-nexus-actions/analyze@main

- name: PR Blast Radius
  uses: Exia-thd/dai-nexus-actions/pr-review@main
  with:
    base: main
    head: ${{ github.event.pull_request.head.ref }}
```

### Hook Tự Động

```bash
# Auto-reindex sau mỗi commit
cp dai-nexus/.claude/hooks/post-tool-use.ts ~/.claude/hooks/
```

---

## Tài Liệu Tham Khảo

- **README chính:** `README.md` (giải thích đầy đủ pipeline, diagram, 56 skills)
- **CLAUDE.md:** Hướng dẫn tích hợp Claude Code
- **AGENTS.md:** Danh sách 56 skills + protocols
- **Skills:** `skills/*/SKILL.md` — chi tiết từng kỹ năng
- **Protocols:** `skills/_shared/protocols/*.md` — 29 shared protocols
