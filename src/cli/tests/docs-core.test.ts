import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  DocsManifestError,
  initManifest,
  loadManifest,
  validateManifest,
} from "../src/docs/manifest.js";
import {
  createDefaultProjectState,
  safeLoadProjectState,
  validateProjectState,
} from "../src/docs/project-state.js";
import {
  DocsPathError,
  isAllowedByPrivacy,
  matchesGlob,
  resolveWithinProject,
} from "../src/docs/privacy.js";
import {
  addRegistryProject,
  loadRegistry,
  removeRegistryProject,
} from "../src/docs/registry.js";
import {
  getCatalogPath,
  scanProject,
  writeCatalog,
} from "../src/docs/scanner.js";
import { doctorProject } from "../src/docs/doctor.js";
import { resolveCatalogLinks } from "../src/docs/links.js";
import { executeDocsBuild } from "../src/commands/docs.js";

// Symlink creation on Windows needs SeCreateSymbolicLinkPrivilege (Developer
// Mode or an elevated shell). Without it these cases cannot exercise their
// subject at all, so they are gated on a probe rather than reported as
// failures — they run unchanged wherever the privilege exists.
const CAN_SYMLINK = (() => {
  const probe = mkdtempSync(join(tmpdir(), "symlink-probe-"));
  try {
    symlinkSync(join(probe, "target"), join(probe, "link"), "dir");
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
})();
const itSymlink = CAN_SYMLINK ? it : it.skip;

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "docs-hub",
);
const tempRoots: string[] = [];

function tempProject(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `dai-nexus-docs-${name}-`));
  tempRoots.push(root);
  return root;
}

function copyFixture(name: "dainexus" | "pixelworld"): string {
  const root = tempProject(name);
  cpSync(join(fixtureRoot, name), root, { recursive: true });
  return root;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

afterEach(() => {
  delete process.env.DAINEXUS_HOME;
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("docs manifest and registry", () => {
  it("initializes idempotently without overwriting an existing manifest", () => {
    const root = copyFixture("dainexus");
    const first = initManifest(root);
    expect(first.status).toBe("created");
    const customized = {
      ...first.manifest,
      project: { ...first.manifest.project, title: "Owner title" },
    };
    writeJson(first.path, customized);

    const second = initManifest(root);
    expect(second.status).toBe("already_exists");
    expect(second.manifest.project.title).toBe("Owner title");
    expect(JSON.parse(readFileSync(first.path, "utf8")).project.title).toBe(
      "Owner title",
    );
  });

  it("rejects invalid schemas and traversal paths clearly", () => {
    expect(() =>
      validateManifest({
        schema_version: 1,
        project: { id: "Bad ID", title: "" },
        sources: [{ path: "../private", type: "documentation" }],
        privacy: { mode: "allowlist" },
      }),
    ).toThrow(DocsManifestError);

    const root = tempProject("traversal");
    expect(() =>
      resolveWithinProject(root, "../outside", { mustExist: false }),
    ).toThrow(DocsPathError);
  });

  it("creates a canonical project state non-destructively", () => {
    const root = copyFixture("dainexus");
    const first = initManifest(root);
    expect(first.manifest.project_docs).toEqual({
      schema_version: 1,
      state: "docs/project-state.json",
      max_stale_days: 30,
    });
    const statePath = join(root, "docs", "project-state.json");
    const originalState = readFileSync(statePath, "utf8");
    writeJson(statePath, {
      ...createDefaultProjectState(root),
      project: {
        ...createDefaultProjectState(root).project,
        summary: "Owner state",
      },
    });
    expect(initManifest(root).status).toBe("already_exists");
    expect(readFileSync(statePath, "utf8")).not.toBe(originalState);
    expect(JSON.parse(readFileSync(statePath, "utf8")).project.summary).toBe(
      "Owner state",
    );
  });

  it("migrates an existing manifest to the mandatory project docs contract", () => {
    const root = copyFixture("dainexus");
    const manifestPath = join(root, ".dainexus", "docs-manifest.json");
    writeJson(manifestPath, {
      schema_version: 1,
      project: { id: "legacy-project", title: "Legacy Project" },
      sources: [{ path: "README.md", type: "overview" }],
      truth: ["README.md"],
      privacy: { mode: "allowlist", allow: ["README.md"] },
    });

    const result = initManifest(root);

    expect(result.status).toBe("migrated");
    expect(result.manifest.project.id).toBe("legacy-project");
    expect(result.manifest.project_docs?.state).toBe("docs/project-state.json");
    expect(result.manifest.sources).toContainEqual({
      path: "docs/project-state.json",
      type: "metadata",
    });
    expect(result.manifest.privacy.allow).toContain("README.md");
    expect(result.manifest.privacy.allow).toContain("docs/project-state.json");
    expect(existsSync(join(root, "docs", "project-state.json"))).toBe(true);
  });

  it("validates the complete project-state contract and rejects malformed sections", () => {
    const root = copyFixture("dainexus");
    const state = createDefaultProjectState(root);
    expect(validateProjectState(state)).toEqual(state);
    expect(() =>
      validateProjectState({ ...state, backlog: undefined }),
    ).toThrow();
    expect(() =>
      validateProjectState({
        ...state,
        project: { ...state.project, product_type: "website" },
      }),
    ).toThrow();
    expect(() =>
      validateProjectState({
        ...state,
        structure: {
          ...state.structure,
          roots: [{ ...state.structure.roots[0], path: "../outside" }],
        },
      }),
    ).toThrow();
    expect(() =>
      validateProjectState({
        ...state,
        roadmap: [
          {
            id: "same",
            title: "One",
            status: "planned",
            priority: "medium",
            owner: "team",
            target_date: null,
            depends_on: [],
            references: [],
          },
          {
            id: "same",
            title: "Two",
            status: "planned",
            priority: "medium",
            owner: "team",
            target_date: null,
            depends_on: [],
            references: [],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateProjectState({
        ...state,
        status: { ...state.status, updated_at: "not-a-date" },
      }),
    ).toThrow();
    expect(() =>
      validateProjectState({
        ...state,
        status: { ...state.status, lifecycle: "active" },
      }),
    ).toThrow();
    expect(() =>
      validateProjectState({
        ...state,
        structure: {
          ...state.structure,
          dependencies: [{ from: "missing", to: "missing", type: "uses" }],
        },
      }),
    ).toThrow();
    expect(() =>
      validateProjectState({
        ...state,
        roadmap: [
          {
            id: "roadmap-item",
            title: "Roadmap item",
            status: "planned",
            priority: "medium",
            owner: "team",
            target_date: "2026-02-30",
            depends_on: ["missing"],
            references: [],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateProjectState({
        ...state,
        flows: [
          {
            id: "empty-flow",
            title: "Empty flow",
            status: "draft",
            trigger: "A trigger",
            steps: [],
          },
        ],
      }),
    ).toThrow();
  });

  itSymlink(
    "rejects canonical state files reached through file or directory symlinks",
    () => {
      const root = copyFixture("dainexus");
      const realDirectory = join(root, "real-state");
      mkdirSync(realDirectory);
      writeJson(
        join(realDirectory, "project-state.json"),
        createDefaultProjectState(root),
      );
      symlinkSync(
        "real-state/project-state.json",
        join(root, "state-link.json"),
      );
      symlinkSync("real-state", join(root, "state-dir-link"));

      expect(safeLoadProjectState(root, "state-link.json").error?.code).toBe(
        "containment",
      );
      expect(
        safeLoadProjectState(root, "state-dir-link/project-state.json").error
          ?.code,
      ).toBe("containment");
    },
  );

  it("adds, canonicalizes, lists, updates and removes registry projects", () => {
    const root = copyFixture("dainexus");
    initManifest(root);
    const home = tempProject("home");
    process.env.DAINEXUS_HOME = home;
    const registryPath = join(home, "docs-hub", "projects.json");

    const added = addRegistryProject(root, registryPath);
    expect(added.status).toBe("added");
    expect(added.project.root).toBe(realpathSync(root));
    expect(loadRegistry(registryPath).projects).toHaveLength(1);
    expect(addRegistryProject(root, registryPath).status).toBe("updated");
    expect(removeRegistryProject(added.project.id, registryPath)?.root).toBe(
      realpathSync(root),
    );
    expect(loadRegistry(registryPath).projects).toEqual([]);
  });

  it("rejects duplicate project IDs for different registry roots", () => {
    const firstRoot = copyFixture("dainexus");
    const secondRoot = copyFixture("dainexus");
    initManifest(firstRoot);
    initManifest(secondRoot);
    const home = tempProject("duplicate-id-home");
    const registryPath = join(home, "docs-hub", "projects.json");

    addRegistryProject(firstRoot, registryPath);
    expect(() => addRegistryProject(secondRoot, registryPath)).toThrow(
      /already registered/,
    );
    expect(loadRegistry(registryPath).projects).toHaveLength(1);
    expect(loadRegistry(registryPath).projects[0].root).toBe(
      realpathSync(firstRoot),
    );
  });
});

describe("privacy-safe scanning and deterministic normalization", () => {
  it("supports Docs, docs, README-only and empty legacy projects", () => {
    const daiNexus = copyFixture("dainexus");
    const pixelworld = copyFixture("pixelworld");
    const readmeOnly = tempProject("readme");
    writeFileSync(join(readmeOnly, "README.md"), "# Readme only\n", "utf8");
    const empty = tempProject("empty");

    const daiNexusCatalog = scanProject(daiNexus);
    expect(daiNexusCatalog.documents.map((doc) => doc.sourcePath)).toEqual(
      expect.arrayContaining(["README.md", "docs/architecture.md"]),
    );
    expect(
      daiNexusCatalog.diagnostics.some(
        (diagnostic) => diagnostic.code === "BROKEN_LINK",
      ),
    ).toBe(false);
    expect(
      scanProject(pixelworld).documents.map((doc) => doc.sourcePath),
    ).toEqual(
      expect.arrayContaining([
        "README.md",
        "Docs/DanDao_GDD.md",
        "Docs/Design/Architecture_Guidelines.md",
      ]),
    );
    expect(scanProject(readmeOnly).documents).toHaveLength(1);
    expect(scanProject(empty).documents).toHaveLength(0);
  });

  it("excludes sensitive paths before content enters the catalog", () => {
    const root = tempProject("sensitive");
    mkdirSync(join(root, "Docs"), { recursive: true });
    mkdirSync(join(root, "credentials"), { recursive: true });
    writeFileSync(join(root, "Docs", "safe.md"), "# Safe\n", "utf8");
    writeFileSync(
      join(root, "credentials", "secret.md"),
      "# SECRET_DO_NOT_INGEST\n",
      "utf8",
    );
    writeJson(join(root, ".dainexus", "docs-manifest.json"), {
      schema_version: 1,
      project: { id: "sensitive", title: "Sensitive" },
      sources: [
        { path: "Docs", type: "documentation" },
        { path: "credentials", type: "documentation" },
      ],
      truth: [],
      privacy: {
        mode: "allowlist",
        allow: ["Docs", "credentials"],
        exclude: [],
      },
    });

    const catalog = scanProject(root);
    const serialized = JSON.stringify(catalog);
    expect(catalog.documents.map((doc) => doc.sourcePath)).toEqual([
      "Docs/safe.md",
    ]);
    expect(serialized).not.toContain("SECRET_DO_NOT_INGEST");
    expect(
      catalog.diagnostics.some(
        (diagnostic) => diagnostic.code === "SENSITIVE_SOURCE_REJECTED",
      ),
    ).toBe(true);
  });

  itSymlink(
    "reports a broken contained symlink without treating it as a privacy escape",
    () => {
      const root = tempProject("broken-symlink");
      mkdirSync(join(root, "Docs"), { recursive: true });
      symlinkSync(
        join(root, "Docs", "missing.md"),
        join(root, "Docs", "link.md"),
      );
      initManifest(root);

      const catalog = scanProject(root);
      expect(
        catalog.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === "BROKEN_SYMLINK" &&
            diagnostic.severity === "warning",
        ),
      ).toBe(true);
      expect(
        catalog.diagnostics.some(
          (diagnostic) => diagnostic.code === "PATH_CONTAINMENT_FAILED",
        ),
      ).toBe(false);
    },
  );

  itSymlink("blocks a symlink that resolves outside the project root", () => {
    const root = tempProject("symlink-escape");
    const outside = tempProject("outside");
    mkdirSync(join(root, "Docs"), { recursive: true });
    writeFileSync(join(outside, "external.md"), "# External\n", "utf8");
    symlinkSync(
      join(outside, "external.md"),
      join(root, "Docs", "external.md"),
    );
    initManifest(root);

    const catalog = scanProject(root);
    expect(
      catalog.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "PATH_CONTAINMENT_FAILED" &&
          diagnostic.severity === "error",
      ),
    ).toBe(true);
    expect(catalog.documents).toHaveLength(0);
  });

  it("keeps stable IDs and catalog fingerprints across repeated scans", () => {
    const root = copyFixture("dainexus");
    initManifest(root);
    const first = scanProject(root);
    const second = scanProject(root);
    expect(second.documents.map((doc) => doc.id)).toEqual(
      first.documents.map((doc) => doc.id),
    );
    expect(second.sourceFingerprint).toBe(first.sourceFingerprint);
    const path = writeCatalog(first);
    expect(path).toBe(getCatalogPath(root));
    expect(existsSync(path)).toBe(true);
  });

  itSymlink(
    "loads project state, reports contract failures, and fingerprints state content",
    () => {
      const root = copyFixture("dainexus");
      initManifest(root);
      const first = scanProject(root);
      expect(first.project.state).not.toBeNull();
      expect(first.project.stateHash).toBeTruthy();
      const statePath = join(root, "docs", "project-state.json");
      const changed = createDefaultProjectState(root);
      changed.project.summary = "Changed canonical state";
      writeJson(statePath, changed);
      expect(scanProject(root).sourceFingerprint).not.toBe(
        first.sourceFingerprint,
      );

      rmSync(statePath);
      expect(scanProject(root).diagnostics.map((item) => item.code)).toContain(
        "PROJECT_STATE_MISSING",
      );

      writeFileSync(statePath, "{invalid\n", "utf8");
      expect(scanProject(root).diagnostics.map((item) => item.code)).toContain(
        "PROJECT_STATE_INVALID",
      );

      const ownedState = join(root, "docs", "owned-state.json");
      writeJson(ownedState, createDefaultProjectState(root));
      rmSync(statePath);
      symlinkSync("owned-state.json", statePath);
      expect(scanProject(root).diagnostics.map((item) => item.code)).toContain(
        "PROJECT_STATE_INVALID",
      );
      rmSync(statePath);

      const stale = createDefaultProjectState(root);
      stale.status.updated_at = "2020-01-01T00:00:00Z";
      writeJson(statePath, stale);
      expect(scanProject(root).diagnostics.map((item) => item.code)).toContain(
        "PROJECT_STATE_STALE",
      );

      const inconsistent = createDefaultProjectState(root);
      inconsistent.status.updated_at = "2999-01-01T00:00:00Z";
      inconsistent.structure.roots.push({
        id: "missing-root",
        path: "missing-root",
        kind: "directory",
        purpose: "Must exist",
        owner: "team",
      });
      inconsistent.roadmap.push({
        id: "referenced-item",
        title: "Referenced item",
        status: "planned",
        priority: "medium",
        owner: "team",
        target_date: null,
        depends_on: [],
        references: [{ path: "docs/missing.md" }],
      });
      writeJson(statePath, inconsistent);
      const inconsistentCodes = scanProject(root).diagnostics.map(
        (item) => item.code,
      );
      expect(inconsistentCodes).toContain("PROJECT_STATE_FUTURE_TIMESTAMP");
      expect(inconsistentCodes).toContain("PROJECT_STRUCTURE_ROOT_UNAVAILABLE");
      expect(inconsistentCodes).toContain(
        "PROJECT_STATE_REFERENCE_UNAVAILABLE",
      );

      const manifestPath = join(root, ".dainexus", "docs-manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
        string,
        unknown
      >;
      writeJson(manifestPath, {
        ...manifest,
        privacy: { mode: "allowlist", allow: ["README.md"] },
      });
      expect(scanProject(root).diagnostics.map((item) => item.code)).toContain(
        "PROJECT_STATE_NOT_ALLOWLISTED",
      );

      writeJson(manifestPath, {
        schema_version: 1,
        project: { id: "legacy", title: "Legacy" },
        sources: [{ path: "README.md", type: "overview" }],
        privacy: { mode: "allowlist", allow: ["README.md"] },
      });
      expect(scanProject(root).diagnostics.map((item) => item.code)).toContain(
        "PROJECT_DOCS_CONTRACT_MISSING",
      );
    },
  );

  it("reports broken links, anchors, diagrams and stale indexes", () => {
    const root = tempProject("doctor");
    mkdirSync(join(root, "Docs"), { recursive: true });
    writeFileSync(
      join(root, "Docs", "broken.md"),
      [
        "# Broken",
        "",
        "[missing](missing.md)",
        "![missing image](missing.png)",
        "[anchor](#not-there)",
        "",
        "```mermaid",
        "unknownDiagram A --> B",
        "```",
      ].join("\n"),
      "utf8",
    );
    initManifest(root);
    const catalog = scanProject(root);
    expect(catalog.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "BROKEN_LINK",
        "BROKEN_ASSET",
        "BROKEN_ANCHOR",
        "INVALID_DIAGRAM",
      ]),
    );
    writeCatalog(catalog);
    writeFileSync(join(root, "Docs", "broken.md"), "# Changed\n", "utf8");

    const report = doctorProject(root, { strict: true });
    expect(report.status).toBe("fail");
    expect(report.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["STALE_DOCS_INDEX"]),
    );
  });

  it("implements allowlist and glob matching for top-level and nested docs", () => {
    expect(matchesGlob("guide.md", "**/*.md")).toBe(true);
    expect(matchesGlob("Design/guide.md", "**/*.md")).toBe(true);
    expect(
      isAllowedByPrivacy("Docs/Design/guide.md", ["Docs"], ["Docs/private/**"]),
    ).toBe(true);
    expect(
      isAllowedByPrivacy(
        "Docs/private/secret.md",
        ["Docs"],
        ["Docs/private/**"],
      ),
    ).toBe(false);
  });

  it("loads a legacy manifest without writing project files", () => {
    const root = copyFixture("pixelworld");
    const loaded = loadManifest(root);
    expect(loaded.legacy).toBe(true);
    expect(loaded.manifestPath).toBeNull();
    expect(existsSync(join(root, ".dainexus", "docs-manifest.json"))).toBe(
      false,
    );
  });

  it("resolves explicit cross-project links when projects build together", () => {
    const projectA = tempProject("project-a");
    const projectB = tempProject("project-b");
    for (const root of [projectA, projectB]) {
      mkdirSync(join(root, "Docs"), { recursive: true });
    }
    writeFileSync(
      join(projectA, "Docs", "a.md"),
      "# A\n\n[Project B](dai-nexus://project-b/Docs/b.md#target)\n",
      "utf8",
    );
    writeFileSync(join(projectB, "Docs", "b.md"), "# B\n\n## Target\n", "utf8");
    const manifestA = initManifest(projectA);
    const manifestB = initManifest(projectB);
    writeJson(manifestA.path, {
      ...manifestA.manifest,
      project: { id: "project-a", title: "Project A" },
    });
    writeJson(manifestB.path, {
      ...manifestB.manifest,
      project: { id: "project-b", title: "Project B" },
    });

    const [catalogA, catalogB] = resolveCatalogLinks([
      scanProject(projectA),
      scanProject(projectB),
    ]);
    const link = catalogA.documents[0].links[0];
    expect(link.resolvedDocumentId).toBe(catalogB.documents[0].id);
    expect(link.resolvedRoute).toContain("project-b/docs/Docs/b.md.html");
    expect(
      catalogA.diagnostics.some(
        (diagnostic) => diagnostic.code === "UNKNOWN_PROJECT_LINK",
      ),
    ).toBe(false);
  });

  it("degrades the code index explicitly when stale or unavailable", () => {
    const unavailableRoot = tempProject("code-index-unavailable");
    mkdirSync(join(unavailableRoot, "Docs"), { recursive: true });
    writeFileSync(
      join(unavailableRoot, "Docs", "guide.md"),
      "# Guide\n",
      "utf8",
    );
    const unavailableManifest = initManifest(unavailableRoot);
    writeJson(unavailableManifest.path, {
      ...unavailableManifest.manifest,
      adapters: {
        ...unavailableManifest.manifest.adapters,
        dai_memory: true,
      },
    });
    const unavailableCatalog = scanProject(unavailableRoot);
    expect(unavailableCatalog.project.facts.codeIndex.status).toBe(
      "unavailable",
    );
    expect(
      unavailableCatalog.diagnostics.some(
        (diagnostic) => diagnostic.code === "CODE_INDEX_UNAVAILABLE",
      ),
    ).toBe(true);

    const staleRoot = tempProject("code-index-stale");
    mkdirSync(join(staleRoot, "Docs"), { recursive: true });
    writeFileSync(join(staleRoot, "Docs", "guide.md"), "# Guide\n", "utf8");
    spawnSync("git", ["init"], { cwd: staleRoot });
    spawnSync("git", ["config", "user.email", "docs@example.test"], {
      cwd: staleRoot,
    });
    spawnSync("git", ["config", "user.name", "Docs Test"], { cwd: staleRoot });
    spawnSync("git", ["add", "."], { cwd: staleRoot });
    spawnSync("git", ["commit", "-m", "fixture"], { cwd: staleRoot });
    const staleManifest = initManifest(staleRoot);
    writeJson(staleManifest.path, {
      ...staleManifest.manifest,
      adapters: { ...staleManifest.manifest.adapters, dai_memory: true },
    });
    writeJson(join(staleRoot, ".memory", "meta.json"), {
      lastCommit: "0000000000000000000000000000000000000000",
      indexedAt: "2026-08-01T00:00:00Z",
      fileHashes: { "Docs/guide.md": "a", "src/a.ts": "b" },
    });
    const staleCatalog = scanProject(staleRoot);
    expect(staleCatalog.project.facts.codeIndex.status).toBe("stale");
    expect(staleCatalog.project.facts.codeIndex.files).toBe(2);
    expect(
      staleCatalog.diagnostics.some(
        (diagnostic) => diagnostic.code === "CODE_INDEX_STALE",
      ),
    ).toBe(true);

    // Indexed at the current commit, with a clean tree: nothing to report.
    const head = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: staleRoot,
      encoding: "utf8",
    }).stdout.trim();
    writeJson(join(staleRoot, ".memory", "meta.json"), {
      lastCommit: head,
      indexedAt: "2026-08-01T00:00:00Z",
      fileHashes: {},
    });
    expect(scanProject(staleRoot).project.facts.codeIndex.status).toBe(
      "available",
    );
  });

  it("honours the adapter's former gitnexus name in manifests written before", () => {
    const root = tempProject("code-index-legacy-name");
    mkdirSync(join(root, "Docs"), { recursive: true });
    writeFileSync(join(root, "Docs", "guide.md"), "# Guide\n", "utf8");
    const initialized = initManifest(root);
    const { dai_memory: _dropped, ...legacyAdapters } =
      initialized.manifest.adapters ?? {};
    writeJson(initialized.path, {
      ...initialized.manifest,
      adapters: { ...legacyAdapters, gitnexus: true },
    });
    expect(scanProject(root).project.facts.codeIndex.status).toBe(
      "unavailable",
    );

    // Once the new name is present it decides, whatever the old one says.
    writeJson(initialized.path, {
      ...initialized.manifest,
      adapters: { ...legacyAdapters, gitnexus: true, dai_memory: false },
    });
    expect(scanProject(root).project.facts.codeIndex.status).toBe("disabled");
  });

  it("preserves successful project output when another batch project fails", () => {
    const validRoot = copyFixture("dainexus");
    initManifest(validRoot);
    const invalidRoot = tempProject("invalid-batch-project");
    writeJson(join(invalidRoot, ".dainexus", "docs-manifest.json"), {
      schema_version: 99,
      project: { id: "invalid", title: "Invalid" },
      sources: [],
      privacy: { mode: "allowlist" },
    });
    const output = join(tempProject("batch-output"), "site");

    const result = executeDocsBuild([validRoot, invalidRoot], output);
    expect(result.failures).toHaveLength(1);
    expect(result.buildResult?.projects.map((project) => project.id)).toEqual([
      "dai-nexus-fixture",
    ]);
    expect(
      existsSync(join(output, "projects", "dai-nexus-fixture", "index.html")),
    ).toBe(true);
  });
});
