# Alias CDKEY Service

Independent backend service for alias CDKEY mapping.
Public site uses only alias CDKEY for check/activate.
The real CDKEY is stored server-side and never exposed in frontend input.

## Start

```bash
cd alias-service
node server.js
```

Defaults:
- Port: `4190`
- Target API base: `https://gpt.86gamestore.com/api`
- Admin password: `Cc123123.`

Optional env vars:
- `PORT`
- `TARGET_API_BASE`
- `ADMIN_PASSWORD`

## Hidden Admin Page

- URL: `/_hidden/alias-admin`
- Function: generate non-repeating alias CDKEY from a real CDKEY
- Requires admin password on each request

## API

### Health

`GET /v1/health`

### Create Alias CDKEY (admin only)

`POST /v1/admin/alias/create`

Header:
- `X-Admin-Password: Cc123123.`

Body:
```json
{
  "cdkey": "REAL-CDKEY-XXXXX"
}
```

### Check with Alias CDKEY

`POST /v1/alias/check`

Body:
```json
{
  "alias_cdkey": "5S8F-S888G-5G5G-55HH"
}
```

Behavior:
- If alias not found: `success=false`, `msg=未检测到CDKEY`
- If alias found: service calls target `/api/check` using mapped real CDKEY and returns `target_result`

### Activate with Alias CDKEY

`POST /v1/alias/activate`

Body:
```json
{
  "alias_cdkey": "5S8F-S888G-5G5G-55HH",
  "session_info": "{...}"
}
```

Behavior:
- If alias not found: `success=false`, `msg=未检测到CDKEY`
- If alias found: service calls target `/api/activate` using mapped real CDKEY and returns `target_result`

## Storage

Mappings are stored in `alias-map.json` (ignored by git).
Keep this file private.
