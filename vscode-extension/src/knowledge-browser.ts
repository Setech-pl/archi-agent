import {profileConflict,withProfileCancellation}from"./profile-availability.js";
import { configuredArchitectureSource } from "./settings.js";
import { inspectArchitectureSource, type KnowledgePackSourceConfig, type KnowledgeSnapshot } from "../../src/runtime/index.js";
import * as vscode from "vscode";
import path from "node:path";
import { createHash } from "node:crypto";
import { inspectKnowledgePackDirectory, normalizeDocumentText, type DocumentSource, type KnowledgePack, type SourceLocation } from "../../src/runtime/index.js";
import { commandIds, settingsSection, settingKeys } from "./contributions.js";

interface KnowledgeNode {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly children?: readonly KnowledgeNode[];
  readonly folder?: vscode.WorkspaceFolder;
  readonly project?: boolean;
  readonly packPath?: string;
  readonly location?: SourceLocation;
  readonly epoch: number;
  readonly architectureConfig?: KnowledgePackSourceConfig;
  readonly architectureDigest?: string;
  readonly source?: Omit<DocumentSource, "text">;
  readonly sourceLine?: number;
}
/** Native read-only projection of the production loader and its K1 snapshot. */
export class KnowledgeBrowser implements vscode.TreeDataProvider<KnowledgeNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<KnowledgeNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private epoch = 0;
  private disposed = false;
  private readonly subscriptions: vscode.Disposable[];
  readonly view: vscode.TreeView<KnowledgeNode>;
  constructor() {
    this.view = vscode.window.createTreeView("archiAgent.knowledge", { treeDataProvider: this, showCollapseAll: true });
    this.subscriptions = [this.view, this.changed,
      vscode.workspace.onDidChangeConfiguration(e => { if ((e.affectsConfiguration(settingsSection + "." + settingKeys.knowledgePackPath) || e.affectsConfiguration(settingsSection + "." + settingKeys.architectureSource) || e.affectsConfiguration(settingsSection + "." + settingKeys.knowledgeServer))) this.refresh(); }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
      vscode.workspace.onDidSaveTextDocument(doc => { if ((/\/(systems|actors|relationships|aliases|rules)\.md$/u.test(doc.uri.path) || doc.uri.path.endsWith(".json"))) this.refresh(); }),
      vscode.commands.registerCommand(commandIds.refreshKnowledge, () => this.refresh()),
      vscode.commands.registerCommand(commandIds.openKnowledgeRecord, (node: KnowledgeNode) => this.open(node))];
  }
  dispose(): void { this.disposed = true; this.epoch++; this.subscriptions.forEach(s => s.dispose()); }
  refresh(): void { this.epoch++; this.changed.fire(undefined); }
  async reveal(): Promise<void> { await vscode.commands.executeCommand("archiAgent.knowledge.focus"); }
  getTreeItem(node: KnowledgeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, node.project || node.children?.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.id = node.id;
    item.tooltip = node.detail ?? node.label;
    if (!node.project && (node.location || node.detail)) item.command = { command: commandIds.openKnowledgeRecord, title: "Open knowledge", arguments: [node] };
    return item;
  }
  async getChildren(node?: KnowledgeNode): Promise<KnowledgeNode[]> {
    if (this.disposed||profileConflict()) return [];
    if (!node) {
      const folders = vscode.workspace.workspaceFolders ?? [];
      return folders.length ? folders.map(folder => ({ id: folder.uri.toString(), label: folder.name, folder, project: true, epoch: this.epoch })) :
        [{ id: "user", label: "No workspace — User settings", project: true, epoch: this.epoch }];
    }
    if (node.epoch !== this.epoch) return [];
    if (!node.project) return node.epoch === this.epoch ? [...(node.children ?? [])] : [];
    const epoch = this.epoch;
    try {
      const config = configuredArchitectureSource(vscode.workspace.getConfiguration(settingsSection,node.folder?.uri));
      if (config.kind !== "local-directory") {
        const result = await inspectArchitectureSource(config,withProfileCancellation());
        if (this.disposed || epoch !== this.epoch || JSON.stringify(config) !== JSON.stringify(configuredArchitectureSource(vscode.workspace.getConfiguration(settingsSection,node.folder?.uri)))) return [];
        return result.ok ? [this.architectureNode(node, config, result.snapshot)] : [{id:node.id+"/invalid",label:`Architecture unavailable [${result.code}]`,epoch}];
      }
    } catch { return [{id:node.id+"/invalid",label:"Architecture unavailable [architecture-source-invalid]",epoch}]; }
    const packPath = this.configuredPath(node.folder);
    const child = (label: string, detail?: string): KnowledgeNode => ({ id: node.id + "/state", label, ...(detail ? { detail } : {}), epoch });
    if (node.folder?.uri.scheme && node.folder.uri.scheme !== "file") return [child("Local project required")];
    if (!packPath) return [child("No active Knowledge Pack", "Choose or create a pack in Archi: Configuration → Knowledge Management.")];
    const result = await inspectKnowledgePackDirectory(packPath);
    if (this.disposed || epoch !== this.epoch || packPath !== this.configuredPath(node.folder)) return [];
    if (!result.ok) return [child(`Knowledge unavailable [${result.code}]`, "The active pack failed production validation/read. No previous knowledge is shown. Repair the pack or choose another, then Refresh.")];
    return [this.packNode(node, packPath, result.pack, result.snapshot.digest)];
  }
  private configuredPath(folder?: vscode.WorkspaceFolder): string {
    const config = configuredArchitectureSource(vscode.workspace.getConfiguration(settingsSection, folder?.uri));
    return config.kind === "local-directory" ? config.path : "";
  }
  private architectureNode(project: KnowledgeNode, config: Exclude<KnowledgePackSourceConfig,{kind:"local-directory"}>, snapshot: KnowledgeSnapshot): KnowledgeNode {
    const make = (id:string,label:string,detail?:string,location?:SourceLocation,children?:readonly KnowledgeNode[]):KnowledgeNode => ({id:project.id+"/"+config.sourceId+"/"+id,label,epoch:this.epoch,folder:project.folder,architectureConfig:config,architectureDigest:snapshot.digest,
      ...(detail ? {detail}:{}),...(location ? {location}:{}),...(children ? {children}:{})});
    const names = new Map(snapshot.facts.filter(f => f.table === "systems" || f.table === "actors").map(f => [f.value.id,f.value.canonicalName]));
    const children = (["systems","actors","relationships","aliases","rules"] as const).map(table => {
      const facts = snapshot.facts.filter(f => f.table === table);
      const rows = facts.map(f => {
        const label = "canonicalName" in f.value ? f.value.canonicalName : "alias" in f.value ? f.value.alias :
          "fromId" in f.value ? `${names.get(f.value.fromId)} → ${names.get(f.value.toId)}${f.table === "relationships" ? " · "+f.value.interfaceType : ""}` : f.id;
        return make(f.id,label,JSON.stringify({value:f.value,provenance:f.provenance},null,2),undefined,
          f.provenance.map((p,i)=>make(f.id+"/"+i,`${p.sourceId} · ${(p.fields ?? []).join(", ")} · ${p.location?`${p.location.file}:${p.location.line}`:p.reference?.uri??p.externalId??"No local locator"}`,JSON.stringify(p,null,2),p.location)));
      }).sort((a,b)=>a.label<b.label?-1:a.label>b.label?1:0);
      return make(table,`${table[0]!.toUpperCase()+table.slice(1)} (${rows.length})`,undefined,undefined,rows);
    });
    children.push(make("omissions","Omitted source content",JSON.stringify(snapshot.sources.flatMap(s=>s.omissions??[]),null,2)));
    return make("root",`Active ${config.kind==="mcp"?"MCP knowledge":"Structurizr"} — ${config.sourceId}`,`K1 snapshot: ${snapshot.digest}`,undefined,children);
  }
  private packNode(project: KnowledgeNode, packPath: string, pack: KnowledgePack, digest: string): KnowledgeNode {
    const prefix = project.id + "/" + packPath;
    const make = (id: string, label: string, detail?: string, location?: SourceLocation, children?: readonly KnowledgeNode[]): KnowledgeNode => ({
      id: prefix + "/" + id, label, epoch: this.epoch, packPath, ...(project.folder ? { folder: project.folder } : {}),
      ...(detail ? { detail } : {}), ...(location ? { location } : {}), ...(children ? { children } : {}) });
    const details = (record: object) => Object.entries(record).filter(([key]) => key !== "location").map(([key,value]) => `${key}: ${value ?? "—"}`).join("\n");
    const relation = (r: KnowledgePack["relationships"][number], id: string) => make(id, `${r.fromId} → ${r.toId} · ${r.interfaceType} · ${r.mode}`, details(r), r.location);
    const systems = pack.systems.map(s => make("system/" + s.id, `${s.canonicalName} [${s.id}]`, details(s), s.location, [
      make("system/"+s.id+"/aliases", `Aliases (${pack.aliases.filter(a => a.targetId === s.id).length})`, undefined, undefined,
        pack.aliases.filter(a => a.targetId === s.id).map((a,i) => make(`system/${s.id}/alias/${i}`, a.alias, details(a), a.location))),
      ...(["outgoing", "incoming"] as const).map(direction => {
        const relations = pack.relationships.filter(r => (direction === "outgoing" ? r.fromId : r.toId) === s.id);
        return make(`system/${s.id}/${direction}`, `${direction === "outgoing" ? "Outgoing" : "Incoming"} relations (${relations.length})`, undefined, undefined,
          relations.map((r,i) => relation(r, `system/${s.id}/${direction}/${i}`)));
      })]));
    const sources = new Map<string, NonNullable<KnowledgePack["documentProvenance"]>[number]["sources"][number]>();
    for (const metadata of pack.documentProvenance ?? []) for (const source of metadata.sources) sources.set(source.sourceId, source);
    const sourceNodes = [...sources.values()].map(source => ({ ...make("source/"+source.sourceId, `${source.type.toUpperCase()} · ${source.scope} · ${source.sourceId}`,
      JSON.stringify(source, null, 2) + "\nEvidence offsets describe normalized extraction text. A live editor source opens only while its normalized digest still matches; otherwise these frozen details remain available.", undefined,
      (pack.documentProvenance ?? []).flatMap(m => m.entries.flatMap(e => e.evidence.filter(v => v.sourceId === source.sourceId).map((v,i) => ({ ...make(`source/${source.sourceId}/${e.candidateId}/${i}`, `${e.candidateId} · lines ${v.location.startLine}–${v.location.endLine}`, JSON.stringify(v, null, 2)), source, sourceLine: v.location.startLine }))))), source }));
    const groups = [make("systems", `Systems (${systems.length})`, undefined, undefined, systems),
      make("actors", `Actors (${pack.actors.length})`, undefined, undefined, pack.actors.map(a => make("actor/"+a.id, `${a.canonicalName} [${a.id}]`, details(a), a.location))),
      make("relations", `Relations (${pack.relationships.length})`, undefined, undefined, pack.relationships.map((r,i) => relation(r,"relation/"+i))),
      make("rules", `Rules (${pack.rules.length})`, undefined, undefined, pack.rules.map((r,i) => make("rule/"+i, `${r.rule}: ${r.fromId} → ${r.toId}`, details(r), r.location))),
      ...(sources.size ? [make("sources", `Sources / Evidence (${sources.size})`, undefined, undefined, sourceNodes)] : []),
      make("files", "Files (5)", undefined, undefined, ["systems.md","actors.md","relationships.md","aliases.md","rules.md"].map(file => make("file/"+file, file, undefined, { file, line: 1 })))];
    return make("pack", `Active Knowledge Pack — ${path.basename(packPath)}`, `${packPath}\nK1 snapshot: ${digest}\nValidated by the production loader.`, undefined, groups);
  }
  private async open(node: KnowledgeNode): Promise<void> {
    if (!node || this.disposed || node.epoch !== this.epoch) return;
    try {
      if (node.architectureConfig) {
        const current = configuredArchitectureSource(vscode.workspace.getConfiguration(settingsSection,node.folder?.uri));
        if (JSON.stringify(current) !== JSON.stringify(node.architectureConfig)) { this.refresh(); return; }
        const loaded = await inspectArchitectureSource(current,withProfileCancellation());
        if (!loaded.ok || loaded.snapshot.digest !== node.architectureDigest) { this.refresh(); return; }
        if (this.disposed || node.epoch !== this.epoch) return;
        if (node.location && current.kind === "structurizr-json") {
          const modelFile = `sources/${current.sourceId}/workspace.json`, overlayPrefix = `sources/${current.sourceId}-overlay/`;
          const relative = node.location.file.startsWith(overlayPrefix) ? node.location.file.slice(overlayPrefix.length) : undefined;
          const file = node.location.file === modelFile ? current.modelPath : relative && ["aliases.md","rules.md","relationships.md"].includes(relative) ? path.join(current.overlayPath,relative) : undefined;
          if (file) {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
            const proof = loaded.snapshot.sources.flatMap(s => s.files ?? []).find(f => f.file === node.location!.file);
            if (proof && createHash("sha256").update(doc.getText()).digest("hex") === proof.sha256) {
              await vscode.window.showTextDocument(doc,{preview:false,selection:new vscode.Range(node.location.line-1,0,node.location.line-1,0)}); return;
            }
            // A dirty editor is not the captured file. Show frozen origin details instead of a misleading line.
          }
        }
        if (node.detail) await vscode.workspace.openTextDocument({content:node.detail,language:"json"}).then(doc=>vscode.window.showTextDocument(doc,{preview:false}));
        return;
      }
      if (node.packPath && (node.packPath !== this.configuredPath(node.folder) || !(await inspectKnowledgePackDirectory(node.packPath)).ok)) { this.refresh(); return; }
      if (this.disposed || node.epoch !== this.epoch) return;
      if (node.source?.editorUri) {
        try {
          const uri = vscode.Uri.parse(node.source.editorUri);
          if (!["file", "untitled"].includes(uri.scheme)) throw new Error("unsupported-source");
          const live = uri.scheme === "untitled" ? vscode.workspace.textDocuments.find(doc => doc.uri.toString() === node.source!.editorUri) : await vscode.workspace.openTextDocument(uri);
          if (!live || createHash("sha256").update(normalizeDocumentText(live.getText())).digest("hex") !== node.source.textDigest) throw new Error("changed-source");
          if (this.disposed || node.epoch !== this.epoch) return;
          const line = (node.sourceLine ?? 1) - 1;
          await vscode.window.showTextDocument(live, { preview: false, selection: new vscode.Range(line, 0, line, 0) });
          return;
        } catch { /* Local provenance is available, but the live buffer may have changed or closed. Show frozen details below. */ }
      }
      if (node.location && node.packPath) {
        if (!["systems.md", "actors.md", "relationships.md", "aliases.md", "rules.md"].includes(node.location.file)) return;
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(node.packPath, node.location.file)));
        await vscode.window.showTextDocument(document, { preview: false, selection: new vscode.Range(node.location.line - 1, 0, node.location.line - 1, 0) });
      } else if (node.detail) {
        const document = await vscode.workspace.openTextDocument({ content: node.detail, language: "plaintext" });
        await vscode.window.showTextDocument(document, { preview: true });
      }
    } catch { void vscode.window.showErrorMessage("Archi Agent: knowledge could not be opened. Refresh and validate the active pack."); }
  }
}
