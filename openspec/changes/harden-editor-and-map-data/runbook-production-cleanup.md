# Runbook — one-time production cleanup (VPS)

Deleting rows from the committed `data/endead.db` only fixes fresh installs. The
live database lives in the Docker volume `endea_endead-data`, seeded once and
never overwritten by a pull, so production needs this one-time pass.

Run it **after** the code is deployed, because step 4 uses the new `playable`
flag and step 5 uses the new write auth.

Destructive: step 2 is the only way back. Do not skip it.

## 1. Set the secret and deploy

On the VPS:

```bash
cd /opt/endea
printf 'EDITOR_SECRET=%s\n' '<pick a long random value>' > endead.env
chmod 600 endead.env
# docker-compose.yml already carries `env_file: ./endead.env` for the endead service
./deploy.sh endead
```

## 2. Back up the volume

```bash
cd /opt/endea
docker compose stop endead
docker run --rm -v endea_endead-data:/data -v /opt/endea/backups:/backup alpine \
  tar czf /backup/endead-data-$(date +%Y%m%d-%H%M%S).tgz -C /data .
ls -la /opt/endea/backups
docker compose up -d --no-deps endead
```

The container is stopped for the copy so SQLite is not mid-write.

## 3. Confirm the gate is live

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://endead.endea.ar/api/maps \
  -H 'Content-Type: application/json' -d '{"name":"probe","tiles":[]}'   # expect 401
curl -s -o /dev/null -w '%{http_code}\n' https://endead.endea.ar/api/maps  # expect 200
```

## 4. List what is actually stored

Production's maps are not necessarily the local ones — look before deleting.

```bash
curl -s https://endead.endea.ar/api/maps | jq -r '.[] | "\(.id)\t\(.playable)\t\(.name)"'
```

## 5. Delete the unplayable ones, by explicit id

One command per id taken from step 4, never a loop over a predicate.

```bash
SECRET=$(grep -oP '(?<=^EDITOR_SECRET=).*' /opt/endea/endead.env)
curl -s -X DELETE https://endead.endea.ar/api/maps/<id> -H "x-editor-secret: $SECRET"
```

## 6. Verify

```bash
curl -s https://endead.endea.ar/api/maps | jq -r '.[] | "\(.id)\t\(.playable)\t\(.name)"'
```

Every remaining row must read `true`, and at least one must remain — the lobby
cannot start a game otherwise. If nothing playable survives, restore the backup
from step 2 and save a working map from the editor before retrying.

## Rollback

```bash
cd /opt/endea
docker compose stop endead
docker run --rm -v endea_endead-data:/data -v /opt/endea/backups:/backup alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/<the-backup>.tgz -C /data'
docker compose up -d --no-deps endead
```

Removing the `env_file: ./endead.env` line and redeploying restores the previous
(unauthenticated) behaviour if the gate itself has to come off in a hurry.
