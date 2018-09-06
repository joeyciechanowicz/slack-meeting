# Github Token Scope
Requires the full repo scope (personal access token)

# Usage

`/meeting start | next | end`

# Development

Copy `config.default.json` and fill out all the fields. 

### Local dev
1. Comment out `socketPath: '/cloudsql/' + connectionName,` in `index.js`
1. Uncomment `// host: 'localhost',` in `index.js`
1. Run `npm run proxy`
1. Run `node test-harness.js`

# Licence
MIT Licenced, see LICENCE.md
