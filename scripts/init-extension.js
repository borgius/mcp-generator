#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').replace(/--+/g, '-');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      // Check if there's a next argument and it's not another flag
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        const value = args[i + 1];
        parsed[key] = value;
        i++; // Skip the value in next iteration
      } else {
        // Flag without value (boolean flag)
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

function showHelp() {
  console.log(`
Usage: node init-extension.js [options]

Options:
  --name <name>              Extension name (kebab-case)
  --display-name <name>      Display name for the extension
  --publisher <id>           Publisher ID
  --description <text>       Short description
  --owner <handle>           GitHub owner (e.g., @username)
  --servers <json>           MCP servers as JSON string
  --servers-file <path>      Path to JSON file with MCP servers
  --help                     Show this help message

Examples:
  Interactive mode:
    node init-extension.js

  With arguments:
    node init-extension.js --name my-mcp-ext --display-name "My MCP Extension" --publisher myid --description "My extension" --owner @myhandle

  With servers JSON:
    node init-extension.js --name my-ext --servers '{"my-mcp":{"command":"npx","args":["@org/srv"],"transport":{"type":"stdio","framing":"ndjson"}}}'

  With servers from file:
    node init-extension.js --name my-ext --servers-file ./servers.json
`);
}

async function main() {
  const cliArgs = parseArgs();

  if (cliArgs.help) {
    showHelp();
    process.exit(0);
  }

  console.log('Init: Create a new extension from the MCP Generator template');

  // Get values from CLI args or prompt interactively
  let name = cliArgs.name;
  if (!name) {
    name = await ask('Extension name (kebab-case, e.g. my-mcp-extension): ');
  }
  if (!name) { console.log('Aborted: name required'); process.exit(1); }

  let displayName = cliArgs['display-name'];
  if (!displayName) {
    displayName = await ask(`Display name (default: ${name}): `) || name;
  }

  let publisher = cliArgs.publisher;
  if (!publisher) {
    publisher = await ask('Publisher (your npm / marketplace publisher id): ');
  }

  let description = cliArgs.description;
  if (!description) {
    description = await ask('Short description: ');
  }

  let owner = cliArgs.owner;
  if (!owner) {
    owner = await ask('GitHub owner to set in CODEOWNERS (e.g. @your-username): ');
  }

  let servers = {};
  
  // Handle servers from CLI
  if (cliArgs.servers) {
    try {
      servers = JSON.parse(cliArgs.servers);
      console.log(`Loaded ${Object.keys(servers).length} server(s) from --servers argument`);
    } catch (err) {
      console.error('Error parsing --servers JSON:', err.message);
      process.exit(1);
    }
  } else if (cliArgs['servers-file']) {
    try {
      const serversPath = path.resolve(cliArgs['servers-file']);
      const content = fs.readFileSync(serversPath, 'utf8');
      servers = JSON.parse(content);
      console.log(`Loaded ${Object.keys(servers).length} server(s) from ${serversPath}`);
    } catch (err) {
      console.error('Error reading servers file:', err.message);
      process.exit(1);
    }
  } else {
    // Interactive server prompts
    const addServers = (await ask('Add MCP servers now? (y/N): ')).toLowerCase() === 'y';
    if (addServers) {
      while (true) {
        const serverName = await ask('  Server identifier (e.g. my-mcp) or empty to finish: ');
        if (!serverName) break;
        const command = await ask('    Command to run (default: npx): ') || 'npx';
        const argsRaw = await ask('    Space-separated args (e.g. @org/srv@latest) or empty: ');
        const args = argsRaw ? argsRaw.split(/\s+/).filter(Boolean) : [];
        const framing = (await ask('    Framing (ndjson/content-length) [ndjson]: ')) || 'ndjson';
        servers[serverName] = { command, args, transport: { type: 'stdio', framing } };
        console.log(`    Added ${serverName}`);
      }
    }
  }

  // Update package.json
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.name = slugify(name);
  pkg.displayName = displayName;
  if (publisher) pkg.publisher = publisher;
  if (description) pkg.description = description;
  
  // Add repository field from git remote if available
  try {
    const { execSync } = require('child_process');
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (remoteUrl) {
      pkg.repository = {
        type: 'git',
        url: remoteUrl
      };
      console.log('Added repository field from git remote');
    }
  } catch (err) {
    // No git remote, skip
  }
  
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log('Updated package.json');

  // Update CODEOWNERS
  if (owner) {
    const codeownersPath = path.join(process.cwd(), '.github', 'CODEOWNERS');
    let content = '';
    if (fs.existsSync(codeownersPath)) content = fs.readFileSync(codeownersPath, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean).map((l) => l.trim());
    if (!lines.some((l) => l.includes(owner))) {
      lines.push(`* ${owner}`);
      fs.writeFileSync(codeownersPath, lines.join('\n') + '\n', 'utf8');
      console.log('Updated .github/CODEOWNERS');
    } else {
      console.log('Owner already present in CODEOWNERS');
    }
  }

  // Update resources/mcp.json
  const mcpPath = path.join(process.cwd(), 'resources', 'mcp.json');
  const mcp = { servers: servers };
  if (Object.keys(servers).length > 0) {
    fs.writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + '\n', 'utf8');
    console.log('Wrote resources/mcp.json');
  } else {
    if (!fs.existsSync(mcpPath)) fs.writeFileSync(mcpPath, JSON.stringify({ servers: {} }, null, 2) + '\n', 'utf8');
    console.log('No servers added; left resources/mcp.json with empty servers object');
  }

  // Create LICENSE if it doesn't exist
  const licensePath = path.join(process.cwd(), 'LICENSE');
  if (!fs.existsSync(licensePath)) {
    const year = new Date().getFullYear();
    const licenseContent = `MIT License\n\nCopyright (c) ${year}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n`;
    fs.writeFileSync(licensePath, licenseContent, 'utf8');
    console.log('Created LICENSE file');
  }

  console.log('\nDone. Next steps:');
  console.log('- Run `npm install` to ensure deps are installed');
  console.log('- Run `npm run update-tools` to discover tools and populate package.json');
  console.log('- Run `npm run compile` then press F5 to open extension host');
  console.log('\nIf you want, you can run `git init && git add . && git commit -m "scaffold: new extension"` to save your changes.');
}

main().catch((err) => { console.error(err); process.exit(1); });
