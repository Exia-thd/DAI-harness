#!/usr/bin/env python3
"""
docs/build_docs.py
Generate the DAI Nexus documentation site from the repository itself.

Every number, file list, and code excerpt on the rendered pages is read from
the working tree at build time. Nothing is transcribed by hand, so the docs
cannot drift away from the code the way hand-written architecture docs do —
if a script is renamed or a rule removed, the next build reflects it (or fails).

Usage:
    python docs/build_docs.py            # write docs/*.html
    python docs/build_docs.py --check    # fail if the committed HTML is stale

Output: docs/{index,kernel,skills,evidence,runtime,memory,patterns}.html
"""

from __future__ import annotations

import html
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

PAGES = [
    ("index.html", "Tổng quan"),
    ("kernel.html", "Kernel"),
    ("skills.html", "Skills"),
    ("evidence.html", "Bằng chứng"),
    ("runtime.html", "Runtime"),
    ("memory.html", "Memory"),
    ("patterns.html", "Tinh túy"),
]


# ── fact collection (single source of truth: the repo) ────────────────────────


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def lines_of(rel: str) -> int:
    return len(read(rel).splitlines())


def excerpt(
    rel: str, start_pat: str, count: int, *, dedent: bool = True
) -> tuple[str, int]:
    """Pull `count` lines from a file starting at the first line matching a regex.

    Returns (text, 1-based start line). Raises if the anchor is gone — a build
    failure is the correct outcome when the docs point at code that moved.
    """
    src = read(rel).splitlines()
    for i, line in enumerate(src):
        if re.search(start_pat, line):
            block = src[i : i + count]
            if dedent:
                pads = [len(b) - len(b.lstrip()) for b in block if b.strip()]
                cut = min(pads) if pads else 0
                block = [b[cut:] if len(b) > cut else b for b in block]
            return "\n".join(block).rstrip(), i + 1
    raise SystemExit(
        f"[docs] anchor {start_pat!r} not found in {rel} — update build_docs.py"
    )


def facts() -> dict:
    kernel = sorted(p.name for p in (ROOT / "kernel").glob("*.md"))
    scripts = sorted((ROOT / "scripts/lite").glob("*.py"))
    overlays = sorted((ROOT / "skills").glob("*/LITE.md"))
    protocols = sorted((ROOT / "skills/_shared/protocols").glob("*.md"))
    phases_on_disk = {p.stem for p in (ROOT / "skills/pipeline/phases").glob("*.md")}
    # Execution order is declared in the pipeline overlay; alphabetical sorting
    # would render DEFINE→BUILD→HARDEN→SHIP as BUILD|DEFINE|HARDEN|SHIP and teach
    # the wrong sequence.
    order_row = re.search(
        r"\| `FULL_BUILD` \| ([^|]+) \|", read("skills/pipeline/LITE.md")
    )
    if not order_row:
        raise SystemExit(
            "[docs] FULL_BUILD phase order not found in skills/pipeline/LITE.md"
        )
    phase_order = [p.strip().lower() for p in order_row.group(1).split("→")]
    if set(phase_order) != phases_on_disk:
        raise SystemExit(
            f"[docs] phase mismatch: overlay says {phase_order}, "
            f"disk has {sorted(phases_on_disk)}"
        )
    contracts = sorted((ROOT / "skills/_test/skills").glob("*/test.yaml"))
    mcp_tools = re.findall(r'"(dn_\w+)": \(', read("mcp/server.py"))
    smoke = read("tests/smoke.py")
    hard_rules = re.findall(r"^\d+\. (.+)$", read("kernel/ENTRY.md"), re.MULTILINE)
    # Rejection reasons come from the gate's own contract. Hand-listing them here
    # is how the SECRETS reason went missing from the docs once already.
    reject_block = (
        read("scripts/lite/verify_gate.py")
        .split("Rejection reasons:")[1]
        .split("\n\n")[0]
    )
    reject_reasons = re.findall(r"^\s+([A-Z]+)\s+- ", reject_block, re.MULTILINE)
    if not reject_reasons:
        raise SystemExit("[docs] rejection reasons not found in verify_gate.py")
    policy_patterns = re.findall(
        r'^\s*- "(.+)"$', read(".dainexus/execution-policy.yaml"), re.MULTILINE
    )
    # Deliberately no commit hash and no build date. Both made the output a
    # function of *when* it was built rather than of what it was built from, so
    # `--check` went stale after every commit and again at every midnight — and
    # the hash could never be right anyway: docs committed in commit N can only
    # ever name commit N-1. The guarantee readers actually want is that these
    # pages match the current sources, and the gate proves that continuously by
    # regenerating and byte-comparing them.
    return {
        "version": read("VERSION").strip(),
        "kernel_files": kernel,
        "kernel_tokens": len(read("CLAUDE.md")) // 4,
        "scripts": [(p.name, lines_of(f"scripts/lite/{p.name}")) for p in scripts],
        "script_loc": sum(lines_of(f"scripts/lite/{p.name}") for p in scripts),
        "overlays": [p.parent.name for p in overlays],
        "protocols": [p.stem for p in protocols],
        "phases": phase_order,
        "contracts": [p.parent.name for p in contracts],
        "mcp_tools": mcp_tools,
        "mcp_loc": lines_of("mcp/server.py"),
        "smoke_checks": smoke.count("check(") - smoke.count("def check("),
        "smoke_loc": lines_of("tests/smoke.py"),
        "hard_rules": hard_rules[:6],
        "policy_patterns": policy_patterns,
        "reject_reasons": reject_reasons,
        "memory_engine": memory_engine_facts(),
        **_baseline_facts(),
    }


def _baseline_facts() -> dict:
    """Read the regression baseline so the page cannot quote a stale count."""
    raw = read("tests/known_failures.txt").splitlines()
    entries = [line for line in raw if line.strip() and not line.startswith("#")]
    files = sorted({line.split("::")[0].split("/")[-1] for line in entries})
    return {
        "baseline_count": len(entries),
        "baseline_files": len(files),
        "baseline_gate_loc": lines_of("scripts/ci/pytest_gate.py"),
    }


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def code(rel: str, pattern: str, count: int, caption: str = "") -> str:
    body, line_no = excerpt(rel, pattern, count)
    head = (
        f'<div class="code-head"><span class="file">{esc(rel)}:{line_no}</span>'
        f"{f'<span class=cap>{esc(caption)}</span>' if caption else ''}</div>"
    )
    return f'<div class="code-block">{head}<pre><code>{esc(body)}</code></pre></div>'


def nav(current: str) -> str:
    links = "".join(
        f'<a href="./{f}"{" class=current" if f == current else ""}>{esc(t)}</a>'
        for f, t in PAGES
    )
    return f"""<nav class="nav"><div class="nav-inner">
  <a href="./index.html" class="nav-brand"><span class="dot"></span> DAI Nexus <small>docs</small></a>
  <div class="nav-links">{links}</div>
</div></nav>"""


def page(filename: str, title: str, body: str, f: dict) -> str:
    return f"""<!DOCTYPE html>
<!-- @generated by docs/build_docs.py — do not edit; run the generator instead. -->
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)} — DAI Nexus</title>
<link rel="stylesheet" href="./style.css">
</head>
<body>
{nav(filename)}
<main>
{body}
</main>
<footer>
  <div><strong>DAI Nexus docs</strong> · sinh tự động từ source bằng <code>docs/build_docs.py</code></div>
  <div>v{f["version"]} · generated from source</div>
</footer>
</body>
</html>
"""


def standalone_page(title: str, body: str, f: dict, css: str) -> str:
    """Render an orphan page: no nav, no sibling links, CSS inlined.

    This one is meant to be handed to someone on its own — mailed, dropped in a
    ticket, opened from a USB stick. Anything that reaches for a neighbouring
    file (nav bar, external stylesheet) would break the moment it travels alone,
    so nothing here does.
    """
    return f"""<!DOCTYPE html>
<!-- @generated by docs/build_docs.py — standalone: no navigation, no sibling links, CSS inlined. -->
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)}</title>
<style>
{css}
main {{ padding-top: 28px; }}
</style>
</head>
<body>
<main>
{body}
</main>
<footer>
  <div><strong>{esc(title)}</strong> · trang độc lập, không cần file nào khác đi kèm</div>
  <div>bản {f["version"]} · sinh tự động từ mã nguồn</div>
</footer>
</body>
</html>
"""


def stat_grid(items: list[tuple[str, str]], cols: int = 4) -> str:
    cells = "".join(
        f'<div class="stat"><div class="val">{esc(value)}</div>'
        f'<div class="lbl">{esc(label)}</div></div>'
        for value, label in items
    )
    return f'<div class="grid cols-{cols}">{cells}</div>'


def table(headers: list[str], rows: list[list[str]]) -> str:
    head = "".join(f"<th>{esc(h)}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"


def callout(kind: str, title: str, body: str) -> str:
    return (
        f'<div class="callout {kind}"><div class="title">{esc(title)}</div>{body}</div>'
    )


WIDE = 78


REJECT_VI = {
    "MISSING": "Không có file evidence nào",
    "STALE": "Evidence quá cũ (mặc định &gt;1 giờ, đổi qua <code>DAINEXUS_STALENESS_SECS</code>)",
    "MISMATCH": "Workspace hoặc tree-sha đã đổi từ lúc ghi — tức là code bị sửa <em>sau</em> khi test chạy",
    "FAILED": "<code>exit_code</code> ≠ 0 — lệnh kiểm chứng thật sự trượt",
    "FORGED": "Sai schema, command rỗng, hoặc output khớp mẫu bịa (<code>placeholder</code>, <code>TODO</code>, <code>&lt;output&gt;</code>)",
    "SECRETS": "Output chứa secret chưa che (API key, token, private key) — chính file evidence đã nhiễm",
    "STUBS": "File đã sửa còn TODO/FIXME/NotImplementedError",
    "MISREPORTED": "VERIFY block trong câu trả lời không khớp evidence — claim bị viết lại, "
    "command khác, hoặc chỗ đáng lẽ là digest thì dán văn xuôi",
}


def reject_table(f: dict) -> str:
    missing = [r for r in f["reject_reasons"] if r not in REJECT_VI]
    if missing:
        raise SystemExit(
            f"[docs] lý do từ chối mới chưa có giải thích: {missing} "
            f"— bổ sung vào REJECT_VI trong build_docs.py"
        )
    return table(
        ["Lý do từ chối", "Nghĩa là"],
        [[f"<code>{r}</code>", REJECT_VI[r]] for r in f["reject_reasons"]],
    )


def box(width: int, title: str, lines: list[str]) -> str:
    """Draw an aligned ASCII box. Padding is computed, never hand-counted —
    Vietnamese line lengths vary and hand-drawn borders always end up ragged."""
    width = max(width, max((len(x) for x in [title, *lines]), default=0) + 4)
    out = ["┌" + "─" * (width - 2) + "┐"]
    if title:
        out.append("│ " + title.ljust(width - 4) + " │")
    for line in lines:
        out.append("│ " + line.ljust(width - 4) + " │")
    out.append("└" + "─" * (width - 2) + "┘")
    return "\n".join(out)


# ── pages ─────────────────────────────────────────────────────────────────────


def page_index(f: dict) -> str:
    rules = "".join(f"<li>{esc(r)}</li>" for r in f["hard_rules"])
    return f"""
<section class="hero">
  <span class="tag">TÀI LIỆU SINH TỪ SOURCE · v{f["version"]}</span>
  <h1>DAI Nexus — <span class="accent">hệ điều hành cho AI coding agent</span></h1>
  <p class="lead">
    Không phải một tập prompt. Đây là một <strong>bộ luật + runtime</strong>: kernel bất biến nạp mỗi phiên,
    thư viện {
        len(f["overlays"])
    } skill overlay load theo nhu cầu, và một tầng runtime Python thuần
    <strong>cưỡng bức bằng chứng</strong> — agent không được phép nói "xong rồi" nếu không có evidence do máy sinh ra.
  </p>
  {
        callout(
            "tip",
            "Vì sao trang này không bao giờ lệch với code",
            "Toàn bộ số liệu, danh sách file và đoạn code trích dẫn dưới đây được "
            "<strong>đọc trực tiếp từ working tree lúc build</strong> "
            "(<code>docs/build_docs.py</code>). Nếu một script bị đổi tên hay một rule bị xoá, "
            "lần build kế tiếp phản ánh ngay — hoặc fail. Đây chính là bài học rút ra từ bộ "
            "tài liệu tiền nhiệm: nó phải kèm một mục 'đính chính' vì các con số chép tay đã drift khỏi code.",
        )
    }
  <div class="hero-meta">
    <span>Kernel <strong>{len(f["kernel_files"])} file</strong></span>
    <span>Overlay <strong>{len(f["overlays"])}</strong></span>
    <span>Protocol <strong>{len(f["protocols"])}</strong></span>
    <span>Runtime <strong>{len(f["scripts"])} script</strong></span>
    <span>MCP tool <strong>{len(f["mcp_tools"])}</strong></span>
    <span>Self-test <strong>{f["smoke_checks"]}</strong></span>
  </div>
</section>

<h2><span class="num">01</span> Vấn đề nó giải</h2>
<p>
  Một LLM viết code giỏi vẫn thất bại ở ba chỗ: <strong>nói dối về kết quả</strong> ("đã sửa xong" mà chưa chạy thử),
  <strong>quên bối cảnh</strong> giữa các phiên, và <strong>làm bừa</strong> những thao tác không thể hoàn tác.
  DAI Nexus xử lý cả ba bằng cơ chế máy móc, không bằng lời khuyên trong prompt.
</p>
<div class="grid cols-3">
  <div class="card"><h4 class="mt-0">🧾 Bằng chứng, không phải lời hứa</h4>
    <p class="small">Mọi claim thành công cần một <strong>VERIFY block</strong> dựa trên evidence JSON do
    <code>run_check.py</code> ghi (kèm exit code, tree-sha, timestamp). Stop-hook chặn kết thúc lượt nếu thiếu.</p></div>
  <div class="card"><h4 class="mt-0">🧠 Trí nhớ có kỷ luật</h4>
    <p class="small">Boot bắt buộc nạp memory (≤500 token), turn-close bắt buộc lưu lại.
    SQLite+FTS5 local, BM25 fuse RRF — không phụ thuộc dịch vụ ngoài.</p></div>
  <div class="card"><h4 class="mt-0">🛑 Cổng chặn fail-closed</h4>
    <p class="small">Deny-pattern cho lệnh phá hoại; file policy hỏng hay thiếu thì <em>chặn</em>,
    không phải cho qua. Process dài hạn phải có lease, cuối lượt phải sạch.</p></div>
</div>

<h2><span class="num">02</span> Ba tầng</h2>
<div class="diagram">{
        esc(
            box(
                WIDE,
                f"TẦNG 1 — KERNEL ({len(f['kernel_files'])} file, ~{f['kernel_tokens']} token, luôn nạp)",
                [
                    "kernel/{"
                    + ", ".join(k.replace(".md", "") for k in f["kernel_files"])
                    + "}",
                    "→ 6 Hard Rules · SOLVE loop · VERIFY/AUDIT · Execution policy",
                ],
            )
        )
    }
                        ⇓ overlay khi cần
{
        esc(
            box(
                WIDE,
                f"TẦNG 2 — SKILLS ({len(f['overlays'])} overlay + {len(f['protocols'])} protocol, load on-demand)",
                [
                    "skills/pipeline/          → orchestrator: "
                    + " | ".join(p.upper() for p in f["phases"]),
                    "skills/<role>/LITE.md     → GROUND/DECOMPOSE slot theo domain",
                    "skills/_shared/protocols/ → guardrail, parallel-dispatch, …",
                ],
            )
        )
    }
                        ⇓ được cưỡng bức bởi
{
        esc(
            box(
                WIDE,
                f"TẦNG 3 — RUNTIME ({len(f['scripts'])} script, {f['script_loc']} dòng Python thuần)",
                [
                    "run_check · verify_gate · policy_check · runtime_lease",
                    "memory · escalate · worktree_manager · validate_overlays",
                    f"mcp/server.py → {len(f['mcp_tools'])} tool cho IDE",
                ],
            )
        )
    }</div>

<h2><span class="num">03</span> 6 Hard Rules</h2>
<p class="muted small">Đọc thẳng từ <code>kernel/ENTRY.md</code> lúc build:</p>
<ol class="rules">{rules}</ol>

<h2><span class="num">04</span> Đi sâu từng mảng</h2>
<div class="grid cols-3">
  <a href="./kernel.html" class="nav-card"><div class="idx">01 · kernel/</div>
    <h3>Kernel</h3><p>Bộ luật bất biến: boot sequence, SOLVE loop, VERIFY/AUDIT contract, execution policy.</p></a>
  <a href="./skills.html" class="nav-card"><div class="idx">02 · skills/</div>
    <h3>Skills &amp; Pipeline</h3><p>Orchestrator 6 mode, {
        len(f["phases"])
    } phase với gate, {len(f["overlays"])} overlay chuyên gia.</p></a>
  <a href="./evidence.html" class="nav-card"><div class="idx">03 · chống ảo giác</div>
    <h3>Chuỗi bằng chứng</h3><p>4 lớp: evidence writer → stop gate → policy fail-closed → runtime ledger.</p></a>
  <a href="./runtime.html" class="nav-card"><div class="idx">04 · scripts/ + mcp/</div>
    <h3>Runtime</h3><p>{len(f["scripts"])} công cụ Python zero-dependency + MCP server {
        len(f["mcp_tools"])
    } tool.</p></a>
  <a href="./memory.html" class="nav-card"><div class="idx">05 · memory.py</div>
    <h3>Memory</h3><p>SQLite+FTS5, BM25 fuse RRF, auto-tag, redaction, GC theo giá trị.</p></a>
  <a href="./patterns.html" class="nav-card"><div class="idx">06 · TINH TÚY</div>
    <h3>⭐ Pattern đáng mang đi</h3><p>Những cơ chế có thể copy sang project khác, kèm code thật.</p></a>
</div>

<h2><span class="num">05</span> Một yêu cầu chạy qua hệ thống thế nào</h2>
<div class="diagram">User: "build me a todo API with auth"
        ⇓
CLAUDE.md (sinh từ kernel) được nạp tự động
        ⇓
Boot: CLARIFY? → restate → classify → FULL_BUILD → nạp memory (≤500 token)
        ⇓
skills/pipeline/LITE.md → mode FULL_BUILD
        ⇓
{" → ".join(p.upper() for p in f["phases"])}
   DEFINE   product-manager → BRD          [Gate 1: user duyệt]
            solution-architect → ADR/API   [Gate 2: user duyệt]
   BUILD    software-engineer (TDD) ∥ frontend-engineer → devops
   HARDEN   qa-engineer → security-engineer → code-reviewer (fresh context)
   SHIP     staging → smoke test có evidence [Gate 3] → production
        ⇓
Mỗi bước: SOLVE loop · guardrail + policy_check trước tool call
        ⇓
Turn-close: VERIFY block · AUDIT coverage matrix · lưu memory · runtime ledger
        ⇓
Stop hook: verify_gate.py — thiếu/giả/hết hạn evidence ⇒ CHẶN</div>

<h2><span class="num">06</span> Số liệu (đọc từ repo)</h2>
{
        stat_grid(
            [
                (str(len(f["kernel_files"])), "kernel file"),
                (f"{f['kernel_tokens']}", "token boot"),
                (str(len(f["overlays"])), "skill overlay"),
                (str(len(f["protocols"])), "protocol"),
                (str(len(f["scripts"])), "runtime script"),
                (str(f["script_loc"]), "dòng runtime"),
                (str(len(f["mcp_tools"])), "MCP tool"),
                (str(f["smoke_checks"]), "self-test"),
            ]
        )
    }
"""


def page_kernel(f: dict) -> str:
    files = table(
        ["File", "Vai trò"],
        [
            [
                "<code>ENTRY.md</code>",
                "6 Hard Rules · boot sequence · bảng routing · nạp memory bắt buộc",
            ],
            [
                "<code>SOLVE.md</code>",
                "Vòng lặp suy luận 9 bước: UNDERSTAND → GROUND → DECOMPOSE → PoT → EXECUTE/VERIFY → AUDIT → STUCK → TURN-CLOSE",
            ],
            [
                "<code>VERIFY.md</code>",
                "4 template bằng chứng + luật: claim không có output dán vào là FALSE",
            ],
            [
                "<code>AUDIT.md</code>",
                "Ma trận phủ yêu cầu, quét mâu thuẫn, đọc lại file đã sửa",
            ],
            [
                "<code>ESCALATE.md</code>",
                "Phân loại EASY/HARD theo tín hiệu runtime khách quan, giao thức leo thang",
            ],
            ["<code>CLARIFY.md</code>", "Bảng trigger + MCQ cho yêu cầu mơ hồ"],
            [
                "<code>POLICY.md</code>",
                "Cấu hình execution policy, hợp đồng fail-closed",
            ],
        ],
    )
    return f"""
<section class="hero compact">
  <span class="tag">TẦNG 1</span>
  <h1>Kernel — <span class="accent">bộ luật bất biến</span></h1>
  <p class="lead">{len(f["kernel_files"])} file markdown, tổng ~{
        f["kernel_tokens"]
    } token, được
  <code>sync-kernel.py</code> gộp thành <code>CLAUDE.md</code> / <code>AGENTS.md</code> / <code>GEMINI.md</code>
  và nạp tự động ở mọi phiên. Budget cứng 7k token — vượt là build fail.</p>
</section>

<h2><span class="num">01</span> Bảy file</h2>
{files}

{
        callout(
            "warn",
            "Đừng sửa CLAUDE.md",
            "Ba file boot ở root là <strong>sinh tự động</strong>. Nguồn sự thật nằm ở <code>kernel/</code>; "
            "sửa tay file sinh ra sẽ mất khi chạy lại <code>sync-kernel.py</code>.",
        )
    }

<h2><span class="num">02</span> Boot sequence</h2>
<p>Mỗi phiên bắt đầu bằng đúng 5 bước, không hơn — giữ payload boot trong ngân sách token:</p>
{code("kernel/ENTRY.md", r"^## Boot Sequence", 9)}
<p>Bước 5.5 là thứ phân biệt DAI Nexus với một tập prompt thường: <strong>nạp memory là bắt buộc</strong>,
có trần token cho từng nguồn, và quy tắc cắt bớt rõ ràng thay vì "đọc nếu thấy cần".</p>
{code("kernel/ENTRY.md", r"^## Boot Step 5\.5", 12)}

<h2><span class="num">03</span> Vòng lặp SOLVE</h2>
<p>Xương sống suy luận. Điểm mấu chốt nằm ở bước GROUND: <em>không được tự xác nhận</em> —
mọi giả định phải có bằng chứng do script sinh ra:</p>
{code("kernel/SOLVE.md", r"^## 2\. GROUND", 9)}
<p>Và bước DECOMPOSE ép mỗi việc phải có một lệnh CHECK chứng minh nó xong:</p>
{code("kernel/SOLVE.md", r"^## 3\. DECOMPOSE", 8)}

<h2><span class="num">04</span> Quy tắc kẹt</h2>
<p>Sau 2 lần thất bại cùng một chỗ, agent bị cấm thử lại biến thể của cách cũ:</p>
{code("kernel/SOLVE.md", r"^## 8\. STUCK RULE", 9)}

<h2><span class="num">05</span> Turn-close</h2>
<p>Cuối mỗi lượt, bối cảnh được ghi lại để phiên sau không phải suy diễn lại từ đầu,
và mọi process dài hạn phải được thu hồi:</p>
{code("kernel/SOLVE.md", r"^## 9\. CONTINUITY", 6)}

<h2><span class="num">06</span> Ngân sách token</h2>
<p><code>sync-kernel.py</code> ước lượng tất định (4 ký tự ≈ 1 token) và <strong>thoát với mã lỗi</strong>
nếu file sinh ra vượt 7k — kernel không thể phình dần trong im lặng:</p>
{code("scripts/lite/sync-kernel.py", r"status = .OK. if target_tokens", 8)}
{
        callout(
            "tip",
            "Hiện tại",
            f"Boot file ~{f['kernel_tokens']} token / 7000 — còn khoảng "
            f"{7000 - f['kernel_tokens']} token dư cho luật mới.",
        )
    }
"""


def page_skills(f: dict) -> str:
    overlays_list = ", ".join(f"<code>{esc(o)}</code>" for o in f["overlays"][:18])
    phases_rows = [
        [
            "<code>define.md</code>",
            "product-manager → BRD; solution-architect → ADR + API contract",
            "Gate 1, Gate 2",
        ],
        [
            "<code>build.md</code>",
            "backend (TDD bắt buộc) · frontend (design contract) · containerization",
            "quality gate mỗi task",
        ],
        [
            "<code>harden.md</code>",
            "qa-engineer → security-engineer → code-reviewer (fresh context)",
            "VERIFY + findings",
        ],
        [
            "<code>ship.md</code>",
            "staging + smoke có evidence → production, kèm đường rollback",
            "Gate 3",
        ],
    ]
    return f"""
<section class="hero compact">
  <span class="tag">TẦNG 2</span>
  <h1>Skills — <span class="accent">một orchestrator, {
        len(f["overlays"])
    } chuyên gia</span></h1>
  <p class="lead">Kernel chọn <em>mode</em>; pipeline chọn <em>phase</em>; overlay cung cấp
  kiến thức domain dưới dạng slot GROUND/DECOMPOSE. Không có gì được nạp trước khi cần.</p>
</section>

<h2><span class="num">01</span> Routing lúc boot</h2>
<p>Bảng nén trong <code>kernel/ENTRY.md</code> — không phải đọc index lớn nào:</p>
{code("kernel/ENTRY.md", r"^## Compact Skill Routing", 12)}

<h2><span class="num">02</span> Mode → phase</h2>
<p>Yêu cầu nhỏ không phải trả giá cho nghi thức lớn. Chỉ <code>FULL_BUILD</code> chạy đủ 4 phase và 3 gate:</p>
{code("skills/pipeline/LITE.md", r"^\| Mode \|", 9)}

<h2><span class="num">03</span> Bốn phase</h2>
{table(["Phase", "Việc", "Chốt chặn"], phases_rows)}

{
        callout(
            "tip",
            "Gate là chỗ dừng thật",
            "Tại mỗi gate: trình bày tóm tắt ≤10 dòng + vị trí artifact, rồi <strong>ĐỢI</strong> người dùng quyết. "
            "Agent không bao giờ tự duyệt gate của chính mình. Quyết định được ghi vào "
            "<code>decisions-log.md</code>, lưu vào memory, và mirror qua MCP để dashboard theo dõi.",
        )
    }

<h2><span class="num">04</span> Giải phẫu một overlay</h2>
<p>Mỗi overlay là một file LITE.md nhỏ: frontmatter + slot GROUND + slot DECOMPOSE + checklist lỗi hay gặp.
Ví dụ overlay debugger:</p>
{code("skills/debugger/LITE.md", r"^## SOLVE Step 2", 8)}

{
        callout(
            "warn",
            "Overlay không được chứa bằng chứng giả",
            "Bản đầu của các overlay này có kèm 'worked example' kết thúc bằng "
            "<code>EXIT CODE: 0 / VERDICT: PASS</code> cứng. Overlay là thứ agent bắt chước — nhúng sẵn một kết quả PASS "
            "chính là dạy nó <em>viết ra</em> VERIFY thay vì <em>chạy</em> check, phá thẳng Hard Rule 1. "
            "Toàn bộ đã bị cắt và <code>validate_overlays.py</code> nay chặn chúng quay lại.",
        )
    }

<h2><span class="num">05</span> Thư viện overlay</h2>
<p class="muted small">{len(f["overlays"])} overlay, gồm: {overlays_list} …</p>
<p>Nhóm theo vai trò: <strong>routing lõi</strong> (debugger, software-engineer, ui-designer, code-reviewer,
qa-engineer, devops) · <strong>vai trò pipeline</strong> (product-manager, solution-architect,
security-engineer, frontend-engineer) · <strong>domain</strong> (game engine, data/AI, mobile,
per-language, growth…).</p>

<h2><span class="num">06</span> Protocol dùng chung</h2>
<p>{
        len(f["protocols"])
    } protocol trong <code>skills/_shared/protocols/</code>. Hai cái quan trọng nhất:</p>
{
        table(
            ["Protocol", "Vai trò"],
            [
                [
                    "<code>guardrail.md</code>",
                    "Kill switch: 13 nhóm luật (destructive, secrets, RCE, publishing, path traversal, "
                    "resource exhaustion…) + cổng cơ học <code>policy_check.py</code>",
                ],
                [
                    "<code>parallel-dispatch.md</code>",
                    "Worker chạy song song trên git worktree, mỗi worker bị ràng bởi task contract; "
                    "merge arbiter từ chối mọi thay đổi ngoài phạm vi",
                ],
            ],
        )
    }
"""


def page_evidence(f: dict) -> str:
    patterns = "".join(f"<li><code>{esc(p)}</code></li>" for p in f["policy_patterns"])
    return f"""
<section class="hero compact">
  <span class="tag">CƠ CHẾ LÕI</span>
  <h1>Chuỗi bằng chứng — <span class="accent">chống ảo giác bằng máy</span></h1>
  <p class="lead">Đây là phần đáng mang đi nhất của DAI Nexus. Không phải lời nhắc "hãy trung thực",
  mà là bốn cổng cơ học mà agent không thể nói vòng qua.</p>
</section>

<h2><span class="num">00</span> Nguyên tắc: bằng chứng theo tỉ lệ</h2>
<p>Bằng chứng luôn bắt buộc <em>về bản chất</em>; nghi thức thì không. Một lần sửa lỗi chính tả và một thay đổi
hệ thống thanh toán không phải cùng một loại việc — bắt chúng theo cùng một quy trình là cách nhanh nhất
khiến người ta bỏ qua đúng những chỗ quan trọng.</p>
{
        table(
            ["Tier", "Khi nào", "Ngân sách", "Bằng chứng"],
            [
                [
                    "<code>QUICK</code>",
                    "rõ ràng, cục bộ, đảo ngược được, không có tín hiệu HARD",
                    "1–3 action",
                    "một dòng gọn: <code>CHECK | EXIT | RESULT</code>",
                ],
                [
                    "<code>STANDARD</code>",
                    "feature/debug/refactor bình thường có giới hạn",
                    "≤7 action",
                    "từng behavior trọng yếu + regression có mục tiêu",
                ],
                [
                    "<code>DEEP</code>",
                    "bảo mật · public contract/schema · concurrency · migration · release không đảo ngược · lỗi lặp lại",
                    "≤10 action",
                    "kiểm tra biên chặt hơn, bằng chứng rollback, review độc lập",
                ],
            ],
        )
    }
{
        callout(
            "warn",
            "Luật thanh toán (bắt buộc)",
            "Bất kỳ việc gì đụng tới payment, billing, in-app purchase, receipt validation, entitlements, "
            "subscription hay checkout đều là <code>HARD</code> + <code>DEEP</code> <strong>bất kể số file</strong>. "
            "Một diff một dòng không hạ cấp được nó.",
        )
    }

<h2><span class="num">01</span> Lớp 1 — Evidence do máy ghi</h2>
<p>Agent không tự viết bằng chứng. Nó chạy lệnh kiểm chứng qua <code>run_check.py</code>,
script này thực thi, thu output, <strong>redact secret trong bộ nhớ</strong>, rồi ghi JSON nguyên tử:</p>
{code("scripts/lite/run_check.py", r"^\s+ev = \{", 12, "schema bằng chứng")}
<p>Bốn trường quyết định tính không-thể-giả: <code>tree_sha</code> (trạng thái cây làm việc lúc chạy),
<code>timestamp_utc</code>, <code>exit_code</code> thật của tiến trình con, và <code>output_sha256</code> —
digest của chính output đã thu. Sửa tay trường <code>output</code> là digest lệch ngay, gate bắt được.</p>
<p>Schema v2 còn mang <code>tier</code> (<code>quick|standard|deep</code>), <code>acceptance</code>
(check này dùng để chứng minh điều gì) và <code>negative_paths</code> (đường thất bại đã <em>thực sự quan sát</em>,
không phải giả định). Gate vẫn nhận evidence v1 cũ.</p>

<h2><span class="num">02</span> Lớp 2 — Stop-hook gate</h2>
<p>Cuối mỗi lượt, hook gọi <code>verify_gate.py</code>. Nếu có file code thay đổi, gate đòi
một evidence hợp lệ. {len(f["reject_reasons"])} phép kiểm tra độc lập:</p>
{reject_table(f)}
{code("scripts/lite/verify_gate.py", r"^def _validate_tree", 18, "so khớp tree-sha")}
{
        callout(
            "tip",
            "Cổng này từng chặn chính tác giả",
            "Trong lúc dựng v0.6.0, gate trả về BLOCKED vì README và VERSION được sửa <em>sau</em> khi test chạy — "
            "tree-sha lệch. Phải chạy lại test rồi mới commit được. Đó là dấu hiệu cổng hoạt động, không phải phiền toái.",
        )
    }

<h2><span class="num">03</span> Lớp 3 — Execution policy fail-closed</h2>
<p>Guardrail dạng văn bản là phán đoán; <code>policy_check.py</code> là thực thi.
Deny-pattern hiện hành đọc từ <code>.dainexus/execution-policy.yaml</code>:</p>
<ul class="rules">{patterns}</ul>
<p>Điểm quan trọng là <strong>hướng fail</strong>: file policy thiếu, rỗng, hỏng, hay mode lạ đều
<em>chặn</em> chứ không cho qua:</p>
{code("scripts/lite/policy_check.py", r"^def cmd_check", 12)}

<h2><span class="num">04</span> Lớp 4 — Runtime ledger</h2>
<p>Một dev server bị bỏ quên vô hình với mọi loại test: build xanh, test pass, RAM cứ leo.
Mọi process dài hạn phải khởi động qua lease:</p>
<div class="code-block"><div class="code-head"><span class="file">VERIFY Template 4</span></div><pre><code>RUNTIME LEDGER
OPENED:  &lt;lease_id&gt; role=&lt;..&gt; pid=&lt;..&gt;
CLOSED:  &lt;lease_id&gt;
LEAKED:  none | &lt;lease_id list&gt;
COMMAND: python scripts/lite/runtime_lease.py status
VERDICT: CLEAN | LEAKED</code></pre></div>
<p>Lệnh <code>run</code> tái dùng instance đang sống thay vì mở cái thứ hai; <code>reap</code> dọn mọi lease
không phải <code>policy=keep</code>. Trên Windows, kiểm tra process sống <strong>không</strong> được dùng
<code>os.kill(pid, 0)</code> — nó gọi TerminateProcess và giết thật:</p>
{code("scripts/lite/runtime_lease.py", r"^def pid_alive", 14)}

<h2><span class="num">04b</span> Sửa lỗi: phải thấy ĐỎ rồi mới XANH</h2>
<p>Một bản vá không được chứng minh bằng một test xanh. Chạy <strong>đúng cùng một lệnh</strong> và cho thấy:
<strong>RED</strong> — check thất bại <em>trước</em> khi sửa (chứng minh check thật sự phát hiện được lỗi), rồi
<strong>GREEN</strong> — cũng check đó pass sau khi sửa.</p>
<p>Một test chưa từng được nhìn thấy fail không phải bằng chứng rằng nó sẽ bắt được regression.
Nếu không dựng được RED, phải nói thẳng và nêu rõ điều đó để lại phần nào chưa được chứng minh.</p>

<h2><span class="num">04c</span> Baseline: gate báo regression, không báo đỏ kế thừa</h2>
<p>Bộ <code>tests/unit_tests/</code> được nhập vào kèm theo một tập test đã đỏ sẵn từ cây nguồn.
Nếu gate chỉ nhìn mã thoát của pytest thì nó <strong>không bao giờ xanh được</strong> — và một cổng
vĩnh viễn đỏ chỉ dạy người ta cách bỏ qua nó.</p>
<p><code>scripts/ci/pytest_gate.py</code> ({f["baseline_gate_loc"]} dòng) so kết quả với
<code>tests/known_failures.txt</code>: hiện có <strong>{
        f["baseline_count"]
    } test</strong> đỏ kế thừa
trên {
        f["baseline_files"]
    } file. Gate chỉ fail khi xuất hiện một failure <em>không</em> nằm trong danh sách đó.
Test nào rời khỏi danh sách cũng được báo, để baseline không âm thầm phình ra.</p>
<p>Baseline phải đo trong môi trường tất định, nếu không nó ghi lại cái shell chứ không ghi lại mã nguồn:
gate tự ghim <code>PYTHONUTF8</code> cho tiến trình pytest, vì Windows mặc định giải mã fixture bằng
codepage ANSI — cùng một bộ test xanh khi chạy từ shell UTF-8 và chết vì <code>UnicodeDecodeError</code>
khi chạy từ git hook.</p>

<h2><span class="num">05</span> Lớp bổ sung — linter overlay &amp; contract test</h2>
<p>Hai nguồn bằng chứng giả tinh vi hơn, đều đã bị bịt:</p>
{
        table(
            ["Nguồn", "Vấn đề", "Cách chặn"],
            [
                [
                    "Overlay có worked example",
                    "Nhúng sẵn <code>VERDICT: PASS</code> → dạy agent bịa VERIFY",
                    "<code>validate_overlays.py</code> chặn verdict cứng, transcript giả, path chết",
                ],
                [
                    "Test harness sinh output giả",
                    "Hàm mock tự sinh output rồi tự assert → luôn xanh",
                    "Thay bằng contract validator; adapter im lặng là FAIL, kỳ vọng không kiểm chứng được cũng FAIL",
                ],
            ],
        )
    }
{
        callout(
            "warn",
            "Nguyên tắc",
            "Một kỳ vọng <em>không kiểm chứng được</em> phải là FAIL, không phải pass im lặng. "
            "Mọi cơ chế trong trang này đều theo hướng đó.",
        )
    }

<h2><span class="num">06</span> Tự kiểm tra</h2>
<p><code>tests/smoke.py</code> — {f["smoke_checks"]} phép kiểm tra, {
        f["smoke_loc"]
    } dòng, không gọi model,
không cần dịch vụ ngoài. Trong đó có cả các test <em>meta</em>: gate có thật sự chặn evidence giả không,
adapter im lặng có fail không, mọi đường dẫn skill trong routing có tồn tại không.</p>
<div class="code-block"><div class="code-head"><span class="file">chạy</span></div><pre><code>python scripts/lite/run_check.py -- python tests/smoke.py</code></pre></div>
"""


def page_runtime(f: dict) -> str:
    rows = []
    desc = {
        "run_check.py": "Ghi evidence JSON nguyên tử (schema v1, redact secret, cap 16KB)",
        "verify_gate.py": "Stop-hook: xác thực evidence, chặn stub, quyết định mở/chặn lượt",
        "policy_check.py": "Cổng execution policy, fail-closed, hot-reload",
        "runtime_lease.py": "Lease cho process dài hạn: run/status/release/reap",
        "memory.py": "SQLite+FTS5, BM25 fuse RRF, auto-tag, redaction, GC theo giá trị",
        "escalate.py": "Leo thang bước HARD sang expert CLI, có ngân sách + timeout + lease",
        "worktree_manager.py": "Vòng đời parallel dispatch + merge arbiter",
        "validate_overlays.py": "Linter overlay: chặn evidence giả, path chết, bảng hỏng",
        "rule_ledger.py": "Sổ tự khai vi phạm rule (JSONL) + thống kê ứng viên cần siết",
        "sync-kernel.py": "Sinh CLAUDE/AGENTS/GEMINI.md từ kernel, ép ngân sách 7k token",
    }
    for name, loc in f["scripts"]:
        rows.append(
            [f"<code>{esc(name)}</code>", esc(desc.get(name, "—")), f"{loc} dòng"]
        )
    tools = table(
        ["Tool", "Việc"],
        [
            ["<code>dn_start_pipeline</code>", "Bắt đầu một lượt chạy, reset state"],
            ["<code>dn_get_state</code>", "Đọc toàn bộ state: phase, gate, status"],
            [
                "<code>dn_advance_phase</code>",
                "Sang phase kế — <strong>bị chặn nếu gate của phase hiện tại chưa được duyệt</strong>",
            ],
            ["<code>dn_request_gate_approval</code>", "Đăng ký yêu cầu duyệt gate"],
            [
                "<code>dn_approve_gate</code>",
                "Ghi quyết định của người dùng (chỉ gọi SAU khi họ đã quyết)",
            ],
            ["<code>dn_fail_pipeline</code>", "Đánh dấu thất bại kèm lý do"],
            ["<code>dn_memory_add</code>", "Ghi quan sát vào memory dự án"],
            ["<code>dn_memory_search</code>", "Tìm trong memory (BM25 + RRF)"],
        ],
    )
    return f"""
<section class="hero compact">
  <span class="tag">TẦNG 3</span>
  <h1>Runtime — <span class="accent">{len(f["scripts"])} công cụ, {
        f["script_loc"]
    } dòng</span></h1>
  <p class="lead">Python thuần, <strong>zero-dependency</strong>, chạy trên Windows/macOS/Linux.
  Không cần npm install, không cần venv, không có gói ngoài nào.</p>
</section>

<h2><span class="num">01</span> Bộ công cụ</h2>
{table(["Script", "Vai trò", "Kích thước"], rows)}

{
        callout(
            "tip",
            "Vì sao zero-dependency",
            "Một agent OS mà cài đặt phức tạp thì sẽ không được dùng. Toàn bộ tầng runtime chỉ cần "
            "Python trong stdlib — kể cả MCP server (tự viết JSON-RPC) và bộ đọc YAML (parser giới hạn "
            "cho đúng schema policy/contract).",
        )
    }

<h2><span class="num">02</span> Escalation có kỷ luật</h2>
<p>Bước HARD được giao cho một expert CLI trong ngữ cảnh sạch, kèm packet đã redact
(task + evidence gần nhất + diff). Ba ràng buộc:</p>
<ul class="rules">
  <li><strong>Ngân sách</strong> — quá số lần cho phép thì dừng và đợi người dùng, không "cố làm hết sức".</li>
  <li><strong>Timeout</strong> — cấu hình được, kẹp trong [1, 3600] giây.</li>
  <li><strong>Lease</strong> — provider chạy dưới lease; treo thì bị giết, trả 124, và gỡ lease.</li>
</ul>
{code("scripts/lite/escalate.py", r"^def provider_timeout_seconds", 9)}
{
        callout(
            "warn",
            "Bẫy Windows đã gặp",
            "Prompt nhiều dòng truyền qua argv bị cmd.exe nghiền nát khi CLI là shim <code>.CMD</code> của npm — "
            "lần gọi đầu tiên expert nhận được prompt rỗng và trả lời lạc đề. Nay prompt đi qua stdin.",
        )
    }

<h2><span class="num">03</span> Parallel dispatch</h2>
<p>Worker chạy trên git worktree riêng, mỗi worker bị ràng bởi một task contract khai báo
glob được phép sửa và glob cấm. Merge arbiter từ chối mọi thứ ngoài phạm vi:</p>
{code("scripts/lite/worktree_manager.py", r"^def _validate", 16, "merge arbiter")}

<h2><span class="num">04</span> MCP server</h2>
<p>{
        f["mcp_loc"]
    } dòng, stdio JSON-RPC tự viết, không dùng SDK. Đăng ký sẵn trong <code>.mcp.json</code>.</p>
{tools}
<p>Kỷ luật gate được cưỡng bức ngay trong state machine — không phải bằng lời nhắc:</p>
{code("mcp/server.py", r"^def tool_advance_phase", 16)}
"""


def memory_engine_facts() -> dict:
    """Which memory layer the harness uses, read from what git records.

    The site used to quote scripts/lite/memory.py, counting its lines and
    excerpting its functions. That module was retired on 2026-09-21; the memory
    is the DAI memory plugin now, a submodule pinned to one commit, and a page
    that still described the old one would be the exact failure this project
    keeps writing tests against. The pointer is read from the index, so the
    page is right even in a clone whose submodule was never initialised.
    """
    import configparser

    commit = "unknown"
    try:
        entry = subprocess.run(
            ["git", "ls-files", "--stage", "--", "vendor/dai-memory"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=30,
        ).stdout.split()
        if entry and entry[0] == "160000":
            commit = entry[1][:12]
    except (OSError, subprocess.SubprocessError):
        pass
    modules = configparser.ConfigParser()
    modules.read(ROOT / ".gitmodules", encoding="utf-8")
    source = modules.get('submodule "vendor/dai-memory"', "url", fallback="unknown")
    return {"commit": commit, "source": source}


def page_memory(f: dict) -> str:
    engine = f["memory_engine"]
    return f"""
<section class="hero compact">
  <span class="tag">PERSISTENCE</span>
  <h1>Memory — <span class="accent">lớp ký ức dùng chung</span></h1>
  <p class="lead">Ghi lại <b>vì sao</b>: quyết định, sự cố, ràng buộc — rồi lấy ra khi agent
  cần lý do đằng sau đoạn code nó không viết. Chạy local, không dịch vụ ngoài.</p>
</section>

<h2><span class="num">01</span> Nó nằm ở đâu</h2>
<p>Engine là plugin
<code>{esc(engine["source"])}</code>, ghim ở commit <code>{
        esc(engine["commit"])
    }</code>,
gắn vào <code>vendor/dai-memory</code> dưới dạng git submodule — harness chỉ ghi một con trỏ
commit, mọi thay đổi của memory làm ở repo plugin trước. Bản cài đặt nằm <b>ngoài</b> repo,
mỗi commit một thư mục — cài xong khoảng 500 MB, mà các verifier của dự án chép và băm toàn
bộ cây làm việc:</p>
{code("scripts/lite/dai_memory.py", r"^def engine_dir", 16)}

<h2><span class="num">02</span> Ba lớp ký ức</h2>
{
        table(
            ["Lớp", "Chứa gì", "Ví dụ"],
            [
                [
                    "<code>semantic</code>",
                    "Điều đúng cho tới khi bị thay thế",
                    "quyết định, ràng buộc, quy ước",
                ],
                [
                    "<code>episodic</code>",
                    "Điều đã xảy ra",
                    "sự cố, lỗi, phiên làm việc",
                ],
                [
                    "<code>procedural</code>",
                    "Cách làm một việc",
                    "quy trình, hướng dẫn",
                ],
            ],
        )
    }
<p>Harness gọi qua một chỗ duy nhất, nên ánh xạ category sang lớp chỉ tồn tại một bản:</p>
{code("scripts/lite/dai_memory.py", r"^CATEGORY_LAYERS", 14)}

<h2><span class="num">03</span> Truy hồi ba nhánh</h2>
<p>BM25 trên postings, tương đồng vector xếp hạng ngay trong database, và độ mới × tầm quan trọng
— hợp nhất bằng Reciprocal Rank Fusion. Mỗi kết quả mang theo khối <code>fusion</code> nói rõ
nhánh nào tìm ra cái gì, vì một nhánh trả rỗng mà im lặng sẽ biến hợp nhất thành
"nhánh nào còn sống".</p>

<h2><span class="num">04</span> Ký ức nối vào code</h2>
<p>Lớp này đồng thời dựng code graph: mỗi file khai báo gì, và các khai báo tác động lên nhau
ra sao. Đó là cách một quyết định ghi trên một hàm được tìm thấy từ đoạn code phụ thuộc vào nó —
<code>dai_memory_context</code> trả về cả nơi gọi, nơi bị gọi, lẫn ký ức đã ghi về nó.</p>

<h2><span class="num">05</span> Cái gì đã nghỉ</h2>
{
        table(
            ["Đã gỡ (2026-09-21)", "Thay bằng"],
            [
                [
                    "<code>scripts/lite/memory.py</code> (SQLite + FTS5)",
                    "kho của lớp ký ức; dữ liệu cũ được <code>scripts/lite/migrate-memory.py</code> chuyển sang",
                ],
                [
                    "<code>scripts/memory/local_memory.py</code> (ChromaDB + torch)",
                    "bộ nhúng của chính lớp này, một model 130 MB",
                ],
                [
                    "<code>antigravity/src/memory/graph*.py</code> (GraphRAG)",
                    "đồ thị ký ức và phân cụm sẵn có",
                ],
            ],
        )
    }
<p>Di trú là idempotent: id suy ra từ hàng cũ, nên chạy hai lần không sinh bản trùng.</p>
"""


def page_patterns(f: dict) -> str:
    items = [
        (
            "Evidence do máy ghi, không phải do agent kể",
            "Tách <em>chạy kiểm chứng</em> khỏi <em>báo cáo kết quả</em>. Script chạy lệnh và ghi JSON "
            "kèm exit code + tree-sha + timestamp; agent chỉ được trích dẫn. Bằng chứng gõ tay bị coi là giả theo định nghĩa.",
            "Mọi hệ có AI tự báo cáo kết quả.",
        ),
        (
            "Cổng hoàn thành lượt (stop hook)",
            "Một hook chạy lúc agent định kết thúc, kiểm tra evidence tương ứng với thay đổi thực tế trong cây làm việc. "
            "Đây là chỗ duy nhất không thể nói vòng qua bằng ngôn từ.",
            "Claude Code / Codex / bất kỳ harness nào có hook.",
        ),
        (
            "Fail-closed cho luật bảo mật",
            "Config thiếu, hỏng, hoặc giá trị lạ ⇒ <em>chặn</em>. Chỉ luật không-bảo-mật mới được fail-open. "
            "Ngược lại với thói quen 'lỗi config thì bỏ qua cho chạy'.",
            "Bất kỳ policy engine nào.",
        ),
        (
            "Runtime lease cho process dài hạn",
            "Dev server, watcher, emulator phải đăng ký lease; cuối lượt bắt buộc CLEAN hoặc giải thích "
            "<code>policy=keep</code>. Process không lease = leak, không phải ngoại lệ.",
            "Agent được phép chạy server.",
        ),
        (
            "Ngân sách token cứng cho prompt hệ thống",
            "Sinh prompt boot từ nguồn duy nhất và <strong>fail build</strong> khi vượt ngưỡng. "
            "Không có bước này, prompt hệ thống phình dần cho tới khi nuốt hết context window.",
            "Mọi agent có system prompt dài.",
        ),
        (
            "Overlay không được chứa kết quả mẫu",
            "Tài liệu mà agent bắt chước tuyệt đối không được nhúng output thành công dựng sẵn — "
            "nó dạy agent <em>viết ra</em> kết quả thay vì <em>tạo ra</em> kết quả. Có linter chặn.",
            "Thư viện prompt/skill bất kỳ.",
        ),
        (
            "Kỳ vọng không kiểm chứng được ⇒ FAIL",
            "Khi harness không có cách xác minh một khẳng định, nó phải báo lỗi chứ không im lặng cho qua. "
            "Test luôn xanh còn tệ hơn không có test.",
            "Test harness, eval, CI.",
        ),
        (
            "Task contract + merge arbiter",
            "Worker song song khai báo trước glob được sửa và glob cấm; trọng tài từ chối merge mọi thay đổi "
            "ngoài phạm vi. Ngăn worker giẫm chân nhau mà không cần khoá.",
            "Multi-agent chạy song song.",
        ),
        (
            "Fresh-context review",
            "Người review chỉ thấy diff + yêu cầu gốc, không thấy chuỗi suy luận đã tạo ra diff. "
            "Bối cảnh xây dựng chính là thứ làm mù người review.",
            "Code review, self-critique.",
        ),
        (
            "Progressive disclosure cho memory",
            "Ba lớp truy xuất (tiêu đề → tóm tắt → đầy đủ) với trần token rõ ràng, thay vì nạp hết vào context.",
            "Bất kỳ hệ RAG/memory nào.",
        ),
        (
            "Sổ vi phạm rule",
            "Ghi lại mỗi lần agent tự nhận (hoặc bị nhắc) là quên rule. Rule bị quên ≥3 lần là ứng viên "
            "cần siết bằng cơ chế máy, không phải bằng câu chữ mạnh hơn.",
            "Cải tiến prompt dựa trên dữ liệu.",
        ),
        (
            "Tài liệu sinh từ source",
            "Chính trang bạn đang đọc: mọi số liệu và code excerpt đọc từ working tree lúc build, "
            "và build fail nếu anchor biến mất. Tài liệu chép tay luôn drift.",
            "Mọi tài liệu kiến trúc.",
        ),
    ]
    cards = "".join(
        f"""<div class="card pattern">
  <div class="pattern-num">{i:02d}</div>
  <h4 class="mt-0">{esc(t)}</h4>
  <p class="small">{d}</p>
  <div class="tags"><span class="tag-sm">Dùng được cho: {esc(w)}</span></div>
</div>"""
        for i, (t, d, w) in enumerate(items, 1)
    )
    return f"""
<section class="hero compact">
  <span class="tag">TINH TÚY</span>
  <h1>{len(items)} pattern <span class="accent">đáng mang sang project khác</span></h1>
  <p class="lead">Phần lớn giá trị của DAI Nexus không nằm ở lượng file, mà ở vài cơ chế nhỏ
  buộc một agent phải trung thực. Đây là danh sách rút gọn — mỗi cái đều đang chạy thật trong repo này.</p>
</section>

<div class="grid cols-2">{cards}</div>

<h2><span class="num">01</span> Bộ tối thiểu nếu chỉ lấy 3 thứ</h2>
{
        callout(
            "tip",
            "Thứ tự ưu tiên",
            "1. <strong>Evidence writer + stop gate</strong> — không có nó, mọi luật khác chỉ là lời khuyên.<br>"
            "2. <strong>Ngân sách token cho kernel</strong> — giữ bộ luật đủ nhỏ để luôn được nạp.<br>"
            "3. <strong>Runtime lease</strong> — rẻ nhất để làm, và cứu máy bạn khỏi chết dần vì process mồ côi.",
        )
    }

<h2><span class="num">02</span> Cái không nên copy</h2>
<p>Số lượng. Repo này có {len(f["overlays"])} overlay và {
        len(f["protocols"])
    } protocol vì được chưng cất
từ một hệ lớn hơn — nhưng chi phí bảo trì tăng theo số file, còn giá trị thì không.
Bắt đầu từ kernel + một orchestrator, thêm overlay khi thật sự đụng domain đó.</p>
"""


EXTRA_CSS = """
/* ── docs additions ─────────────────────────────────────────── */
.hero.compact { padding: 36px 0 18px; }
.rules { margin-left: 22px; color: var(--text-1); }
.rules li { margin: 6px 0; }
.code-block { margin: 14px 0; border: 1px solid var(--border); border-radius: var(--radius);
  overflow: hidden; background: var(--bg-1); }
.code-head { display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 7px 12px; background: var(--bg-2); border-bottom: 1px solid var(--border);
  font-family: var(--font-mono); font-size: 11.5px; }
.code-head .file { color: var(--accent-dim); }
.code-head .cap { color: var(--text-3); }
.code-block pre { margin: 0; padding: 12px 14px; overflow-x: auto; }
.code-block code { font-family: var(--font-mono); font-size: 12.5px; line-height: 1.6;
  color: var(--text-1); white-space: pre; }
.card.pattern { position: relative; padding-top: 26px; }
.pattern-num { position: absolute; top: 10px; right: 14px; font-family: var(--font-mono);
  font-size: 20px; font-weight: 700; color: var(--accent-fade); }
table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 14px; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
th { color: var(--text-0); font-weight: 600; background: var(--bg-2); }
td code, li code, p code { font-family: var(--font-mono); font-size: 12.5px;
  background: var(--bg-3); padding: 1px 5px; border-radius: 4px; color: var(--accent-dim); }
"""


def build(css: str = "") -> dict[str, str]:
    f = facts()
    return {
        "index.html": page(("index.html"), "Tổng quan", page_index(f), f),
        "kernel.html": page("kernel.html", "Kernel", page_kernel(f), f),
        "skills.html": page("skills.html", "Skills", page_skills(f), f),
        "evidence.html": page("evidence.html", "Chuỗi bằng chứng", page_evidence(f), f),
        "runtime.html": page("runtime.html", "Runtime", page_runtime(f), f),
        "memory.html": page("memory.html", "Memory", page_memory(f), f),
        "patterns.html": page("patterns.html", "Tinh túy", page_patterns(f), f),
    }


def _utf8_io() -> None:
    """Windows consoles default to a legacy codepage; non-ASCII output would
    crash the tool instead of printing. Force UTF-8 on our own streams."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def _ignore_build_date(text: str | None) -> str:
    """Compare pages without the footer date, which changes every day."""
    return re.sub(r"build \d{4}-\d{2}-\d{2}", "", text or "")


def main() -> None:
    _utf8_io()
    check_only = "--check" in sys.argv

    css = DOCS / "style.css"
    base = css.read_text(encoding="utf-8")
    marker = "/* ── docs additions"
    desired_css = (
        (base.split(marker)[0].rstrip() + "\n" + EXTRA_CSS)
        if marker in base
        else (base.rstrip() + "\n" + EXTRA_CSS)
    )

    # The standalone page inlines the stylesheet, so it must be built from the
    # CSS this run will write — not the copy already on disk.
    pages = build(desired_css)

    stale = []
    for name, content in pages.items():
        path = DOCS / name
        old = path.read_text(encoding="utf-8") if path.is_file() else None
        # Ignore the build-date line when comparing, it changes every day.

        if _ignore_build_date(old) != _ignore_build_date(content):
            stale.append(name)
            if not check_only:
                path.write_text(content, encoding="utf-8")
    if css.read_text(encoding="utf-8") != desired_css:
        stale.append("style.css")
        if not check_only:
            css.write_text(desired_css, encoding="utf-8")

    if check_only:
        if stale:
            print(
                f"[docs] STALE: {', '.join(stale)} — run: python docs/build_docs.py",
                file=sys.stderr,
            )
            sys.exit(1)
        print(f"[docs] OK — {len(pages)} page(s) up to date")
        sys.exit(0)

    print(
        f"[docs] wrote {len(pages)} page(s)"
        + (f" (updated: {', '.join(stale)})" if stale else " (no change)")
    )


if __name__ == "__main__":
    main()
