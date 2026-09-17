## ADDED Requirements

### Requirement: Write APIs require a secret
Every endpoint that creates, replaces or deletes a map or a tile definition SHALL reject a request that does not carry the configured editor secret. The endpoints are `POST /api/maps`, `DELETE /api/maps/:id`, `POST /api/tile-definitions`, `DELETE /api/tile-definitions` and `POST /api/tile-definitions/import`.

#### Scenario: Unauthenticated write
- **WHEN** a request reaches any of those five endpoints without the secret
- **THEN** the server responds `401` and the stored maps and tile definitions are unchanged

#### Scenario: Authenticated write
- **WHEN** a request carries the configured secret and a valid payload
- **THEN** the write succeeds exactly as it did before this change

#### Scenario: No secret configured
- **WHEN** the server runs with no editor secret in its environment
- **THEN** every write endpoint responds `401`

### Requirement: Read APIs stay public
The endpoints the lobby depends on SHALL remain reachable without a secret.

#### Scenario: Lobby lists maps
- **WHEN** a player opens the lobby with no secret configured in their browser
- **THEN** `GET /api/maps` and `GET /api/tile-definitions` respond normally and the map list renders

### Requirement: The editor asks for the secret before it loads
Opening the editor entry point SHALL require the secret before the editor mounts.

#### Scenario: Wrong secret
- **WHEN** a visitor opens `/editor` and supplies no secret or a wrong one
- **THEN** the editor does not mount and no editing surface is shown

#### Scenario: Correct secret
- **WHEN** the map author supplies the correct secret
- **THEN** the editor mounts and its writes are accepted for that session without re-prompting on every save
