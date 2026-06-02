# LanderPilot Trae MCP

This folder was extracted from `ganhuo-ai/plugins/builtin/landerpilot`.

It contains two related surfaces:

- `cloud-proxy.mjs`: a Trae-friendly stdio bridge to the live LanderPilot cloud MCP.
- `server.mjs`: a standalone stdio MCP server that exposes local LanderPilot helper tools.
- `ganhuo-plugin.json`: the original Ganhuo plugin manifest for the live cloud MCP at `https://landerpilot.com/api/mcp`.

## For Trae Students

Install from the private GitHub repo:

```bash
npm install -g github:yuanyuanyuan430/landerpilot-trae-mcp
```

Then open the Trae project folder in Terminal and run:

```bash
landerpilot-trae-setup
```

Paste the LanderPilot API Key when prompted. The setup writes:

```text
.trae/mcp.json
```

Restart Trae, open the MCP panel, and enable/import the project MCP config if Trae asks.

The Trae MCP server command is:

```bash
landerpilot-cloud-mcp
```

It reads `LANDERPILOT_API_KEY` from `.trae/mcp.json` and forwards Trae's stdio MCP calls to `https://landerpilot.com/api/mcp`.

## Local Stdio MCP

Install dependencies:

```bash
npm install
```

Run the local MCP server:

```bash
npm start
```

Client config example:

```json
{
  "mcpServers": {
    "landerpilot_local": {
      "command": "node",
      "args": [
        "/Users/gousansheng/Documents/New project/landerpilot-mcp-extracted/server.mjs"
      ]
    }
  }
}
```

Local tools:

- `list_sites`
- `inspect_site`
- `list_template_slots`
- `prepare_deployment_handoff`
- `get_cloud_mcp_connection`

These local tools do not deploy anything. They inspect/generate local deployment handoff data by wrapping `skills/landerpilot/scripts/local-tools.mjs`.

## Give This Package To Someone Else

Full install guide: [docs/install.md](docs/install.md).
Student quickstart: [docs/student-trae-quickstart.md](docs/student-trae-quickstart.md).
Teacher distribution guide: [docs/teacher-distribution.md](docs/teacher-distribution.md).

Recommended path: put this folder in a GitHub repo, then users install it with npm:

```bash
npm install -g github:yuanyuanyuan430/landerpilot-trae-mcp
```

For Trae, tell students to run the setup helper:

```bash
landerpilot-trae-setup
```

It creates `.trae/mcp.json` for them.

If they want to configure JSON manually, use:

See [mcp.local.example.json](mcp.local.example.json).

For a one-off local install from a folder:

```bash
npm install -g "/path/to/landerpilot-mcp-extracted"
```

For npm registry publishing, remove `"private": true` from `package.json`, choose a package name such as `@your-scope/landerpilot-local-mcp`, then publish:

```bash
npm publish --access public
npm install -g @your-scope/landerpilot-local-mcp
```

Do not ship `node_modules/`. The receiver should install dependencies with `npm install` / `npm install -g`; `node_modules/` is intentionally ignored.

Before sharing, check the package contents:

```bash
npm run pack:check
```

## Cloud MCP

Ganhuo's LanderPilot card points to a live Streamable HTTP MCP server:

```text
https://landerpilot.com/api/mcp
```

Use `mcp.remote.example.json` as the client config shape. It requires a LanderPilot API key:

```bash
export LANDERPILOT_API_KEY="lp_..."
```

The cloud server owns the deployment tools such as `inspect_project`, `create_or_update_site_project`, `prepare_artifact_upload`, `complete_artifact_upload`, `deploy_site`, `get_deployment_status`, `provision_site_resource`, `run_site_d1`, `upload_site_asset`, `bind_site_domain`, and `rollback_deployment`.
