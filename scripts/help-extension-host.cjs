const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
exports.run = async () => {
  const results = [];
  const config = JSON.parse(fs.readFileSync(process.env.ARCHI_HELP_CONFIG, 'utf8'));
  try {
    const extension = vscode.extensions.getExtension('setech-pl.archi-agent-core') ?? vscode.extensions.getExtension('setech-pl.archi-agent');
    assert.ok(extension); await extension.activate();
    assert.equal(vscode.env.language, config.locale);
    const primary = /^pl(?:-|$)/i.test(vscode.env.language) ? 'README.pl.md' : 'readme.md';
    for (const [command, name] of [['archiAgent.help', primary], ['markdown.showPreview', primary === 'readme.md' ? 'README.pl.md' : 'readme.md']]) {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      if (command === 'archiAgent.help') await vscode.commands.executeCommand(command);
      else await vscode.commands.executeCommand(command, vscode.Uri.joinPath(extension.extensionUri, name));
      const text = fs.readFileSync(path.join(extension.extensionPath, name), 'utf8');
      assert.ok(text.includes(name === 'readme.md' ? '## Start here' : '## Zacznij tutaj'));
      assert.ok(text.includes('Apply') && text.includes('Knowledge Browser') && text.includes('Cancel'));
      assert.ok(text.toLowerCase().includes('get_enterprise_snapshot v1') && text.toLowerCase().includes('get_knowledge_snapshot v1'));
      assert.ok(text.includes('\"enterpriseSources\"') && text.includes('--check-source retail-business --type enterprise'), 'Complete offline enterprise source configuration');
      const deadline = Date.now() + 15000;
      let tab;
      do {
        tab = vscode.window.tabGroups.all.flatMap(group => group.tabs).find(tab => tab.input instanceof vscode.TabInputWebview && tab.label.toLowerCase().includes(name.toLowerCase()));
        if (tab) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      assert.ok(tab, 'Markdown preview tab did not open');
      results.push({ locale: vscode.env.language, command, file: name, status: 'PASS', preview: tab.label });
    }
  } catch (error) {
    results.push({locale: config.locale, status: 'FAIL', error: error.message});
    throw error;
  } finally {
    fs.writeFileSync(config.report, JSON.stringify({results}, null, 2) + '\n');
  }
};
