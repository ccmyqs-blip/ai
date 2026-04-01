# Cloudflare Deployment Steps

## 1) Install and login

```bash
npm i -g wrangler
wrangler login
```

## 2) Enter worker folder

```bash
cd cf-alias-worker
```

## 3) Create KV namespaces

```bash
wrangler kv namespace create ALIAS_MAP
wrangler kv namespace create ALIAS_MAP --preview
```

Copy `id` and `preview_id` into `wrangler.toml`.

## 4) Configure secrets

```bash
wrangler secret put ADMIN_PASSWORD
wrangler secret put TARGET_API_BASE
```

- `ADMIN_PASSWORD`: Cc123123.
- `TARGET_API_BASE`: https://gpt.86gamestore.com/api

## 5) Deploy worker

```bash
wrangler deploy
```

You will get a URL like:

`https://alias-service.<subdomain>.workers.dev`

## 6) Hidden admin page

Open:

`https://alias-service.<subdomain>.workers.dev/_hidden/alias-admin`

Use password `Cc123123.` to generate alias CDKEY.

## 7) Point frontend to worker

In your site HTML, before `app.js`:

```html
<script>
  window.GPT_SHELL_CONFIG = {
    aliasApiBaseUrl: "https://alias-service.<subdomain>.workers.dev/v1/alias"
  };
</script>
```
