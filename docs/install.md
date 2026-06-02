# Install LanderPilot MCP For Trae

## Option A: Install From A GitHub Repo

Put this folder in a GitHub repository. Users can install it globally:

```bash
npm install -g github:yuanyuanyuan430/landerpilot-trae-mcp
```

For a private GitHub repository, the user must already have GitHub access configured for npm/git.

Then, inside the Trae project folder:

```bash
landerpilot-trae-setup
```

Paste the LanderPilot API Key. The setup writes `.trae/mcp.json`.

Manual Trae MCP config:

```json
{
  "mcpServers": {
    "landerpilot": {
      "command": "landerpilot-cloud-mcp",
      "args": [],
      "env": {
        "LANDERPILOT_API_KEY": "粘贴你的 LanderPilot API Key"
      }
    }
  }
}
```

Restart Trae, open the MCP panel, and enable/import the project `.trae/mcp.json` config if Trae asks.

Verify the installed commands:

```bash
landerpilot-cloud-mcp
landerpilot-local-mcp
```

These commands are stdio MCP servers, so they wait for MCP JSON-RPC messages. Use Trae, or run this inside the package during development:

```bash
npm run inspect
npm run smoke
```

## Option B: Install From A Local Folder

```bash
npm install -g "/path/to/landerpilot-mcp-extracted"
```

Then use the same MCP config as Option A.

## Option C: Publish To npm

Only do this if you intend to distribute publicly or within an npm organization.

1. Change `package.json`:
   - remove `"private": true`
   - change `"name"` to something publishable, for example `@your-scope/landerpilot-local-mcp`
   - change `"license"` if needed

2. Publish:

```bash
npm publish --access public
```

3. Users install:

```bash
npm install -g @your-scope/landerpilot-local-mcp
```

## Do Not Ship `node_modules`

`node_modules/` is intentionally ignored. npm installs dependencies for the user.

Before sharing a zip or committing to GitHub:

```bash
rm -rf node_modules
npm pack --dry-run
npm run verify:distribution
```
