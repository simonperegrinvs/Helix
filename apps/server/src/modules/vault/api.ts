import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, normalize, relative, resolve } from "node:path";
import { DomainError } from "@helix/shared-kernel";

const REQUIRED_PATHS = [
  "00-project/project.md",
  "00-project/scope.md",
  "00-project/glossary.md",
  "01-questions/open-questions.md",
  "01-questions/active-hypotheses.md",
  "02-sources/imported-reports/.gitkeep",
  "02-sources/manual-notes/.gitkeep",
  "02-sources/references/.gitkeep",
  "03-findings/findings.md",
  "03-findings/claims.md",
  "04-synthesis/current-synthesis.md",
  "04-synthesis/timeline.md",
  "05-conversations/.gitkeep",
  "06-queries/external-research-queries.md",
  "07-attachments/.gitkeep",
  ".research/manifest.json",
] as const;

export interface ProjectTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: ProjectTreeNode[];
}

export class VaultApi {
  async ensureProjectStructure(
    projectRoot: string,
    projectName: string,
    slug: string,
  ): Promise<void> {
    await mkdir(projectRoot, { recursive: true });

    for (const relativePath of REQUIRED_PATHS) {
      const absolutePath = resolve(projectRoot, relativePath);
      await mkdir(resolve(absolutePath, ".."), { recursive: true });

      const exists = await stat(absolutePath)
        .then(() => true)
        .catch(() => false);

      if (!exists) {
        if (relativePath.endsWith(".json")) {
          const content = JSON.stringify(
            {
              projectName,
              slug,
              createdAt: new Date().toISOString(),
              schemaVersion: 1,
            },
            null,
            2,
          );
          await writeFile(absolutePath, `${content}\n`, "utf8");
        } else if (relativePath.endsWith(".md")) {
          await writeFile(absolutePath, this.defaultMarkdownFor(relativePath, projectName), "utf8");
        } else {
          await writeFile(absolutePath, "", "utf8");
        }
      }
    }
  }

  async readProjectTree(projectRoot: string): Promise<ProjectTreeNode> {
    return this.readNode(projectRoot, ".");
  }

  async readNote(projectRoot: string, notePath: string): Promise<string> {
    const absolutePath = this.resolveSafePath(projectRoot, notePath);
    return readFile(absolutePath, "utf8");
  }

  async writeNote(projectRoot: string, notePath: string, content: string): Promise<void> {
    const absolutePath = this.resolveSafePath(projectRoot, notePath);
    await mkdir(resolve(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
  }

  async appendSection(projectRoot: string, notePath: string, section: string): Promise<void> {
    const existing = await this.readNote(projectRoot, notePath).catch(() => "");
    const normalized =
      existing.endsWith("\n") || existing.length === 0 ? existing : `${existing}\n`;
    await this.writeNote(projectRoot, notePath, `${normalized}\n${section.trim()}\n`);
  }

  async listMarkdownFiles(projectRoot: string): Promise<string[]> {
    const output: string[] = [];

    const walk = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const next = join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(next);
          continue;
        }
        if (!entry.name.endsWith(".md")) {
          continue;
        }
        output.push(relative(projectRoot, next));
      }
    };

    await walk(projectRoot);
    return output.sort();
  }

  resolveSafePath(projectRoot: string, notePath: string): string {
    const sanitized = normalize(notePath).replace(/^\/+/, "");
    const absolute = resolve(projectRoot, sanitized);
    const rel = relative(projectRoot, absolute);
    if (rel.startsWith("..") || rel.includes(`${normalize("../")}`)) {
      throw new DomainError("Path escapes project root", "VAULT_PATH_ESCAPE");
    }
    return absolute;
  }

  private async readNode(projectRoot: string, relativePath: string): Promise<ProjectTreeNode> {
    const absolutePath = resolve(projectRoot, relativePath);
    const stats = await stat(absolutePath);
    if (!stats.isDirectory()) {
      return {
        name: relativePath,
        path: relativePath,
        type: "file",
      };
    }

    const entries = await readdir(absolutePath, { withFileTypes: true });
    const children: ProjectTreeNode[] = [];
    for (const entry of entries) {
      const childRelative = relativePath === "." ? entry.name : join(relativePath, entry.name);
      if (entry.isDirectory()) {
        children.push(await this.readNode(projectRoot, childRelative));
      } else {
        children.push({
          name: entry.name,
          path: childRelative,
          type: "file",
        });
      }
    }

    return {
      name: relativePath === "." ? "project" : relativePath,
      path: relativePath,
      type: "directory",
      children: children.sort((a, b) => a.path.localeCompare(b.path)),
    };
  }

  private defaultMarkdownFor(relativePath: string, projectName: string): string {
    switch (relativePath) {
      case "00-project/project.md":
        return `# ${projectName}\n\n## Charter\n\nDescribe the research intent and constraints.\n`;
      case "00-project/scope.md":
        return "# Scope\n\n## In\n\n-\n\n## Out\n\n-\n";
      case "01-questions/open-questions.md":
        return "# Open Questions\n\n-\n";
      case "04-synthesis/current-synthesis.md":
        return "# Current Synthesis\n\nNo synthesis yet.\n";
      default:
        return `# ${relativePath.split("/").at(-1)?.replace(".md", "") ?? "Note"}\n\n`;
    }
  }
}
