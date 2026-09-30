# DAI Nexus — AI Orchestrator Tự Học và Tự Sửa Sai

> **This is the Vietnamese version.** For English documentation, see [README.md](./README.md)

<p align="center">
  <img src="assets/dai-nexus-banner.png" alt="DAI Nexus Banner" width="600" />
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/version-8.7.0-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/skills-87-brightgreen.svg" alt="Skills" />
  <img src="https://img.shields.io/badge/modes-24-blueviolet.svg" alt="Modes" />
  <img src="https://img.shields.io/badge/protocols-59-00CED1.svg" alt="Protocols" />
  <img src="https://img.shields.io/badge/Game_Dev-Unity·Unreal·Godot·Roblox-FF4500.svg" alt="Game Dev" />
  <img src="https://img.shields.io/badge/Code_Intelligence-DAI%20memory-4B0082.svg" alt="Code Intelligence" />
  <img src="https://img.shields.io/badge/Memory-Persistent%20(memory)-00CED1.svg" alt="Memory" />
  <img src="https://img.shields.io/badge/MCP-8%20Tools-orange.svg" alt="MCP" />
</p>

---

## TL;DR — DAI Nexus là gì?

**Tưởng tượng:** Bạn có một đội ngũ 83 chuyên gia AI. Mỗi người giỏi một việc khác nhau — viết code, kiểm tra bảo mật, thiết kế game, tối ưu tốc độ. DAI Nexus là "người quản lý" — khi bạn nói "tôi muốn build một app bán hàng", nó tự biết cần gọi chuyên gia nào, theo thứ tự nào, và kiểm tra chất lượng ra sao.

> **Một câu:** DAI Nexus tự động chọn đúng chuyên gia AI cho đúng việc, từ ý tưởng đến sản phẩm.

### Ví dụ cụ thể

```
Bạn nói:  "Build cho tôi một website bán áo thun"

    ↓

DAI Nexus tự động làm:
    1. Phân tích thị trường (Business Analyst)
    2. Lên kế hoạch tính năng (Product Manager)
    3. Thiết kế kiến trúc database & API (Solution Architect)
    4. Viết code backend + frontend (Software Engineer)
    5. Viết unit test (QA Engineer)
    6. Kiểm tra bảo mật (Security Engineer)
    7. Deploy lên server (DevOps)
    8. Monitor & tối ưu (SRE)

    ↓

Kết quả: Website production-ready, đã review, đã test, score 0-100
```

---

## 🖥️ DAI Nexus Console — Giao diện Desktop Chuyên nghiệp (Premium GUI)

Bạn muốn theo dõi trực quan luồng hoạt động của agent theo thời gian thực? Hãy trải nghiệm **[DAI Nexus Console](https://feedmycode.com/)** — phiên bản giao diện Desktop cao cấp (GUI) chạy cục bộ, được thiết kế để kết hợp hoàn hảo với CLI mã nguồn mở.

<p align="center">
  <a href="https://feedmycode.com/">
    <img src="https://img.shields.io/badge/Giao_diện_Desktop-Sở_hữu_License_Trọn_đời-brightgreen?style=for-the-badge&logo=appstore&logoColor=white" alt="Sở hữu DAI Nexus Console" />
  </a>
</p>

*   **Bảng điều khiển trực quan (Visual Dashboard)**: Theo dõi sơ đồ tiến trình và luồng chạy thực tế của hơn 56 kỹ năng AI theo thời gian thực thay vì phải đọc log JSON thô từ terminal.
*   **Trình khám phá SQLite cục bộ**: Dễ dàng truy vấn, lọc và kiểm tra (audit) các quyết định trước đó của agent, các khoảng trống yêu cầu (requirements gaps) và sơ đồ kiến trúc.
*   **Cấu hình một chạm**: Chỉnh sửa các biến môi trường workspace, chế độ cô lập dự án MCP (Multi-project Isolation) và cấu hình tools thông qua giao diện trực quan và sạch sẽ.
*   **Chạy tác vụ nền**: Vận hành các pipeline chạy tự động dài ngày một cách mượt mà dưới nền với các thông báo hệ thống (OS notifications) tích hợp.

👉 Tìm hiểu thêm và mua bản quyền trọn đời chỉ với $25 tại **[feedmycode.com](https://feedmycode.com/)**.

---

## Harness Engineering: Biến LLM Thô Thành Lập Trình Viên Đáng Tin Cậy

Trong kỹ nghệ AI hiện đại, một mô hình ngôn ngữ lớn (LLM) thô chỉ đóng vai trò 20% trong một agent hoàn chỉnh. 80% còn lại thuộc về **Harness (Khung vận hành)** — hệ thống điều phối execution pipeline, các rào cản an toàn (safety guardrails), bộ nhớ (cognitive memory), và các lớp kiểm thử tự động điều khiển cách AI hoạt động.

<p align="center">
  <strong>Agent = Model (Claude/GPT/Gemini) + DAI Nexus Harness</strong>
</p>

DAI Nexus đóng vai trò là một Harness phân phối phần mềm chuẩn production dành cho các AI coding agent:

*   **Middleware Chain (14 giai đoạn)**: Bọc ngoài mỗi lượt thực thi skill bằng các công cụ kiểm soát an toàn, môi trường sandbox cô lập, nén ngữ cảnh và cổng kiểm định chất lượng (Quality Gates).
*   **Vòng lặp ASIP tự sửa đổi**: Tự động phát hiện lỗi lên plan/thực thi code, kích hoạt nghiên cứu tài liệu chuyên sâu và tự cập nhật quy trình làm việc (SOPs).
*   **Bộ nhớ dự án DAI memory**: Mỗi dự án một kho riêng (`.memory/`), vừa là code graph vừa là bộ nhớ quyết định/sự cố/quy trình; truy hồi bằng BM25 + vector + đồ thị hợp nhất qua RRF.
*   **Hệ thống phòng vệ chủ động**: Tự động quét lỗ hổng bảo mật, tích hợp kiểm thử CI/CD và bảo vệ các thư mục nhạy cảm, ngăn các ảo giác của AI đưa lỗ hổng bảo mật vào dự án.
*   **Quy trình kiểm thử Hybrid BDD-First**: Tự động phân loại độ phức tạp của tác vụ dựa trên số liệu của code graph (DAI memory). Bắt buộc thực hiện theo luồng BDD/TDD-first (`BA (BDD) -> QA (Stubs) -> Build -> Test`) cho các tác vụ phức tạp, và cho phép kiểm thử sau (test-after) đối với các hotfix rủi ro thấp.
*   **Tối ưu hóa Gemini 3.x Native**: Hỗ trợ tối ưu hoàn toàn cho Gemini 3.5 Flash (cho các luồng điều phối nhanh với `thinking_level: MINIMAL` và strict grounding) và Gemini 3.1 Pro (cho lập luận phức tạp với `thinking_level: HIGH` và temperature 1.0). Tránh việc ép buộc Temperature 1.0 đồng loạt để giữ ổn định cho các tác vụ deterministic của Claude/GPT, đồng thời bảo toàn Thought Signatures (tránh lỗi API 400) và tự động kích hoạt Context Caching cho ngữ cảnh lớn hơn 4,096 tokens.
*   **⚡ DAI Nexus Lite — Nhân Điều Hướng Evidence-Gated (Nâng cấp v3)**: Thiết kế đặc biệt cho các mô hình nhỏ và nhanh (ví dụ: Gemini Flash), loại bỏ các câu từ rườm rà để tập trung vào nhân lập luận gọn nhẹ kết hợp với kiểm chứng lớp script, giúp tăng đáng kể độ chính xác lập trình trên cùng một mô hình.
    *   **Evidence-Gated Turn Checks**: Việc hoàn thành lượt (turn) được kiểm soát thông qua xác thực lớp script đối với các file bằng chứng (`.dainexus/verify/<turn>.json`), loại bỏ ảo giác và thiên kiến tự chứng thực (self-attested).
    *   **Turn-level Platform Hooks**: Cấu hình ăn liền (out-of-the-box) cho Claude Code, Gemini CLI, Cursor, và Codex CLI để tự động chặn đứng việc thực thi nếu kiểm chứng thất bại.
    *   **Giới hạn Boot ≤7k**: Giới hạn ngữ cảnh khởi động dưới 7,000 tokens thông qua việc tải lũy tiến các kỹ năng (skill-overlay loading), giúp giữ tác vụ trong vùng nhớ đáng tin cậy của mô hình.
    *   **Leo thang Tác vụ Tự động (Objective Escalations)**: Các trigger hệ thống (như quét grep đường dẫn đối với các thay đổi về bảo mật/đồng thời/schema hoặc lỗi kiểm thử liên tiếp) sẽ tự động chuyển tác vụ cho các mô hình mạnh hơn (Sonnet/Opus).
    *   **Kiểm chứng Giao diện & Hình ảnh (Vision)**: Đối với bất kỳ tác vụ nào liên quan đến UI hoặc thiết kế trực quan, AI bắt buộc phải chụp ảnh màn hình hoặc ghi lại kết quả hiển thị, và sử dụng khả năng phân tích hình ảnh (vision) của mô hình để kiểm chứng bố cục, độ chính xác và tính thẩm mỹ.
    *   **Bộ Đánh Giá 13 Tác Vụ**: Khung đánh giá chuẩn hóa giúp đo lường tỷ lệ vượt qua kiểm thử (pass rates), thời gian thực thi và mức độ tiết kiệm chi phí.


---

### 4 cấp độ "sức mạnh" — chọn cái phù hợp với bạn

```mermaid
flowchart LR
    subgraph L1["⚡ Level 1 — Basic"]
        direction TB
        L1A["✅ Đã có gì"]
        L1B["• 83 kỹ năng AI"]
        L1C["• Pipeline tự động"]
        L1D["• Mặc định khi cài đặt"]
    end

    subgraph L2["⚡⚡ Level 2 — Smart"]
        direction TB
        L2A["🔍 Thêm gì"]
        L2B["• Hỏi 'thay đổi này ảnh hưởng gì?' → trả lời ngay"]
        L2C["• Phân tích blast radius tự động"]
        L2D["• Cần: Node.js 22+ cho runtime/CLI"]
    end

    subgraph L3["⚡⚡⚡ Level 3 — Memory"]
        direction TB
        L3A["🧠 Thêm gì"]
        L3B["• Nhớ mọi thứ qua các lần chat"]
        L3C["• Lưu quyết định, kiến trúc, blockers"]
        L3D["• Cần: Python 3.8+"]
    end

    subgraph L4["⚡⚡⚡⚡ Level 4 — Full Power"]
        direction TB
        L4A["🚀 Tất cả"]
        L4B["• 12 công cụ DAI Nexus Node trong chat"]
        L4C["• Tra cứu code tức thì"]
        L4D["• Cần: MCP server"]
    end

    L1 --> L2 --> L3 --> L4

    style L1 fill:#1a5276,stroke:#3498db,color:#fff
    style L2 fill:#1e8449,stroke:#2ecc71,color:#fff
    style L3 fill:#d35400,stroke:#e67e22,color:#fff
    style L4 fill:#c0392b,stroke:#e74c3c,color:#fff
    style L1A fill:#1a5276,stroke:#3498db,color:#fff
    style L2A fill:#1e8449,stroke:#2ecc71,color:#fff
    style L3A fill:#d35400,stroke:#e67e22,color:#fff
    style L4A fill:#c0392b,stroke:#e74c3c,color:#fff
```

---

## Cách bắt đầu — 3 bước dễ nhất

```mermaid
flowchart TD
    START(["Bạn ơi, bắt đầu từ đâu?"])

    START --> Q1{"Bạn là dev?"}
    Q1 --> |"Không / mới bắt đầu"| EASY["✅ Level 1 — Basic<br/>Chỉ cần cài là xong<br/>83 kỹ năng có sẵn"]
    Q1 --> |"Có, muốn thông minh hơn"| SMART["✅ Level 2 — Smart<br/>Thêm phân tích code<br/>Hỏi gì đáp nấy"]

    SMART --> Q2{"Cần nhớ qua các lần chat?"}
    Q2 --> |"Có, dự án dài"| MEM["✅ Level 3 — Memory<br/>Lưu mọi quyết định<br/>Không phải nói lại"]
    Q2 --> |"Không cần / CI only"| MCP["✅ Level 4 — Full Power<br/>12 công cụ trong chat<br/>Tra cứu code tức thì"]

    EASY --> DONE1["🎉 Xong! Bắt đầu dùng ngay"]
    SMART --> DONE2["🎉 Xong! Cài thêm 1 bước"]
    MEM --> DONE3["🎉 Xong! Cài thêm 2 bước"]
    MCP --> DONE4["🎉 Xong! Cài thêm 2 bước"]

    style START fill:#1a1a2e,stroke:#e94560,color:#fff
    style EASY fill:#1a5276,stroke:#3498db,color:#fff
    style SMART fill:#1e8449,stroke:#2ecc71,color:#fff
    style MEM fill:#d35400,stroke:#e67e22,color:#fff
    style MCP fill:#c0392b,stroke:#e74c3c,color:#fff
    style DONE1 fill:#0f3460,stroke:#2ecc71,color:#fff
    style DONE2 fill:#0f3460,stroke:#2ecc71,color:#fff
    style DONE3 fill:#0f3460,stroke:#2ecc71,color:#fff
    style DONE4 fill:#0f3460,stroke:#2ecc71,color:#fff
    style Q1 fill:#533483,stroke:#9b59b6,color:#fff
    style Q2 fill:#533483,stroke:#9b59b6,color:#fff
```

### Cài đặt nhanh (không cần biết bash)

#### Nếu bạn dùng Cursor / VS Code

1. Mở Cursor hoặc VS Code
2. Điền câu hỏi hoặc yêu cầu của bạn
3. **Xong!** Không cần cài gì thêm — Level 1 đã hoạt động

#### Nếu bạn muốn thông minh hơn (Level 2+)

Mở **Terminal** (hoặc Command Prompt) và chạy:

```bash
# Kiểm tra Node.js
node --version

# Nếu thấy số (vd: v20.x.x) → đã đủ điều kiện
# Nếu báo "command not found" → cài Node.js trước
#   macOS: brew install node
#   Windows: tải từ nodejs.org
```

#### Nếu dùng Antigravity CLI (`agy`)

Mỗi máy dev hoặc CI dùng `agy` cần cài hook Antigravity cấp máy và hook tự cập
nhật trong repository cha một lần:

```bash
bash dai-nexus/scripts/dainexus-install.sh --profile minimal --yes
bash dai-nexus/scripts/dainexus-hook-doctor.sh --quick --fix
bash dai-nexus/scripts/lite/install-submodule-update-hooks.sh "$PWD"
```

Installer sẽ thêm native named `PreToolUse` policy hook vào
`~/.gemini/config/hooks.json`. Đây là cấu hình của Antigravity CLI, hoàn toàn
tách biệt với `.gemini/settings.json` của Gemini CLI. Setup và `doctor --fix`
cũng tự tạo `.dainexus/execution-policy.yaml` ở workspace cha khi còn thiếu;
nếu đã có file hoặc symlink tùy biến thì luôn giữ nguyên. Kiểm tra lại bằng:

```bash
bash dai-nexus/scripts/dainexus-hook-doctor.sh --quick
```

Sau bước cài một lần này, `post-merge` và `post-checkout` của repository cha sẽ
tự kiểm tra `origin/main`. Nếu submodule sạch và có thể fast-forward, DAI Nexus
sẽ tự cập nhật code, refresh Antigravity hook runtime, chạy doctor và đồng bộ MCP.
Thay đổi local hoặc lịch sử đã phân kỳ sẽ không bị ghi đè. Bản thân thao tác mở
`agy` không fetch Git; auto-update diễn ra khi repository cha vừa pull, merge
hoặc checkout.

Nên gọi `agy` qua các luồng delegation, escalation, benchmark hoặc
parallel-dispatch do DAI Nexus quản lý. Các luồng này dùng đúng binary `agy`,
bật sandbox và mode rõ ràng, kiểm tra global policy hook, đồng thời truyền
workspace chuẩn qua `DAINEXUS_WORKSPACE`.

Nếu chủ động chạy `agy` trực tiếp tại project root, phải truyền workspace và
chọn mode rõ ràng:

```bash
DAINEXUS_WORKSPACE="$PWD" agy --sandbox --mode accept-edits
```

Với `agy 1.1.2 --print`, runtime có thể gửi `workspacePaths` rỗng. Nếu thiếu
`DAINEXUS_WORKSPACE`, hook DAI Nexus sẽ fail-closed và có thể chặn cả tool
call an toàn. File `.agents/hooks.json` vẫn được giữ để hỗ trợ project portability,
nhưng runtime đã kiểm thử hiện chỉ load global registry; không được xóa global
hook.

---

## The Flow — DAI Nexus làm việc thế nào?

> Tất cả sơ đồ dưới đây hiển thị tốt trên GitHub, GitLab, và mọi trình xem mermaid.
> Nếu không thấy hình — đảm bảo trình xem dùng **mermaid 10+**.

### Tổng quan — Ai làm gì

```mermaid
flowchart TD
    START(["Bạn nói: 'Build app bán hàng'"])
    CHAT_INT{{"Chat Interpreter<br/>(chat-interpreter)"}}
    ORCH(["DAI Nexus<br/>(người quản lý)"])

    START --> CHAT_INT
    CHAT_INT --> |"intent parsed"| ORCH

    ORCH --> MODE{{"Chọn chế độ<br/>phù hợp"}}

    MODE --> |"Build toàn bộ"| DEFINE["DEFINE<br/>Phân tích → Kế hoạch"]
    MODE --> |"Thêm tính năng"| FEATURE["FEATURE<br/>PM → Code → Test"]
    MODE --> |"Build game"| GAME["GAME<br/>Designer → Code → Test"]
    MODE --> |"AI feature"| AI["AI<br/>AI Engineer → Prompt → Data"]
    MODE --> |"Khác"| OTHER["Khác<br/>Test · Review · Design · Debug"]

    DEFINE --> GATE1{{"OK?"}}
    FEATURE --> GATE1
    GATE1 --> |"✅ Yes"| BUILD["BUILD<br/>Code → Test → Security"]
    GATE1 --> |"❌ No"| REV1["Sửa lại DEFINE"]
    BUILD --> GATE2{{"OK?"}}
    GATE2 --> |"✅ Yes"| SHIP["SHIP<br/>Deploy → Monitor"]
    GATE2 --> |"❌ No"| REV2["Sửa lại BUILD"]
    SHIP --> END(["🎉 Production Ready"])

    style START fill:#1a1a2e,stroke:#e94560,color:#fff
    style CHAT_INT fill:#8e44ad,stroke:#9b59b6,color:#fff
    style ORCH fill:#0f3460,stroke:#e94560,color:#fff
    style MODE fill:#533483,stroke:#9b59b6,color:#fff
    style GATE1 fill:#533483,stroke:#f39c12,color:#fff
    style GATE2 fill:#533483,stroke:#f39c12,color:#fff
    style END fill:#1e8449,stroke:#2ecc71,color:#fff
    style REV1 fill:#c0392b,stroke:#e74c3c,color:#fff
    style REV2 fill:#c0392b,stroke:#e74c3c,color:#fff
    style DEFINE fill:#1a5276,stroke:#3498db,color:#fff
    style BUILD fill:#1a5276,stroke:#3498db,color:#fff
    style SHIP fill:#1a5276,stroke:#3498db,color:#fff
```

```mermaid
flowchart TD
    START(["User Request"])
    CHAT_INT{{"Chat Interpreter"}}
    ORCH(["Orchestrator<br/>production-grade"])

    START --> CHAT_INT
    CHAT_INT --> ORCH

    ORCH --> MODE{{"Classify Request<br/>23 Modes"}}

    MODE --> |"Full Build"| PHASE_DEFINE["DEFINE Phase<br/>BA → PM → Architect"]
    MODE --> |"Feature"| PHASE_FEATURE["FEATURE Phase<br/>PM → BE/FE → QA"]
    MODE --> |"Harden"| PHASE_HARDEN["HARDEN Phase<br/>Security → QA → Review"]
    MODE --> |"Ship"| PHASE_SHIP["SHIP Phase<br/>DevOps → SRE"]
    MODE --> |"Game Build"| PHASE_GAME["GAME Phase<br/>Designer → Engine → Level → Audio"]
    MODE --> |"AI Build"| PHASE_AI["AI Phase<br/>AI Engineer → Prompt → Data"]
    MODE --> |"Migrate"| PHASE_MIGRATE["MIGRATE Phase<br/>DB Eng → Software Eng → QA"]
    MODE --> |"Other"| PHASE_OTHER["Other Modes<br/>Test · Review · Design · Debug · etc."]

    PHASE_DEFINE --> GATE1{{"Gate 1<br/>Approve?"}}
    PHASE_FEATURE --> GATE1
    PHASE_HARDEN --> GATE2{{"Gate 2<br/>Approve?"}}
    PHASE_SHIP --> GATE2
    PHASE_GAME --> GATE3{{"Gate 3<br/>Approve?"}}
    PHASE_AI --> GATE3
    PHASE_OTHER --> GATE1

    GATE1 --> |"Yes"| BUILD["BUILD Phase<br/>BE → FE → QA → Security"]
    GATE1 --> |"No"| REVISE1["Revise DEFINE"]
    BUILD --> GATE2
    GATE2 --> |"Yes"| SHIP_DEPLOY["SHIP Phase<br/>Deploy → Monitor"]
    GATE2 --> |"No"| REVISE2["Revise BUILD"]
    SHIP_DEPLOY --> GATE3
    GATE3 --> |"Yes"| SUSTAIN["SUSTAIN Phase<br/>Monitor → Grow"]
    GATE3 --> |"No"| REVISE3["Revise SHIP"]
    SUSTAIN --> GROW["GROW Phase<br/>Growth → Optimize"]

    GROW --> END(["Output: Production<br/>Ready Code"])

    style START fill:#1a1a2e,stroke:#e94560,color:#fff
    style CHAT_INT fill:#8e44ad,stroke:#9b59b6,color:#fff
    style END fill:#16213e,stroke:#0f3460,color:#e94560
    style ORCH fill:#0f3460,stroke:#e94560,color:#fff
    style MODE fill:#533483,stroke:#e94560,color:#fff
    style GATE1 fill:#533483,stroke:#f39c12,color:#fff
    style GATE2 fill:#533483,stroke:#f39c12,color:#fff
    style GATE3 fill:#533483,stroke:#f39c12,color:#fff
    style REVISE1 fill:#c0392b,stroke:#e74c3c,color:#fff
    style REVISE2 fill:#c0392b,stroke:#e74c3c,color:#fff
    style REVISE3 fill:#c0392b,stroke:#e74c3c,color:#fff
```

### Middleware Chain (mỗi lần chạy skill)

```mermaid
flowchart TD
    REQ(["User Request"])
    PRE1["① SessionData<br/>Load profile + session state"]
    PRE2["② ContextLoader<br/>Memory + conventions + KIs"]
    PRE3b["③b DryRunContext<br/>System Prompt mock injection"]
    PRE3["③ SkillRegistry<br/>Progressive skill discovery"]
    PRE4["④ Guardrail<br/>Pre-tool authorization"]
    PRE5["⑤ Summarization<br/>Auto-compress context if >70%"]
    SKILL_EXEC["SKILL EXECUTION<br/>Engineer → QA → Security → ..."]
    POST1["⑥ QualityGate<br/>4-level validation 0-100"]
    POST2["⑦ BrownfieldSafety<br/>Regression + change manifest"]
    POST3["⑧ TaskTracking<br/>Update task.md"]
    POST4["⑨ Memory<br/>Async fact extraction"]
    POST5["⑩ GracefulFailure<br/>Stuck detection + retry limits"]
    POST6["⑪ ASIP<br/>Canonical self-improving loop"]
    POST7["⑫ CircuitBreaker<br/>Fault isolation + states"]
    POST8["⑬ Bulkhead<br/>Resource limits per worker"]
    POST9["⑭ Verification<br/>Evidence-First Verification"]
    RESULT(["Result / Next Skill"])

    REQ --> PRE1 --> PRE2 --> PRE3b --> PRE3 --> PRE4 --> PRE5 --> SKILL_EXEC
    SKILL_EXEC --> POST1 --> POST2 --> POST3 --> POST4 --> POST5 --> POST6 --> POST7 --> POST8 --> POST9 --> RESULT

    style REQ fill:#1a1a2e,stroke:#e94560,color:#fff
    style RESULT fill:#16213e,stroke:#0f3460,color:#e94560
    style SKILL_EXEC fill:#0f3460,stroke:#e94560,color:#fff
    style PRE1 fill:#1a5276,stroke:#3498db,color:#fff
    style PRE2 fill:#1a5276,stroke:#3498db,color:#fff
    style PRE3b fill:#1a5276,stroke:#3498db,color:#fff
    style PRE3 fill:#1a5276,stroke:#3498db,color:#fff
    style PRE4 fill:#1a5276,stroke:#3498db,color:#fff
    style PRE5 fill:#1a5276,stroke:#3498db,color:#fff
    style POST1 fill:#1e8449,stroke:#2ecc71,color:#fff
    style POST2 fill:#1e8449,stroke:#2ecc71,color:#fff
    style POST3 fill:#1e8449,stroke:#2ecc71,color:#fff
    style POST4 fill:#1e8449,stroke:#2ecc71,color:#fff
    style POST5 fill:#1e8449,stroke:#2ecc71,color:#fff
    style POST6 fill:#1e8449,stroke:#2ecc71,color:#fff
    style POST7 fill:#1e8449,stroke:#2ecc71,color:#fff
    style POST8 fill:#1e8449,stroke:#2ecc71,color:#fff
    style POST9 fill:#1e8449,stroke:#2ecc71,color:#fff
```

### Session Lifecycle (Turn-Start + Turn-Close)

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Orch as Orchestrator
    participant Mem as Memory memory
    participant DAI as DAI Nexus Node
    participant Skill as Skills

    User->>Orch: New Session Start

    Orch->>Orch: Step 0.5: Load .dainexus/ context
    Orch->>Orch: Step 1: Load project-profile.json
    Orch->>Orch: Step 2: Load session-log.json
    Orch->>Orch: Step 3: memory search + code-conventions
    Orch->>DAI: Step 3.5: Check index freshness
    Orch->>Orch: Step 4: Detect greenfield vs brownfield

    rect rgb(20, 30, 60)
        Note over Orch,Skill: FOR EACH REQUEST (within session)

        User->>Orch: Request

        rect rgb(30, 50, 80)
            Note over Orch: TURN-START
            Orch->>Mem: T1: Load CONVERSATION_SUMMARY.md
            Orch->>Mem: T2: memory search recent turns + session
            Orch->>Mem: T3: Load BA scope + pipeline context
        end

        Orch->>Skill: Route to skills via Plan Quality Loop
        Skill-->>Orch: Skill output

        rect rgb(20, 60, 40)
            Note over Orch: TURN-CLOSE (mandatory)
            Orch->>Mem: TC1: Auto-generate CONVERSATION_SUMMARY.md
            Orch->>Mem: TC2: memory add REQ/DONE/OPEN/SCOPE_UPDATE
            Orch->>Mem: TC3: Optional: decisions/architecture/blockers
        end

        Orch-->>User: Response
    end

    User->>Orch: Session End
```

### Game Studio Control Plane (7 pha + 18 kỹ năng game)

Game Build mode hiện vận hành theo control plane dựa trên artifact, từ ý tưởng
đến bản phát hành có thể kiểm chứng:

```text
Concept → Systems Design → Technical Setup → Pre-Production
        → Production → Polish → Release & Sustain
```

- **Handoff theo pha:** design-ready, implementation-ready, done, playtest,
  build và release evidence chỉ bắt buộc khi pha hiện tại áp dụng.
- **Điều phối theo dependency:** việc phụ thuộc chạy tuần tự; các scope độc lập
  mới được dùng `pipeline`, `fan-out/fan-in` hoặc `hierarchical` với số worker
  bị giới hạn.
- **Chọn subagent theo năng lực:** control plane chọn tier `scout`, `builder`
  hoặc `expert` trước, sau đó chỉ resolve model cụ thể từ capability đã được
  runtime xác minh. Không hard-code model ID.
- **Fan-in giữ chất lượng:** mỗi worker có path ownership, checks, token budget,
  deadline và stop conditions; việc rủi ro cao và reviewer độc lập luôn dùng
  tier `expert`.
- **Release có bằng chứng:** artifact identity, checksum, publish/deployment,
  telemetry/crash smoke, rollback readiness và post-release checkpoint.

Đọc [workflow Game Studio](workflows/game-studio-build.md) để bắt đầu và dùng
[control-plane protocol](skills/_shared/protocols/game-studio-pipeline.md) làm
nguồn chuẩn cho gate, role lanes, model-aware dispatch và evidence.

Sơ đồ dưới đây mô tả các discipline/engine lanes được dùng bên trong những pha
phù hợp; nó không thay thế 7 phase gates của control plane.

```mermaid
flowchart TD
    START(["Game Build Request"])

    START --> DESIGNER["Game Designer<br/>Concept → GDD → MVP Spec"]
    DESIGNER --> ART_STYLE["Art Style + Visual Foundations<br/>Color · Shape · Composition · Lighting · Motion"]

    ART_STYLE --> ENGINE{{"Choose Engine"}}
    ENGINE --> |"Unity"| UNITY["Unity Engineer<br/>C# · ScriptableObjects · DOTS · ShaderGraph"]
    ENGINE --> |"Unreal"| UNREAL["Unreal Engineer<br/>C++ · Blueprint · GAS · Nanite · Lumen"]
    ENGINE --> |"Godot"| GODOT["Godot Engineer<br/>GDScript · Scene Tree · Signals · Godot 4"]
    ENGINE --> |"Phaser 3"| PHASER["Phaser 3 Engineer<br/>TypeScript · ECS · WebGL · Object Pool"]
    ENGINE --> |"Three.js"| THREEJS["Three.js Engineer<br/>ECS · WebGPU · Rapier Physics · PostFX"]
    ENGINE --> |"Roblox"| ROBLOX["Roblox Engineer<br/>Luau · Studio · DataStores"]

    UNITY --> LEVEL["Level Designer<br/>Layout · Pacing · Spatial Design"]
    UNREAL --> LEVEL
    GODOT --> LEVEL
    PHASER --> LEVEL
    THREEJS --> LEVEL
    ROBLOX --> LEVEL

    LEVEL --> TECH_ART["Technical Artist<br/>Shaders · VFX · Pipeline · DCC"]
    LEVEL --> NARRATIVE["Narrative Designer<br/>Story · Dialogue · Quest Design"]
    LEVEL --> AUDIO["Game Audio Engineer<br/>SFX · Music · Spatial Audio · Wwise/FMOD"]

    TECH_ART --> BUILD["BUILD Phase<br/>Implement → Integrate → Polish"]
    NARRATIVE --> BUILD
    AUDIO --> BUILD

    BUILD --> GAME_TEST{{"Game Test Protocol"}}
    GAME_TEST --> |"Mechanics"| MT["Mechanics Validation<br/>Physics · Controls · Collision · FSM"]
    GAME_TEST --> |"Balance"| BT["Balance Validation<br/>Economy · Difficulty · Progression"]
    GAME_TEST --> |"Performance"| PT["Performance Validation<br/>FPS · Memory · Load · Platform"]
    GAME_TEST --> |"Build"| BT2["Build Validation<br/>Platform · Crash · CI/CD"]
    GAME_TEST --> |"Platform"| PLT["Platform Validation<br/>iOS · Android · Console · WebGL"]

    MT --> SHIP["SHIP Phase<br/>Build · Store · Release"]
    BT --> SHIP
    PT --> SHIP
    BT2 --> SHIP
    PLT --> SHIP

    SHIP --> SUSTAIN["SUSTAIN Phase<br/>Analytics · LiveOps · Content Drops"]
    SUSTAIN --> END(["Shipped Game"])

    style START fill:#1a1a2e,stroke:#e94560,color:#fff
    style END fill:#16213e,stroke:#0f3460,color:#e94560
    style ENGINE fill:#533483,stroke:#9b59b6,color:#fff
    style GAME_TEST fill:#d35400,stroke:#e67e22,color:#fff
    style ART_STYLE fill:#1e8449,stroke:#2ecc71,color:#fff
```

### Full Build Pipeline (6 Phase + 3 Cổng kiểm tra)

```mermaid
flowchart LR
    START(["User Request"])

    START --> DEFINE["DEFINE Phase<br/>Business Analyst<br/>Product Manager<br/>Solution Architect"]

    DEFINE --> GATE1{{"Gate 1<br/>Plan Approved?"}}
    GATE1 --> |"No"| REV1["Revise DEFINE"]
    GATE1 --> |"Yes"| BUILD["BUILD Phase<br/>Backend Engineer<br/>Frontend Engineer<br/>QA Engineer<br/>Security Engineer"]

    BUILD --> GATE2{{"Gate 2<br/>Code Approved?"}}
    GATE2 --> |"No"| REV2["Revise BUILD"]
    GATE2 --> |"Yes"| HARDEN["HARDEN Phase<br/>Security Engineer<br/>QA Engineer<br/>Code Reviewer<br/>Accessibility Engineer"]

    HARDEN --> SHIP["SHIP Phase<br/>DevOps<br/>SRE<br/>Database Engineer<br/>Performance Engineer"]

    SHIP --> GATE3{{"Gate 3<br/>Deploy Approved?"}}
    GATE3 --> |"No"| REV3["Revise SHIP"]
    GATE3 --> |"Yes"| SUSTAIN["SUSTAIN Phase<br/>Monitor<br/>Test · Review<br/>Document"]

    SUSTAIN --> GROW["GROW Phase<br/>Growth Marketer<br/>Conversion Optimizer<br/>AI Engineer"]

    GROW --> END(["Production Ready"])

    style START fill:#1a1a2e,stroke:#e94560,color:#fff
    style END fill:#16213e,stroke:#0f3460,color:#e94560
    style GATE1 fill:#533483,stroke:#f39c12,color:#fff
    style GATE2 fill:#533483,stroke:#f39c12,color:#fff
    style GATE3 fill:#533483,stroke:#f39c12,color:#fff
    style REV1 fill:#c0392b,stroke:#e74c3c,color:#fff
    style REV2 fill:#c0392b,stroke:#e74c3c,color:#fff
    style REV3 fill:#c0392b,stroke:#e74c3c,color:#fff
    style DEFINE fill:#0f3460,stroke:#3498db,color:#fff
    style BUILD fill:#0f3460,stroke:#3498db,color:#fff
    style HARDEN fill:#0f3460,stroke:#3498db,color:#fff
    style SHIP fill:#0f3460,stroke:#3498db,color:#fff
    style SUSTAIN fill:#0f3460,stroke:#3498db,color:#fff
    style GROW fill:#0f3460,stroke:#3498db,color:#fff
```

### NotebookLM Research Workflow (Research Mode — v0.5.19)

```mermaid
flowchart TD
    START(["Deep Research Request"])

    START --> CHECK_AUTH["1. Check Auth<br/>nlm auth status"]
    CHECK_AUTH --> CHECK_NOTEBOOK["2. Check Notebooks<br/>nlm notebook list"]

    CHECK_NOTEBOOK --> |"New topic"| CREATE["3. Create Notebook<br/>nlm notebook create"]
    CHECK_NOTEBOOK --> |"Existing notebook"| EXISTING["Use existing notebook<br/>nlm notebook get"]
    CREATE --> ADD_SOURCES

    EXISTING --> ADD_SOURCES["3. Add Sources<br/>URL · YouTube · Text · Drive"]

    ADD_SOURCES --> RESEARCH{{"Research Mode"}}
    RESEARCH --> |"Fast"| FAST["4a. Fast Research<br/>~30s · ~10 sources"]
    RESEARCH --> |"Deep"| DEEP["4b. Deep Research<br/>~5min · ~40+ sources"]

    FAST --> IMPORT["5. Import Sources<br/>nlm research import"]
    DEEP --> IMPORT

    IMPORT --> SYNTH["6. Synthesize<br/>nlm notebook describe<br/>nlm notebook query"]
    SYNTH --> CROSS{{"Cross-Notebook?"}}
    CROSS --> |"Yes"| CROSS_Q["7. Cross Query<br/>nlm cross query"]
    CROSS --> |"No"| GENERATE

    CROSS_Q --> GENERATE["8. Generate Content<br/>nlm audio create<br/>nlm report create<br/>nlm quiz create<br/>nlm slides create<br/>nlm infographic create"]

    GENERATE --> POLL["9. Poll Status<br/>nlm studio status"]
    POLL --> |"In progress"| POLL
    POLL --> |"Completed"| DOWNLOAD["10. Download Artifact<br/>nlm download audio<br/>nlm download report<br/>nlm download slides"]

    DOWNLOAD --> TAG["11. Tag + Alias<br/>nlm tag add<br/>nlm alias set"]

    TAG --> END(["Grounded Research Report"])

    style START fill:#1a1a2e,stroke:#e94560,color:#fff
    style END fill:#16213e,stroke:#0f3460,color:#e94560
    style RESEARCH fill:#533483,stroke:#9b59b6,color:#fff
    style CROSS fill:#d35400,stroke:#e67e22,color:#fff
    style CHECK_AUTH fill:#1a5276,stroke:#3498db,color:#fff
    style CHECK_NOTEBOOK fill:#1a5276,stroke:#3498db,color:#fff
    style ADD_SOURCES fill:#1a5276,stroke:#3498db,color:#fff
    style SYNTH fill:#1e8449,stroke:#2ecc71,color:#fff
    style GENERATE fill:#1e8449,stroke:#2ecc71,color:#fff
    style DOWNLOAD fill:#1e8449,stroke:#2ecc71,color:#fff
    style TAG fill:#1e8449,stroke:#2ecc71,color:#fff
```

### DAI memory — Ingest Pipeline (phân tích code)

Code intelligence và bộ nhớ dự án là plugin DAI memory, gắn vào `vendor/dai-memory` dưới dạng git submodule (ghim một commit của repo plugin). Mỗi dự án có kho riêng ở `.memory/`.

```mermaid
flowchart LR
    ING["dai-memory ingest"]

    subgraph SCAN["① Quét"]
        S1["file git theo dõi<br/>+ .memoryignore"]
        S2["che secret<br/>trước khi lưu"]
        S3["bỏ qua file không đổi<br/>(hash trong meta.json)"]
    end

    subgraph PARSE["② Parse — tree-sitter (wasm)"]
        P1["khai báo, lời gọi, import"]
        P2["grammar vendor khi<br/>bản upstream hỏng"]
    end

    subgraph GRAPH["③ Đồ thị"]
        G1["luồng thực thi<br/>(entry point → những gì nó chạm tới)"]
        G2["cộng đồng trong call graph"]
        G3["route HTTP, MCP tools,<br/>taint, PDG"]
    end

    subgraph MEM["④ Bộ nhớ"]
        M1["quyết định, sự cố,<br/>ràng buộc, quy trình"]
        M2["BM25 + vector + đồ thị<br/>hợp nhất bằng RRF"]
    end

    DB[(<b>LadybugDB<br/>.memory/store.lbug</b>)]

    ING --> SCAN --> PARSE --> GRAPH --> DB
    MEM --> DB

    style ING fill:#0f3460,stroke:#e94560,color:#fff
    style DB fill:#16213e,stroke:#4B0082,color:#fff
    style SCAN fill:#1a5276,stroke:#3498db
    style PARSE fill:#1a5276,stroke:#3498db
    style GRAPH fill:#1e8449,stroke:#2ecc71
    style MEM fill:#d35400,stroke:#e67e22
```

### Multi-Repo Group Management (quản lý nhóm multi-repo)

```mermaid
flowchart TD
    CLI["dai-memory group CLI"]
    MCP["MCP Tools<br/>dai_memory_groups · contracts"]
    GROUPS[("Groups<br/>danh sách repo trên máy")]
    CONTRACTS[("Contracts<br/>lời gọi xuyên repo")]
    REPOS[("Repo đã index<br/>mỗi repo một .memory/")]

    CLI --> |"group create / add / remove"| GROUPS
    CLI --> |"contracts"| CONTRACTS
    MCP --> CONTRACTS
    GROUPS --> |"nối qua route và client"| CONTRACTS
    REPOS --> |"dai-memory ingest"| CONTRACTS

    style CLI fill:#0f3460,stroke:#e94560,color:#fff
    style MCP fill:#0f3460,stroke:#e94560,color:#fff
    style GROUPS fill:#16213e,stroke:#4B0082,color:#fff
    style CONTRACTS fill:#1e8449,stroke:#2ecc71,color:#fff
    style REPOS fill:#1a5276,stroke:#3498db,color:#fff
```

### DAI Nexus Node Enterprise — Local Automation

DAI Nexus/DAI Nexus Node chạy local-first; GitHub/GitLab chỉ là nơi lưu source nếu team muốn dùng, không phải nơi quyết định PASS/FAIL.

```mermaid
flowchart LR
    CHANGE["Working tree / staged change"] --> REVIEW["Local Review<br/>Blast Radius"]
    CHANGE --> CONTRACT["Local OpenAPI<br/>Contract Check"]
    REVIEW --> RECEIPT["Local Receipt<br/>Risk + Evidence"]
    CONTRACT --> RECEIPT

    SCHEDULE["OS Scheduler"] --> REINDEX["Local Reindex"]
    SCHEDULE --> DEPS["Dependency/Security Check"]
    REINDEX --> LOCALINDEX["Local code graph<br/>(.memory/)"]
    DEPS --> RECEIPT

    style CHANGE fill:#0f3460,stroke:#e94560,color:#fff
    style SCHEDULE fill:#0f3460,stroke:#e94560,color:#fff
    style RECEIPT fill:#1e8449,stroke:#2ecc71,color:#fff
    style REINDEX fill:#1e8449,stroke:#2ecc71,color:#fff
```

#### Lệnh local

| Lệnh | Mô tả |
|-------|--------|
| `node scripts/ci/local-ci.mjs review` | Phân tích blast radius + contract check |
| `node scripts/ci/local-ci.mjs reindex` | Cập nhật code graph local (`dai-memory ingest`) |
| `node scripts/ci/local-ci.mjs wiki` | Reindex + kiểm tra tài liệu local |
| `node scripts/ci/local-ci.mjs security` | Audit dependency + automation policy |
| `node scripts/ci/local-ci.mjs compat` | Test matrix runtime được hỗ trợ |
| `npm run ci:schedule:install` | Cài lịch quick/deps bằng scheduler của OS |

#### Tính năng Enterprise

| Tính năng | Local CLI | Local Scheduler | Dry Run |
|------------|-----------|-----------------|---------|
| Blast Radius Review | ✅ | Có thể lên lịch | ✅ |
| Kiểm tra contract OpenAPI | ✅ | Có thể lên lịch | ✅ |
| Wiki/Reindex | ✅ | ✅ | ✅ |
| Dependency/Security audit | ✅ | ✅ | ✅ |
| Quản lý Multi-Repo Groups | ✅ | N/A | ✅ |
| Phân tích ảnh hưởng xuyên repos | ✅ | Có thể lên lịch | ✅ |

Hosted CI adapter chỉ được thêm khi người dùng chủ động yêu cầu provider cụ thể và adapter phải gọi lại chính các lệnh local ở trên.

### Claude Code Hooks — Auto-Reindex

```mermaid
flowchart TD
    HOOK_PRE[("pre-tool-use hook<br/>Enrich context")]
    HOOK_POST[("post-tool-use hook<br/>Auto-reindex")]

    subgraph PRE_HOOK["pre-tool-use.ts"]
        T1{"tool name?"}
        T_GREP["grep / search<br/>DAI Nexus Node search<br/>→ show callers"]
        T_READ["read file<br/>→ show file symbols"]
        T_EDIT["edit / Write<br/>→ warn about callers"]
        T_SKIP["Other tools<br/>→ skip"]
    end

    subgraph POST_HOOK["post-tool-use.ts"]
        G1{"git commit<br/>detected?"}
        G2["Find .memory/<br/>detect last commit"]
        G3["Spawn incremental<br/>dai-memory ingest"]
        G4["Success → log<br/>Failure → warn"]
    end

    HOOK_PRE --> PRE_HOOK
    PRE_HOOK --> T1
    T1 --> |"grep/search"| T_GREP
    T1 --> |"read"| T_READ
    T1 --> |"edit/Write"| T_EDIT
    T1 --> |"other"| T_SKIP

    HOOK_POST --> POST_HOOK
    POST_HOOK --> G1
    G1 --> |"yes"| G2 --> G3 --> G4
    G1 --> |"no"| G_SKIP["(no action)"]

    style HOOK_PRE fill:#6c3483,stroke:#9b59b6,color:#fff
    style HOOK_POST fill:#6c3483,stroke:#9b59b6,color:#fff
    style PRE_HOOK fill:#1a1a2e,stroke:#9b59b6
    style POST_HOOK fill:#1a1a2e,stroke:#9b59b6
    style T_GREP fill:#1e8449,stroke:#2ecc71,color:#fff
    style T_READ fill:#1e8449,stroke:#2ecc71,color:#fff
    style T_EDIT fill:#d35400,stroke:#e67e22,color:#fff
    style G3 fill:#d35400,stroke:#e67e22,color:#fff
```

### 23 Modes — Bạn nói gì, DAI Nexus chọn cái đó

```mermaid
flowchart LR
    INPUT["Bạn nói..."]

    INPUT --> F1["Build SaaS<br/>Production Grade"]
    INPUT --> F2["Thêm tính năng"]
    INPUT --> F3["Build Game<br/>Unity/Unreal/Godot/Roblox"]
    INPUT --> F4["Build VR/AR"]
    INPUT --> F5["Build Mobile<br/>iOS/Android"]
    INPUT --> F6["AI Feature<br/>RAG/LLM/Chatbot"]
    INPUT --> F7["Review Code<br/>Kiểm tra chất lượng"]
    INPUT --> F8["Viết Tests"]
    INPUT --> F9["Deploy CI/CD<br/>Docker/Terraform"]
    INPUT --> F10["Design UI<br/>UX Research"]
    INPUT --> F11["Optimize<br/>Performance"]
    INPUT --> F12["Research sâu"]
    INPUT --> F13["Marketing"]
    INPUT --> F14["Debug Fix<br/>Bug Trace"]
    INPUT --> F15["Analyze<br/>Requirements"]
    INPUT --> F16["Migrate DB"]
    INPUT --> F17["Harden Security<br/>Audit + Fix"]
    INPUT --> F18["Design Architecture<br/>API/Data Model"]
    INPUT --> F19["Write Docs<br/>Tài liệu"]
    INPUT --> F20["Improve Prompts<br/>Prompt Engineering"]

    F1 --> M1{{"Full Build"}}
    F2 --> M2{{"Feature"}}
    F3 --> M3{{"Game Build"}}
    F4 --> M4{{"XR Build"}}
    F5 --> M5{{"Mobile"}}
    F6 --> M6{{"AI Build"}}
    F7 --> M7{{"Review"}}
    F8 --> M8{{"Test"}}
    F9 --> M9{{"Ship"}}
    F10 --> M10{{"Design"}}
    F11 --> M11{{"Optimize"}}
    F12 --> M12{{"Research"}}
    F13 --> M13{{"Marketing"}}
    F14 --> M14{{"Debug"}}
    F15 --> M15{{"Analyze"}}
    F16 --> M16{{"Migrate"}}
    F17 --> M17{{"Harden"}}
    F18 --> M18{{"Architect"}}
    F19 --> M19{{"Document"}}
    F20 --> M20{{"Prompt"}}

    M1 --> SK1["BA → PM → Architect →<br/>BE → FE → QA →<br/>Security → DevOps → SRE"]
    M2 --> SK2["PM → Architect →<br/>BE/FE → QA"]
    M3 --> SK3["Game Designer →<br/>Engine Engineer →<br/>Level → Narrative →<br/>Technical Art → Audio"]
    M4 --> SK4["XR Engineer →<br/>XR Game Pipeline"]
    M5 --> SK5["BA → Mobile Engineer →<br/>PM → Architect"]
    M6 --> SK6["AI Engineer →<br/>Prompt Engineer →<br/>Data Scientist"]
    M7 --> SK7["Code Reviewer"]
    M8 --> SK8["QA Engineer"]
    M9 --> SK9["DevOps → SRE"]
    M10 --> SK10["UX Researcher →<br/>UI Designer"]
    M11 --> SK11["Performance Engineer →<br/>SRE"]
    M12 --> SK12["NotebookLM Researcher\n(+ Polymath web search)"]
    M13 --> SK13["Growth Marketer →<br/>Conversion Optimizer"]
    M14 --> SK14["Debugger →<br/>Engineer"]
    M15 --> SK15["Business Analyst"]
    M16 --> SK16["Database Engineer →<br/>Software Eng → QA"]
    M17 --> SK17["Security → QA →<br/>Code Review → Fix"]
    M18 --> SK18["Solution Architect"]
    M19 --> SK19["Technical Writer"]
    M20 --> SK20["Prompt Engineer →<br/>chat-interpreter →<br/>prompt-techniques → templates"]

    style INPUT fill:#1a1a2e,stroke:#e94560,color:#fff
    style M1 fill:#533483,stroke:#9b59b6,color:#fff
    style M2 fill:#533483,stroke:#9b59b6,color:#fff
    style M3 fill:#533483,stroke:#9b59b6,color:#fff
    style M4 fill:#533483,stroke:#9b59b6,color:#fff
    style M5 fill:#533483,stroke:#9b59b6,color:#fff
    style M6 fill:#533483,stroke:#9b59b6,color:#fff
    style M7 fill:#533483,stroke:#9b59b6,color:#fff
    style M8 fill:#533483,stroke:#9b59b6,color:#fff
    style M9 fill:#533483,stroke:#9b59b6,color:#fff
    style M10 fill:#533483,stroke:#9b59b6,color:#fff
    style M11 fill:#533483,stroke:#9b59b6,color:#fff
    style M12 fill:#533483,stroke:#9b59b6,color:#fff
    style M13 fill:#533483,stroke:#9b59b6,color:#fff
    style M14 fill:#533483,stroke:#9b59b6,color:#fff
    style M15 fill:#533483,stroke:#9b59b6,color:#fff
    style M16 fill:#533483,stroke:#9b59b6,color:#fff
    style M17 fill:#533483,stroke:#9b59b6,color:#fff
    style M18 fill:#533483,stroke:#9b59b6,color:#fff
    style M19 fill:#533483,stroke:#9b59b6,color:#fff
    style M20 fill:#8e44ad,stroke:#9b59b6,color:#fff
    style SK1 fill:#0f3460,stroke:#3498db,color:#fff
    style SK2 fill:#0f3460,stroke:#3498db,color:#fff
    style SK3 fill:#0f3460,stroke:#3498db,color:#fff
    style SK4 fill:#0f3460,stroke:#3498db,color:#fff
    style SK5 fill:#0f3460,stroke:#3498db,color:#fff
    style SK6 fill:#0f3460,stroke:#3498db,color:#fff
    style SK7 fill:#0f3460,stroke:#3498db,color:#fff
    style SK8 fill:#0f3460,stroke:#3498db,color:#fff
    style SK9 fill:#0f3460,stroke:#3498db,color:#fff
    style SK10 fill:#0f3460,stroke:#3498db,color:#fff
    style SK11 fill:#0f3460,stroke:#3498db,color:#fff
    style SK12 fill:#0f3460,stroke:#3498db,color:#fff
    style SK13 fill:#0f3460,stroke:#3498db,color:#fff
    style SK14 fill:#0f3460,stroke:#3498db,color:#fff
    style SK15 fill:#0f3460,stroke:#3498db,color:#fff
    style SK16 fill:#0f3460,stroke:#3498db,color:#fff
    style SK17 fill:#0f3460,stroke:#3498db,color:#fff
    style SK18 fill:#0f3460,stroke:#3498db,color:#fff
    style SK19 fill:#0f3460,stroke:#3498db,color:#fff
    style SK20 fill:#8e44ad,stroke:#3498db,color:#fff
```

---

## 83 Skills — Dùng cái nào, khi nào?

```mermaid
flowchart TD
    USER["Bạn muốn làm gì?"]

    USER --> |"Build website/app mới"| SaaS["📦 Core Engineering<br/>22 kỹ năng"]
    USER --> |"Build game (Unity/Unreal/Godot)"| GAME["🎮 Game Development<br/>18 kỹ năng"]
    USER --> |"Tối ưu / debug code"| OPT["🔧 Optimization, Debug & Test<br/>Performance · Debugger · QA · LLM Tester"]
    USER --> |"Research / phân tích dữ liệu"| DATA["📊 Data & AI<br/>AI Engineer · Data Scientist · NotebookLM"]
    USER --> |"Deploy / CI/CD / infra"| DEVOPS["🚀 DevOps & Ship<br/>DevOps · SRE · Database"]
    USER --> |"Marketing / tăng trưởng"| GROW["📈 Growth<br/>Growth Marketer · Conversion Optimizer"]
    USER --> |"Design / UX"| DESIGN["🎨 Design & UX<br/>UX Researcher · UI Designer"]

    SaaS --> SaaS_DETAIL["<b>22 kỹ năng:</b><br/>Business Analyst · Product Manager<br/>Solution Architect · Software Engineer<br/>Frontend · QA · Security · DevOps · SRE<br/>Database · API Designer · Prompt Engineer"]
    GAME --> GAME_DETAIL["<b>18 kỹ năng:</b><br/>Game Designer · Unity/Unreal/Godot/Roblox Engineer<br/>Level Designer · Narrative Designer<br/>Technical Artist · Game Audio Engineer<br/>XR Engineer"]
    OPT --> OPT_DETAIL["<b>Tối ưu:</b> Performance Engineer<br/><b>Debug:</b> Debugger → Software Engineer<br/><b>Test:</b> QA Engineer · LLM Tester"]
    DATA --> DATA_DETAIL["<b>AI:</b> AI Engineer · Prompt Engineer · Data Scientist<br/><b>Research:</b> NotebookLM Researcher<br/><b>Web:</b> Web Scraper · XLSX Engineer"]
    DEVOPS --> DEVOPS_DETAIL["<b>Ship:</b> DevOps · SRE · Performance Engineer<br/><b>Data:</b> Database Engineer<br/><b>API:</b> API Designer"]
    GROW --> GROW_DETAIL["<b>Tăng trưởng:</b> Growth Marketer<br/><b>Chuyển đổi:</b> Conversion Optimizer"]
    DESIGN --> DESIGN_DETAIL["<b>Research:</b> UX Researcher<br/><b>Design:</b> UI Designer<br/><b>Accessibility:</b> Accessibility Engineer"]

    style USER fill:#1a1a2e,stroke:#e94560,color:#fff
    style SaaS fill:#1a5276,stroke:#3498db,color:#fff
    style GAME fill:#1a5276,stroke:#3498db,color:#fff
    style OPT fill:#1a5276,stroke:#3498db,color:#fff
    style DATA fill:#1a5276,stroke:#3498db,color:#fff
    style DEVOPS fill:#1a5276,stroke:#3498db,color:#fff
    style GROW fill:#1a5276,stroke:#3498db,color:#fff
    style DESIGN fill:#1a5276,stroke:#3498db,color:#fff
    style SaaS_DETAIL fill:#0f3460,stroke:#3498db,color:#fff
    style GAME_DETAIL fill:#0f3460,stroke:#3498db,color:#fff
    style OPT_DETAIL fill:#0f3460,stroke:#3498db,color:#fff
    style DATA_DETAIL fill:#0f3460,stroke:#3498db,color:#fff
    style DEVOPS_DETAIL fill:#0f3460,stroke:#3498db,color:#fff
    style GROW_DETAIL fill:#0f3460,stroke:#3498db,color:#fff
    style DESIGN_DETAIL fill:#0f3460,stroke:#3498db,color:#fff
```

---

## Cài đặt chi tiết

### Cách 1: Thêm vào dự án khác như submodule

**Bước 1:** Mở Terminal, chạy từ thư mục gốc dự án của bạn:

```bash
git submodule add -b main https://github.com/Exia-thd/DAI-nexus dai-nexus
```

**Bước 2:** Copy 2 file cần thiết:

```bash
cp dai-nexus/AGENTS.md .
cp dai-nexus/CLAUDE.md .
```

**Bước 3:** Commit:

```bash
git add .gitmodules dai-nexus AGENTS.md CLAUDE.md
git commit -m "feat: add dai-nexus"
```

**Bước 4:** Khởi tạo submodule:

```bash
git submodule update --init --recursive
```

### Cách 2: Nâng cấp lên Level 2 (Smart)

Cần: **Node.js 22+ cho runtime và CLI** (CI chính chạy Node.js 24 LTS và có lane tương thích Node.js 22).

```bash
# Kiểm tra
node --version

# Nếu chưa có → tải tại nodejs.org
# macOS: brew install node
```

Sau đó:

```bash
python3 scripts/lite/dai_memory.py install && node "$(python3 scripts/lite/dai_memory.py where)/bin/dai-memory.mjs" init
```

Đợi 1-2 phút (lần đầu). Xong!

### Cách 3: Thêm bộ nhớ (Level 3)

Cần: **Python 3.8+**

```bash
# Kiểm tra
python3 --version
```

Sau đó:

```bash
bash dai-nexus/scripts/ensure-memory.sh "$(pwd)"
```

### Cách 4: Cài MCP server (Level 4)

Chạy 1 lệnh:

```bash
bash dai-nexus/scripts/dainexus-mcp-setup.sh
```

Sau đó khởi động lại Cursor/VS Code.

### Bước 5: Chạy Onboarding lần đầu tiên (Khuyến nghị)

Sau khi cài đặt xong và khởi động lại IDE (Cursor / Claude), việc đầu tiên bạn nên làm là mở khung chat AI và ra lệnh:

> Chạy `/onboard` để phân tích và khởi tạo thông tin dự án.

Lệnh này giúp DAI Nexus:
1. Tự động nhận diện ngôn ngữ & framework của dự án để tạo file cấu hình `.dainexus/project-profile.json`.
2. Kiểm tra sức khỏe hệ thống (các công cụ dev có sẵn).
3. Thiết lập bộ nhớ cơ sở (local memory baseline) cho dự án mới này.

### Kiểm tra đã cài đúng chưa

```bash
echo "=== Kiểm tra ==="
echo "Skills: $(ls dai-nexus/skills/ -1 2>/dev/null | wc -l | tr -d ' ')"
echo "MCP: $([ -d dai-nexus/.dainexus/mcp-server ] || [ -d ~/.dainexus/mcp-server ] && echo 'OK' || echo 'MISSING')"
echo "Memory: $([ -f .memory/meta.json ] && echo 'OK' || echo 'MISSING (dai-memory init)')"
```

---

## Tính năng bổ sung

### Bộ nhớ dự án — DAI memory

> Thay cho FluxMem (SQLite) và các kho memory cũ: dữ liệu cũ đã được di trú bằng `scripts/lite/migrate-memory.py`.

Vấn đề lớn nhất của các phiên chat AI dài là **context bloat (phình to ngữ cảnh)** — AI sẽ quên mất phần đầu của cuộc trò chuyện, dẫn tới việc lặp lại các lỗi cũ.

**DAI memory** (plugin riêng, gắn vào `vendor/dai-memory` dưới dạng git submodule) giữ phần cần nhớ ngoài ngữ cảnh và trả lại đúng lúc:

1. **Ba lớp ký ức**: `semantic` (quyết định, ràng buộc, quy ước — đúng tới khi bị thay thế), `episodic` (sự cố, phiên làm việc, checkpoint), `procedural` (quy trình, cách làm).
2. **Code graph chung kho**: khai báo, lời gọi, import, luồng thực thi và cộng đồng của code nằm cùng kho, nên một ký ức gắn được vào đúng hàm/file nó nói tới (`dai-memory why <file|symbol>`).
3. **Quy trình đã thành công**: khi phiên kết thúc với điểm PES đạt ngưỡng, session tracker ghi lại chuỗi bước thành một ký ức `procedure`; bài học từ NotebookLM được ghi thành ký ức gắn với kỹ năng tương ứng.
4. **Sự cố không lặp lại**: plan thất bại hoặc blocker được ghi thành `incident`, để phiên sau tìm thấy trước khi đi lại vết cũ.
5. **Passive Idle Trigger (Tự động lưu checkpoint khi treo máy)**: Tự động tạo checkpoint sau **10 phút** không có phản hồi nếu phiên chat đang có tin nhắn chưa lưu, tránh mất dữ liệu khi IDE mất kết nối đột ngột.

---

## Featured: MCP Tool Sandbox & Context Offload (DeerFlow IV)

Để chống phình to ngữ cảnh (context bloat) và tối ưu hóa token trong các phiên chat dài, DAI Nexus tích hợp bộ đôi middleware trung gian trực tiếp trong luồng thực thi công cụ MCP (chạy tại giai đoạn ④c và ④d):

1. **Tool Sandbox (Middleware ④c)**: Tự động chặn và kiểm duyệt mọi kết quả trả về của công cụ, loại bỏ mã màu ANSI, ngăn chặn tấn công Prompt Injection, và tự động ẩn/redact các thông tin nhạy cảm (như API keys, bearer tokens, chuỗi kết nối database PostgreSQL/MongoDB/MySQL) trước khi đưa vào cache hoặc ngữ cảnh của mô hình.
2. **Context Offload (Middleware ④d)**: Tự động đẩy các kết quả chạy công cụ có kích thước lớn hơn ngữ cảnh quy định (mặc định: 1200 tokens) ra ngoài ngữ cảnh lưu dưới dạng các file Markdown cục bộ tại `.dainexus/offload/<session_id>/refs/<node_id>.md`.
   - Ngữ cảnh mô hình chỉ nhận được một **mã tham chiếu truy vết (trace handle)** ngắn (ví dụ: `refs/n-X-tool-hash.md`) kèm theo bản tóm tắt cực kỳ ngắn gọn của kết quả.
   - Tiết kiệm lên tới 90% số lượng token trong ngữ cảnh.
   - Tự động duy trì và vẽ lại đồ thị luồng thực thi của phiên làm việc (`canvas.mmd` định dạng Mermaid) với các màu sắc biểu thị trạng thái trực quan (`queued`, `running`, `done`, `error`, `skipped`).

### Truy vết và Hợp nhất bộ nhớ Offload

Hai script mới được thêm vào để quản lý và vận hành hệ thống bộ nhớ này:

*   **Truy vết ngữ cảnh (`scripts/memory-trace.py`)**: Hỗ trợ tìm kiếm, kiểm tra và truy xuất nội dung offload trực tiếp từ terminal:
    ```bash
    # Liệt kê tất cả các sự kiện gọi công cụ trong một session
    python3 scripts/memory-trace.py trace-session <session_id>

    # Xem nội dung chi tiết và preview của một node kết quả cụ thể
    python3 scripts/memory-trace.py trace-node <node_id> --session <session_id>

    # In sơ đồ Mermaid thể hiện luồng chạy công cụ của session
    python3 scripts/memory-trace.py trace-canvas <session_id>
    ```
*   **Bộ nhớ dự án (DAI memory)**: Quyết định, sự cố, ràng buộc và quy trình được ghi vào `.memory/` qua `scripts/lite/dai_memory.py` (hoặc MCP tools `dai_memory_write` / `dai_memory_search`); checkpoint và bài học của phiên cũng đi vào cùng kho đó:
    ```bash
    python3 scripts/lite/dai_memory.py add "Quyết định: dùng JWT cho API" --category decision
    python3 scripts/lite/dai_memory.py search "JWT" --limit 5
    ```

---

### Research — NotebookLM CLI (v0.5.19)


> **AI nghiên cứu không sai.** Dùng Google NotebookLM để đọc tài liệu, tạo tóm tắt, quiz, flashcards, podcast, báo cáo, slide, và hơn thế nữa.

```bash
# Install (uv recommended)
pipx install notebooklm-mcp-cli

# Authenticate (launches browser, extracts cookies automatically)
nlm login

# Check status
nlm auth status        # Shows "Authenticated" with notebook count
nlm notebook list      # List all notebooks
nlm --ai              # Full AI-optimized documentation
```

**35+ tools:** notebook, source, research, studio, audio, video, report, quiz, flashcards, mindmap, slides, infographic, data-table, batch, cross-notebook, pipelines, tags, drive-sync, sharing, aliases.

### Web Scraping (crawl4ai)

```bash
pip install "crawl4ai>=0.8.0"
# Then: "Scrape [URL]" or "Crawl [website]"
```

### AI Vision Testing (Midscene.js)

```bash
npm install -g @anthropic-ai/midscene
# Then: "Test on Android" or "Test on iOS"
```

### Multi-Agent (Paperclip)

```bash
npx paperclipai onboard --yes
cd paperclip && pnpm dev
# Dashboard: http://localhost:3100
```

### Tích hợp LLM Wiki & Obsidian

DAI Nexus tích hợp với [nashsu/llm_wiki](https://github.com/nashsu/llm_wiki) và Obsidian để quản lý và trực quan hóa tài liệu của tất cả các dự án trong một **Shared Obsidian Vault** tập trung.

* **Không trùng lặp dung lượng (Symlink-based):** Tài liệu của mỗi dự án con được liên kết trực tiếp vào Vault bằng liên kết mềm (Symlink), đảm bảo cập nhật thời gian thực mà không làm tăng dung lượng đĩa.
* **Tự động hóa 2 lớp:**
  - **Post-Skill Hook:** AI tự động chạy đồng bộ khi đóng phiên làm việc (Session End).
  - **Git Hook (post-commit):** Tự động đồng bộ mỗi khi bạn commit thay đổi liên quan đến tài liệu (`docs/`, `README.md`, `TASKS.md`...).
* **Obsidian Graph View:** Trực quan hóa mối liên hệ kiến trúc, sơ đồ luồng dữ liệu APIs giữa các dự án.

Các lệnh thực thi:
```bash
# Đồng bộ dự án hiện tại vào Vault chung
./scripts/dainexus-wiki-sync.sh

# Quét và đồng bộ hàng loạt tất cả dự án trong thư mục GitHub
./scripts/dainexus-wiki-sync-all.sh
```

### Chuẩn hóa cấu trúc tài liệu dự án

Để duy trì tính nhất quán và tối ưu hóa việc truy xuất ngữ cảnh cho AI Agent (giảm thiểu ảo giác), các dự án DAI Nexus áp dụng cấu trúc thư mục tài liệu chuẩn hóa trong thư mục `docs/`:

*   **Cấu trúc thư mục**: Phân lớp rõ ràng sử dụng tiền tố số (ví dụ: `00-vision/` cho lộ trình phát triển, `01-product/` cho yêu cầu nghiệp vụ, `02-architecture/` cho thiết kế kiến trúc và ADR, `03-guides/` cho hướng dẫn lập trình viên, `04-testing/` cho QA test case, và `05-operations/` cho tài liệu vận hành).
*   **Quy tắc đặt tên file**: Chỉ sử dụng chữ viết thường và định dạng `kebab-case` (ví dụ: `api-specification.md`). Không sử dụng khoảng trắng hay tiếng Việt có dấu.
*   **Bản mẫu thiết lập sẵn**:
    *   [TEMPLATE-FEATURE-SPEC.md](docs/01-product/TEMPLATE-FEATURE-SPEC.md): Mẫu đặc tả tính năng và tiêu chí nghiệm thu chuẩn.
    *   [TEMPLATE-ADR.md](docs/02-architecture/adrs/TEMPLATE-ADR.md): Mẫu nhật ký quyết định kiến trúc (ADR) chuẩn.

---

## Quality Gate — Chấm điểm tự động

Chạy bất kỳ lúc nào để chấm điểm dự án 0-100:

```bash
bash scripts/dai-validate.sh

# Chế độ CI (chỉ exit code)
bash scripts/dai-validate.sh --quiet

# Báo cáo JSON
bash scripts/dai-validate.sh --json
```

| Điểm | Grade | Ý nghĩa |
|-------|-------|---------|
| 90–100 | A | Sẵn sàng production |
| 80–89 | B | Có vài lỗi nhỏ |
| 70–79 | C | Nên review |
| 60–69 | D | Sửa trước khi deploy |
| < 60 | F | Không chấp nhận được — chặn deploy |

---

## Bộ Công Cụ Kiểm Thử & Quản Lý Chất Lượng Chuẩn Enterprise

DAI Nexus hỗ trợ hạ tầng kiểm thử mã nguồn mở hoàn toàn miễn phí, chạy offline cục bộ, giúp loại bỏ hoàn toàn chi phí bản quyền SaaS bên thứ ba và đảm bảo chất lượng phần mềm không lọt lỗi (zero-escaped bugs):

*   **Property-Based Testing (PBT)**: Tích hợp thư viện `fast-check` (JS/TS) và `Hypothesis` (Python) giúp tự động sinh hàng ngàn bộ dữ liệu ngẫu nhiên, dị biệt để dò tìm các lỗi biên, lỗi logic cực đoan của thuật toán trước khi release.
*   **Mutation Testing (Kiểm thử đột biến)**: Tích hợp `Stryker` (JS/TS) và `mutmut` (Python) để tự động tiêm lỗi giả lập ("mutants") vào code logic, đánh giá độ tin cậy thực tế và chất lượng của bộ test case hiện có.
*   **Shift-Left Spec Gate & DoD**: Thiết lập chốt chặn chất lượng từ khâu Specs (quy trình ký duyệt ba bên PM + Dev Lead + QA Lead) kết hợp với Git Hooks (Husky + lint-staged) cục bộ và CI pipeline chạy song song cực nhanh, thực thi nghiêm ngặt tiêu chí Definition of Done (DoD).
*   **Visual Regression (VRT)**: Sử dụng trình so sánh ảnh gốc của Playwright kết hợp `pixelmatch` tại local hoặc chạy trong Docker container chính thức trên CI (nhằm đồng bộ font/giao diện render).
*   **Performance & Load**: Tích hợp k6 CLI đẩy số liệu thời gian thực trực tiếp về hệ thống cơ sở dữ liệu InfluxDB và trực quan hóa qua Grafana cục bộ (dựng qua Docker Compose).
*   **Mobile E2E**: Chạy Appium, Midscene.js tương tác bằng AI, và **Maestro (Chạy Local Miễn Phí)** trực tiếp trên máy ảo Android Emulator cục bộ (tạo qua [scripts/setup-local-emulators.sh](scripts/setup-local-emulators.sh)) hoặc iOS Simulator.

---

## 🖼️ Tự động vẽ sơ đồ Sequence Flow Chart Client-Server (NEW v8.8.0)

DAI Nexus tích hợp tính năng **Tự động vẽ và cập nhật Sequence Flow Chart** liên thông hoàn hảo giữa Client và Server sử dụng dữ liệu đồ thị tĩnh từ DAI memory và định tuyến Heuristics.

*   **Không tốn phí & Không cần chạy App**: Tự động khớp nối các lượt gọi API ở Client (`fetch`/`axios` trong file React/Next.js) sang API handler tương ứng ở Server (`route.ts`) mà không cần khởi chạy ứng dụng hay kết nối cơ sở dữ liệu.
*   **Truy vết sâu đồ thị cuộc gọi (Call Graph)**: Tự động chạy truy vấn đệ quy qua call graph của DAI memory (`dai-memory context`) để vẽ chi tiết luồng gọi (`Route -> Service -> Database/Prisma`).
*   **Sinh sơ đồ Mermaid chuyên nghiệp**: Xuất kết quả sơ đồ trình tự chuẩn Mermaid.js và cập nhật tự động vào thư mục [docs/architecture/flows/](docs/architecture/flows/).
*   **Lọc nhiễu thông minh & Tách tham số**: Tự động loại bỏ các hàm hệ thống/logs nhiễu (`console.log`, `execSync`, `NextResponse.json`...) để giữ sơ đồ sạch, đồng thời tách các Query Parameters truyền lên ở client và vẽ ghi chú (Mermaid Note) chi tiết.

**Cách sử dụng trong các dự án khác (Submodules):**

Để chạy và đồng bộ sơ đồ trình tự cho bất kỳ dự án nào tích hợp DAI Nexus dưới dạng submodule:

#### Bước 1: Cập nhật Submodule DAI Nexus mới nhất
Tại thư mục root của dự án đó, chạy lệnh sau để kéo mã nguồn script mới nhất về:
```bash
git submodule update --remote --merge
```

#### Bước 2: Đảm bảo dự án đã được lập chỉ mục (Indexing)
Sequence Generator yêu cầu call graph từ DAI memory. Nếu chưa có hoặc index cũ, hãy chạy:
```bash
# 1. Cài engine (một lần, cài ra ngoài repo)
python3 dai-nexus/scripts/lite/dai_memory.py install

# 2. Tạo chỉ mục đồ thị cho repo
node "$(python3 dai-nexus/scripts/lite/dai_memory.py where)/bin/dai-memory.mjs" init
```

#### Bước 3: Khởi chạy vẽ sơ đồ trình tự
Chạy script sinh sơ đồ thông qua các tham số cấu hình đường dẫn linh hoạt (CLI Arguments) của dự án đó:
```bash
npx tsx dai-nexus/scripts/generate-sequence.ts \
  --client <thư-mục-chứa-frontend> \
  --api <thư-mục-chứa-routes-api> \
  --repo <tên-repo (chỉ để hiển thị)> \
  --output <thư-mục-lưu-sơ-đồ>
```

*Ví dụ thực tế:*
Nếu dự án mới có Client tại `apps/web/src`, API routes tại `apps/web/src/pages/api`, tên repo là `my-saas-app`, và muốn lưu sơ đồ vào `docs/flows/`:
```bash
npx tsx dai-nexus/scripts/generate-sequence.ts \
  --client apps/web/src \
  --api apps/web/src/pages/api \
  --repo my-saas-app \
  --output docs/flows
```
*(Nếu bỏ qua các tham số này, script sẽ tự động tìm kiếm các thư mục mặc định thông dụng như `src/`, `src/app/api/` hoặc `multica-hub/src`).*

---

#### 🚀 Cách ép quy luật tự động hóa (Automation)

1.  **Tự động cập nhật khi commit**: DAI Nexus tích hợp sẵn pre-commit hook (`.husky/pre-commit`). Khi phát hiện có thay đổi ở các file logic core (`.ts`, `.py`, `.js` trong `src/`, `mcp/` hoặc `scripts/` ngoại trừ test), hook này sẽ tự động cập nhật code graph và sinh lại sơ đồ Sequence Flow:
    ```bash
    dai-memory ingest
    npx tsx scripts/generate-sequence.ts
    ```
2.  **Ràng buộc Agent AI**: Dự án bắt buộc tự động cập nhật code graph & Sơ đồ Sequence thông qua các quy tắc (Rules) thiết lập trong file `CLAUDE.md` và `AGENTS.md`.
3.  **Tự động kiểm tra và cập nhật Submodule DAI Nexus**: Đối với dự án dùng DAI Nexus dưới dạng submodule, cài `post-merge` và `post-checkout` idempotent vào repository cha bằng:
    ```bash
    bash dai-nexus/scripts/lite/install-submodule-update-hooks.sh "$PWD"
    ```
    Hook giữ nguyên nội dung hook có sẵn. Khi có bản mới và submodule sạch, updater chỉ fast-forward đến `origin/main`, sau đó refresh Antigravity global hook runtime, doctor và MCP. Nếu có local changes hoặc lịch sử phân kỳ, updater sẽ bỏ qua thay vì ghi đè.


---

## Xử lý sự cố thường gặp

| Vấn đề | Cách xử lý |
|---------|------------|
| `dai-memory` chưa cài | Chạy `python3 scripts/lite/dai_memory.py install` |
| `npm install` bị lỗi trong submodule | Kiểm tra `node --version` (MCP cần 20+) |
| Không thấy MCP tools | Khởi động lại Cursor/VS Code sau khi đổi config |
| Index cũ | Chạy `dai-memory ingest` để cập nhật |
| Submodule chưa khởi tạo | `git submodule update --init --recursive` |
| `realpath` không tìm thấy (macOS) | `brew install coreutils` |
| `python3` không tìm thấy | Cài Python 3.8+ cho tính năng memory |
| Windows: `bash` không tìm thấy | Dùng lệnh PowerShell tương đương |
| Sơ đồ mermaid không hiển thị | Đảm bảo trình xem dùng **mermaid 10+**. GitHub/GitLab đã hỗ trợ. |
| Lỗi `better-sqlite3` sau merge | Chạy `cd dainexus-node && npm install` để cài `kuzu` thay thế |

---

## Lệnh tắt (Shortcuts)

| Lệnh | Tác dụng |
|------|-----------|
| `/setup` | Cài đặt lần đầu như git submodule |
| `/update` | Kiểm tra & cài cập nhật mới (an toàn, giữ thay đổi) |
| `/pipeline` | Xem toàn bộ pipeline, modes, và danh sách skills |
| `/onboard` | Phân tích sâu dự án — tạo `.dainexus/project-profile.json` |
| `/mcp` | Tạo hoặc tạo lại MCP server config |
| `/setup-mobile-test` | Cài đặt mobile testing cho Android/iOS |
| `/setup-auto-publish` | Cài đặt tự động publish iOS/Android (EAS & Fastlane) |

---

## Đóng góp

1. Fork repo
2. Tạo nhánh: `git checkout -b feature/your-feature`
3. Commit theo [Conventional Commits](https://www.conventionalcommits.org/): `feat(skill): add new capability`
4. Mở Pull Request

**Thêm skill mới:** Tạo file `skills/your-skill-name/SKILL.md`. Xem skill có sẵn làm ví dụ.

---

## License

MIT

---

## Ủng hộ dự án

Nếu DAI Nexus giúp bạn ship nhanh hơn, bạn có thể ủng hộ tại đây:

<p align="center">
  <img src="assets/donate/give-me-a-coffee-international.png" width="280" alt="Buy Me a Coffee" />
</p>

---

<p align="center">
  <strong>DAI Nexus — 83 AI skills. 24 modes. Persistent Memory. Code Intelligence. SaaS to AAA games.</strong>
</p>
<p align="center">
  <em>Lên kế hoạch chính xác. Build với tự tin. Mở rộng thông minh.</em>
</p>
