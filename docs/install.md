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
It also writes Trae CN's global `User/mcp.json`, because some Trae builds do not auto-load project MCP config immediately.

Manual Trae MCP config:

```json
{
  "mcpServers": {
    "landerpilot": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/landerpilot-trae-mcp/cloud-proxy.mjs"],
      "env": {
        "LANDERPILOT_API_KEY": "粘贴你的 LanderPilot API Key"
      }
    }
  }
}
```

Fully quit and reopen Trae. Then ask Trae:

```text
请调用 landerpilot_connection_status 检查连接。
```

Verify the installed commands:

```bash
landerpilot-trae-doctor
```

For development checks inside the package:

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
